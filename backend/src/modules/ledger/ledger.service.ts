import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import { Database } from '../../database/database.module';
import { ledgerEntries } from '../../database/schema';

export interface AppendLedgerEntryInput {
  customerId?: string | null;
  transactionId?: string | null;
  entryType: string;
  direction: 'CREDIT' | 'DEBIT' | 'NEUTRAL';
  amount: string;
  currency?: string;
  reference: string;
  narration: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LedgerService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async append(input: AppendLedgerEntryInput) {
    const values = {
      customerId: input.customerId,
      transactionId: input.transactionId,
      entryType: input.entryType,
      direction: input.direction,
      amount: input.amount,
      currency: input.currency ?? 'NGN',
      reference: input.reference,
      narration: input.narration,
      metadata: input.metadata ?? {},
    };

    const [entry] = await this.db.insert(ledgerEntries).values(values).onConflictDoNothing().returning();
    if (entry) {
      return entry;
    }

    const [existing] = await this.db.select().from(ledgerEntries).where(eq(ledgerEntries.reference, input.reference)).limit(1);
    return existing;
  }
}