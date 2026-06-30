import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import { Database } from '../../database/database.module';
import { reconciliationCases, reconciliationDecisions, transactionEvents, transactions } from '../../database/schema';

@Injectable()
export class TransactionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findOne(id: string) {
    const [transaction] = await this.db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async status(id: string) {
    const transaction = await this.findOne(id);
    const [decision] = await this.db.select().from(reconciliationDecisions).where(eq(reconciliationDecisions.transactionId, id)).limit(1);
    const [reconciliationCase] = await this.db.select().from(reconciliationCases).where(eq(reconciliationCases.transactionId, id)).limit(1);
    const events = await this.db.select().from(transactionEvents).where(eq(transactionEvents.transactionId, id));
    return { transaction, decision, reconciliationCase, events };
  }
}