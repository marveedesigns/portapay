import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DRIZZLE } from '../database/database.tokens';
import { Database } from '../database/database.module';
import { providerEvents, webhookEvents } from '../database/schema';
import { NombaProvider } from '../providers/nomba/nomba.provider';
import { queueNames } from '../queues/queue-names';

interface WebhookMeta {
  rawBody?: string;
  signature?: string;
  timestamp?: string;
  signatureAlgorithm?: string;
  signatureVersion?: string;
}

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 10 * 60 * 1000;

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly nomba: NombaProvider,
    @InjectQueue(queueNames.verification) private readonly verificationQueue: Queue,
  ) {}

  async receiveProviderWebhook(provider: 'nomba', payload: Record<string, unknown>, meta: WebhookMeta) {
    const transaction = (payload as any).data?.transaction ?? {};
    const providerEventId = String(payload.requestId ?? payload.id ?? payload.eventId ?? transaction.transactionId ?? transaction.sessionId ?? crypto.randomUUID());
    const signatureHeadersSupported = this.supportsNombaSignatureHeaders(meta);
    const signatureValid = signatureHeadersSupported ? await this.nomba.verifyWebhook(payload, meta.signature, meta.timestamp) : false;
    const replayProtected = this.isFreshTimestamp(meta.timestamp);
    const processingStatus = !signatureHeadersSupported
      ? 'SIGNATURE_HEADER_UNSUPPORTED'
      : !signatureValid
        ? 'SIGNATURE_FAILED'
        : !replayProtected
          ? 'REPLAY_REJECTED'
          : 'RECEIVED';

    const [webhook] = await this.db.insert(webhookEvents).values({
      provider,
      providerEventId,
      signatureValid,
      replayProtected,
      processingStatus,
      payload: {
        ...payload,
        _rawBodyPresent: Boolean(meta.rawBody),
        _signatureAlgorithm: meta.signatureAlgorithm,
        _signatureVersion: meta.signatureVersion,
      },
    }).onConflictDoNothing().returning();

    await this.db.insert(providerEvents).values({
      provider,
      providerEventId,
      eventType: String((payload as any).event_type ?? payload.event ?? payload.type ?? 'unknown'),
      payload,
    }).onConflictDoNothing();

    if (webhook && signatureHeadersSupported && signatureValid && replayProtected) {
      await this.verificationQueue.add('verify-provider-transaction', {
        provider,
        providerEventId,
        webhookEventId: webhook.id,
      });
    }

    return { accepted: true, duplicate: !webhook, signatureValid, replayProtected, signatureHeadersSupported };
  }

  private supportsNombaSignatureHeaders(meta: WebhookMeta) {
    const algorithm = meta.signatureAlgorithm?.trim().toLowerCase();
    if (algorithm && algorithm !== 'hmacsha256') {
      return false;
    }

    const version = meta.signatureVersion?.trim();
    if (version && version !== '1.0.0') {
      return false;
    }

    return true;
  }

  private isFreshTimestamp(timestamp?: string) {
    if (!timestamp) return false;
    const parsed = Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return false;
    const timestampMs = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
    return Math.abs(Date.now() - timestampMs) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
  }
}
