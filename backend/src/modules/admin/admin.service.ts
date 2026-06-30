import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { DRIZZLE } from '../../database/database.tokens';
import { Database } from '../../database/database.module';
import { apiKeys, auditLogs, customers, ledgerEntries, reconciliationCases, transactions, virtualAccounts, webhookDeliveries, webhookEvents, webhookSubscriptions } from '../../database/schema';
import { queueNames } from '../../queues/queue-names';
import { CreateApiKeyDto, CreateWebhookSubscriptionDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(queueNames.verification) private readonly verificationQueue: Queue,
    @InjectQueue(queueNames.reconciliation) private readonly reconciliationQueue: Queue,
    @InjectQueue(queueNames.webhookDispatch) private readonly webhookDispatchQueue: Queue,
  ) {}

  async dashboard() {
    const [customerRows, accountRows, transactionRows, caseRows, webhookRows, ledgerRows, auditRows, deliveryRows, queueHealth] = await Promise.all([
      this.db.select().from(customers),
      this.db.select().from(virtualAccounts),
      this.db.select().from(transactions),
      this.db.select().from(reconciliationCases),
      this.db.select().from(webhookEvents),
      this.db.select().from(ledgerEntries),
      this.db.select().from(auditLogs),
      this.db.select().from(webhookDeliveries),
      this.queueHealth(),
    ]);
    const reconciled = transactionRows.filter((tx) => tx.status === 'RECONCILED').length;
    const reconciliationRate = transactionRows.length ? Math.round((reconciled / transactionRows.length) * 1000) / 10 : 0;

    const latest = <T extends { createdAt?: Date | string | null }>(rows: T[], limit = 25) => rows
      .slice()
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
      .slice(0, limit);
    const openCases = caseRows.filter((item) => ['OPEN', 'UNDER_REVIEW', 'AWAITING_PROOF'].includes(item.status));

    return {
      metrics: {
        customers: customerRows.length,
        virtualAccounts: accountRows.length,
        transactions: transactionRows.length,
        openCases: openCases.length,
        reconciliationRate,
        webhookFailures: webhookRows.filter((item) => ['SIGNATURE_FAILED', 'SIGNATURE_HEADER_UNSUPPORTED', 'REPLAY_REJECTED'].includes(item.processingStatus)).length,
        downstreamWebhookFailures: deliveryRows.filter((item) => item.status === 'FAILED').length,
      },
      customers: latest(customerRows),
      virtualAccounts: latest(accountRows),
      transactions: latest(transactionRows),
      reconciliationCases: latest(caseRows),
      openCases: latest(openCases),
      ledgerEntries: latest(ledgerRows),
      auditLogs: latest(auditRows),
      webhookEvents: latest(webhookRows),
      webhookDeliveries: latest(deliveryRows),
      recentTransactions: latest(transactionRows, 10),
      recentLedgerEntries: latest(ledgerRows, 10),
      recentAuditLogs: latest(auditRows, 10),
      queueHealth,
    };
  }

  async createApiKey(dto: CreateApiKeyDto) {
    const plainKey = `pp_${dto.environment ?? 'sandbox'}_${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(plainKey).digest('hex');
    const [record] = await this.db.insert(apiKeys).values({
      name: dto.name,
      keyHash,
      environment: dto.environment ?? 'sandbox',
    }).returning({ id: apiKeys.id, name: apiKeys.name, environment: apiKeys.environment, createdAt: apiKeys.createdAt });
    await this.audit('API_KEY_CREATED', 'api_key', record.id, { name: dto.name, environment: record.environment });
    return { ...record, apiKey: plainKey };
  }

  async createWebhookSubscription(dto: CreateWebhookSubscriptionDto) {
    const signingSecret = `whsec_${randomBytes(32).toString('base64url')}`;
    const secretHash = createHash('sha256').update(signingSecret).digest('hex');
    const [subscription] = await this.db.insert(webhookSubscriptions).values({
      name: dto.name,
      targetUrl: dto.targetUrl,
      secretHash,
      signingSecretEncrypted: this.encryptSecret(signingSecret),
      events: dto.events ?? ['transaction.reconciled', 'transaction.manual_review_required', 'transaction.rejected', 'account.created'],
      environment: dto.environment ?? 'sandbox',
    }).returning();
    await this.audit('WEBHOOK_SUBSCRIPTION_CREATED', 'webhook_subscription', subscription.id, { name: dto.name, targetUrl: dto.targetUrl });
    return { ...subscription, signingSecret };
  }

  private async queueHealth() {
    const queues = [this.verificationQueue, this.reconciliationQueue, this.webhookDispatchQueue];
    return Promise.all(queues.map(async (queue) => {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        return { name: queue.name, status: 'up', waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0 };
      } catch (error) {
        return { name: queue.name, status: 'down', waiting: 0, active: 0, delayed: 0, failed: 0, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }));
  }

  private encryptSecret(secret: string) {
    const keyMaterial = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? process.env.JWT_ACCESS_SECRET ?? 'portapay-local-webhook-secret';
    const key = createHash('sha256').update(keyMaterial).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  private async audit(eventType: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    await this.db.insert(auditLogs).values({ actorType: 'admin', eventType, entityType, entityId, metadata });
  }
}
