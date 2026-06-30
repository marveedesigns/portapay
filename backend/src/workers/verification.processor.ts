import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.tokens';
import { Database } from '../database/database.module';
import { transactionEvents, transactions, virtualAccounts, webhookEvents } from '../database/schema';
import { NombaProvider } from '../providers/nomba/nomba.provider';
import { queueNames } from '../queues/queue-names';

interface VerificationJob {
  provider: 'nomba';
  providerEventId: string;
  webhookEventId: string;
}

@Injectable()
@Processor(queueNames.verification)
export class VerificationProcessor extends WorkerHost {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly nomba: NombaProvider,
    @InjectQueue(queueNames.reconciliation) private readonly reconciliationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<VerificationJob>) {
    const [webhook] = await this.db.select().from(webhookEvents).where(eq(webhookEvents.id, job.data.webhookEventId)).limit(1);
    const verified = await this.nomba.verifyTransaction(job.data.providerEventId, webhook?.payload);
    const [account] = await this.db.select().from(virtualAccounts).where(eq(virtualAccounts.accountNumber, verified.recipientAccountNumber)).limit(1);

    const [transaction] = await this.db.insert(transactions).values({
      virtualAccountId: account?.id,
      customerId: account?.customerId,
      provider: job.data.provider,
      providerReference: verified.providerReference,
      nombaReference: verified.nombaReference,
      amount: verified.amount,
      currency: verified.currency,
      senderName: verified.senderName,
      senderAccountNumber: verified.senderAccountNumber,
      recipientAccountNumber: verified.recipientAccountNumber,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      metadata: verified.metadata ?? {},
    }).onConflictDoNothing().returning();

    if (transaction) {
      await this.db.insert(transactionEvents).values({
        transactionId: transaction.id,
        eventType: 'PAYMENT_VERIFIED',
        actor: 'system',
        metadata: { providerEventId: job.data.providerEventId },
      });
      await this.reconciliationQueue.add('reconcile-transaction', { transactionId: transaction.id });
    }
  }
}