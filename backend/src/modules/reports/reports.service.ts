import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.tokens';
import type { Database } from '../../database/database.module';
import { ledgerEntries, reconciliationCases, reconciliationDecisions, transactions } from '../../database/schema';

@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async reconciliationSummary() {
    const [transactionRows, decisionRows, caseRows, ledgerRows] = await Promise.all([
      this.db.select().from(transactions),
      this.db.select().from(reconciliationDecisions),
      this.db.select().from(reconciliationCases),
      this.db.select().from(ledgerEntries),
    ]);

    const creditedTotal = ledgerRows
      .filter((entry) => entry.direction === 'CREDIT')
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const byOutcome = decisionRows.reduce<Record<string, number>>((acc, decision) => {
      acc[decision.outcome] = (acc[decision.outcome] ?? 0) + 1;
      return acc;
    }, {});
    const byStatus = transactionRows.reduce<Record<string, number>>((acc, transaction) => {
      acc[transaction.status] = (acc[transaction.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        transactions: transactionRows.length,
        decisions: decisionRows.length,
        openCases: caseRows.filter((item) => ['OPEN', 'UNDER_REVIEW', 'AWAITING_PROOF'].includes(item.status)).length,
        creditedTotal: creditedTotal.toFixed(2),
        currency: 'NGN',
      },
      byOutcome,
      byStatus,
      recentCases: caseRows.slice(-20).reverse(),
    };
  }
}