import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.tokens';
import type { Database } from '../database/database.module';
import { webhookDeliveries, webhookSubscriptions } from '../database/schema';
import { queueNames } from '../queues/queue-names';

@Injectable()
export class DownstreamWebhooksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(queueNames.webhookDispatch) private readonly webhookDispatchQueue: Queue,
  ) {}

  async emit(eventType: string, payload: Record<string, unknown>) {
    const subscriptions = await this.db.select().from(webhookSubscriptions);
    const matching = subscriptions.filter((subscription) => {
      if (!subscription.isActive) return false;
      const events = Array.isArray(subscription.events) ? subscription.events as string[] : [];
      return events.includes(eventType) || events.includes('*');
    });

    const deliveries = [];
    for (const subscription of matching) {
      const [delivery] = await this.db.insert(webhookDeliveries).values({
        subscriptionId: subscription.id,
        eventType,
        payload,
        nextAttemptAt: new Date(),
      }).returning();
      await this.webhookDispatchQueue.add('dispatch-downstream-webhook', { deliveryId: delivery.id });
      deliveries.push(delivery);
    }
    return deliveries;
  }

  async dispatch(deliveryId: string) {
    const [delivery] = await this.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1);
    if (!delivery) throw new NotFoundException('Webhook delivery not found');
    const [subscription] = await this.db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, delivery.subscriptionId)).limit(1);
    if (!subscription || !subscription.isActive) throw new NotFoundException('Webhook subscription not found');

    const payload = {
      id: delivery.id,
      event: delivery.eventType,
      createdAt: new Date().toISOString(),
      data: delivery.payload,
    };
    const body = JSON.stringify(payload);
    const secret = this.decryptSecret(subscription.signingSecretEncrypted);
    const signature = createHmac('sha256', secret).update(body).digest('base64');

    try {
      const response = await fetch(subscription.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PortaPay-Event': delivery.eventType,
          'PortaPay-Signature': signature,
        },
        body,
      });
      await this.db.update(webhookDeliveries).set({
        status: response.ok ? 'DELIVERED' : 'FAILED',
        attempts: delivery.attempts + 1,
        lastStatusCode: response.status,
        lastError: response.ok ? null : await response.text(),
        deliveredAt: response.ok ? new Date() : null,
        nextAttemptAt: response.ok ? null : new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      }).where(eq(webhookDeliveries.id, delivery.id));
      if (!response.ok && delivery.attempts + 1 < 5) {
        await this.webhookDispatchQueue.add('dispatch-downstream-webhook', { deliveryId }, { delay: 60_000 });
      }
    } catch (error) {
      await this.db.update(webhookDeliveries).set({
        status: 'FAILED',
        attempts: delivery.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Unknown dispatch error',
        nextAttemptAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      }).where(eq(webhookDeliveries.id, delivery.id));
      if (delivery.attempts + 1 < 5) {
        await this.webhookDispatchQueue.add('dispatch-downstream-webhook', { deliveryId }, { delay: 60_000 });
      }
    }
  }

  private decryptSecret(encrypted: string) {
    const [ivText, tagText, cipherText] = encrypted.split('.');
    const keyMaterial = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? process.env.JWT_ACCESS_SECRET ?? 'portapay-local-webhook-secret';
    const key = createHash('sha256').update(keyMaterial).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64url')), decipher.final()]).toString('utf8');
  }
}