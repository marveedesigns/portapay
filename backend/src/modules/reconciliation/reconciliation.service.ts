import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import { Database } from '../../database/database.module';
import {
  auditLogs,
  customerIdentityHistory,
  customers,
  reconciliationCases,
  reconciliationDecisions,
  transactionEvents,
  transactions,
  virtualAccounts,
} from '../../database/schema';
import { DownstreamWebhooksService } from '../../webhooks/downstream-webhooks.service';
import { LedgerService } from '../ledger/ledger.service';

type CaseAction = 'approve-credit' | 'reject-refund-required' | 'request-proof' | 'mark-duplicate' | 'mark-suspicious';
type ReconciliationOutcome = 'AUTO_RECONCILED' | 'MANUAL_REVIEW' | 'PENDING_VERIFICATION' | 'DUPLICATE_EVENT' | 'MISDIRECTED_PAYMENT' | 'KYC_REVIEW_REQUIRED' | 'REJECTED' | 'REFUND_REQUIRED';

const KYC_LIMITS: Record<string, number> = {
  TIER_1: 50000,
  TIER_2: 200000,
  TIER_3: 5000000,
  TIER_4: Number.MAX_SAFE_INTEGER,
};

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ledger: LedgerService,
    private readonly downstreamWebhooks: DownstreamWebhooksService,
  ) {}

  previewScore(input: Record<string, unknown>) {
    const accountStatus = String(input.accountStatus ?? (input.accountActive === false ? 'CLOSED' : 'ACTIVE'));
    const customerActive = input.customerActive !== undefined
      ? input.customerActive === true
      : input.customerStatus !== 'RESTRICTED';
    const transactionVerified = input.transactionVerified === true || input.providerVerified === true;
    const nameMatched = input.nameMatched === true || input.senderNameMatched === true;

    return this.score({
      accountStatus,
      customerActive,
      transactionVerified,
      duplicate: input.duplicate === true,
      nameMatched,
      kycAllowed: input.kycAllowed !== false,
      accountFound: input.accountFound !== false,
    });
  }

  async listCases() {
    return this.db.select().from(reconciliationCases);
  }

  async reconcileTransaction(transactionId: string) {
    const [transaction] = await this.db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const [account] = await this.db.select().from(virtualAccounts).where(eq(virtualAccounts.accountNumber, transaction.recipientAccountNumber)).limit(1);
    const [customer] = account?.customerId
      ? await this.db.select().from(customers).where(eq(customers.id, account.customerId)).limit(1)
      : [];
    const history = customer?.id
      ? await this.db.select().from(customerIdentityHistory).where(eq(customerIdentityHistory.customerId, customer.id))
      : [];

    const amount = Number(transaction.amount);
    const identityNames = [customer?.fullName, ...history.filter((entry) => entry.fieldName === 'fullName' && entry.allowPreviousValueForMatching).map((entry) => entry.newValue)].filter(Boolean) as string[];
    const nameMatched = this.nameMatches(transaction.senderName ?? '', identityNames);
    const kycAllowed = customer ? amount <= KYC_LIMITS[customer.kycTier] : false;
    const duplicate = transaction.status === 'DUPLICATE';

    const score = this.score({
      accountStatus: account?.status ?? '',
      customerActive: customer?.status === 'ACTIVE',
      transactionVerified: Boolean(transaction.verifiedAt),
      duplicate,
      nameMatched,
      kycAllowed,
      accountFound: Boolean(account),
    });
    const outcome = this.outcome(score.confidenceScore, {
      accountFound: Boolean(account),
      accountStatus: account?.status,
      duplicate,
      kycAllowed,
      nameMatched,
      verified: Boolean(transaction.verifiedAt),
    });

    const decisionValues = {
      transactionId,
      outcome,
      confidenceScore: score.confidenceScore,
      rulesApplied: score.rulesApplied,
      decisionReason: score.reason,
    };
    const [decision] = await this.db.insert(reconciliationDecisions).values(decisionValues).onConflictDoUpdate({
      target: reconciliationDecisions.transactionId,
      set: {
        outcome,
        confidenceScore: score.confidenceScore,
        rulesApplied: score.rulesApplied,
        decisionReason: score.reason,
        updatedAt: new Date(),
      },
    }).returning();

    if (outcome === 'AUTO_RECONCILED' && account?.customerId) {
      await this.ledger.append({
        customerId: account.customerId,
        transactionId,
        entryType: 'CUSTOMER_CREDITED',
        direction: 'CREDIT',
        amount: transaction.amount,
        currency: transaction.currency,
        reference: `ledger_${transaction.providerReference}`,
        narration: 'Customer credited after automatic reconciliation',
        metadata: { confidenceScore: score.confidenceScore, rulesApplied: score.rulesApplied },
      });
      await this.db.update(transactions).set({ status: 'RECONCILED', updatedAt: new Date() }).where(eq(transactions.id, transactionId));
      await this.event(transactionId, 'PAYMENT_RECONCILED', { outcome, confidenceScore: score.confidenceScore });
      await this.downstreamWebhooks.emit('transaction.reconciled', { transactionId, customerId: account.customerId, amount: transaction.amount, currency: transaction.currency, confidenceScore: score.confidenceScore });
    } else {
      await this.db.insert(reconciliationCases).values({
        transactionId,
        reasonCode: outcome,
        reason: score.reason,
        recommendedAction: this.recommendedAction(outcome),
        metadata: { confidenceScore: score.confidenceScore, rulesApplied: score.rulesApplied },
      }).onConflictDoNothing();
      await this.db.update(transactions).set({ status: outcome === 'REJECTED' ? 'REJECTED' : 'MANUAL_REVIEW', updatedAt: new Date() }).where(eq(transactions.id, transactionId));
      await this.event(transactionId, 'PAYMENT_FLAGGED', { outcome, confidenceScore: score.confidenceScore });
      await this.downstreamWebhooks.emit(outcome === 'REJECTED' ? 'transaction.rejected' : 'transaction.manual_review_required', { transactionId, outcome, amount: transaction.amount, currency: transaction.currency, confidenceScore: score.confidenceScore });
    }

    return decision;
  }

  async resolveCase(caseId: string, action: CaseAction) {
    const [reconciliationCase] = await this.db.select().from(reconciliationCases).where(eq(reconciliationCases.id, caseId)).limit(1);
    if (!reconciliationCase) {
      throw new NotFoundException('Reconciliation case not found');
    }
    const [transaction] = await this.db.select().from(transactions).where(eq(transactions.id, reconciliationCase.transactionId)).limit(1);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (action === 'approve-credit') {
      await this.ledger.append({
        customerId: transaction.customerId,
        transactionId: transaction.id,
        entryType: 'ADMIN_OVERRIDE',
        direction: 'CREDIT',
        amount: transaction.amount,
        currency: transaction.currency,
        reference: `manual_${caseId}`,
        narration: 'Customer credited by admin case approval',
        metadata: { caseId, action },
      });
      await this.db.update(transactions).set({ status: 'RECONCILED', updatedAt: new Date() }).where(eq(transactions.id, transaction.id));
    }

    const status = action === 'request-proof' ? 'AWAITING_PROOF' : action === 'approve-credit' ? 'APPROVED' : action === 'mark-suspicious' ? 'UNDER_REVIEW' : 'RESOLVED';
    const [updated] = await this.db.update(reconciliationCases).set({
      status,
      resolvedAt: status === 'RESOLVED' || status === 'APPROVED' ? new Date() : null,
      metadata: { ...(reconciliationCase.metadata as Record<string, unknown>), lastAction: action },
      updatedAt: new Date(),
    }).where(eq(reconciliationCases.id, caseId)).returning();

    await this.db.insert(auditLogs).values({
      actorType: 'admin',
      eventType: 'ADMIN_OVERRIDE',
      entityType: 'reconciliation_case',
      entityId: caseId,
      metadata: { action, transactionId: transaction.id },
    });
    await this.event(transaction.id, 'ADMIN_OVERRIDE', { caseId, action });
    await this.downstreamWebhooks.emit('reconciliation.case_updated', { caseId, transactionId: transaction.id, action, status });
    return updated;
  }

  private score(input: {
    accountStatus: string;
    customerActive: boolean;
    transactionVerified: boolean;
    duplicate: boolean;
    nameMatched: boolean;
    kycAllowed: boolean;
    accountFound: boolean;
  }) {
    const rulesApplied: Array<{ rule: string; points: number }> = [];
    let confidenceScore = 0;
    const apply = (rule: string, points: number) => {
      confidenceScore += points;
      rulesApplied.push({ rule, points });
    };

    apply('account_found', input.accountFound ? 15 : -40);
    apply('account_status', input.accountStatus === 'ACTIVE' ? 20 : -35);
    apply('customer_status', input.customerActive ? 15 : -25);
    apply('transaction_verification', input.transactionVerified ? 25 : -30);
    apply('duplicate_detection', input.duplicate ? -100 : 10);
    apply('kyc_limit', input.kycAllowed ? 10 : -30);
    apply('name_signal', input.nameMatched ? 15 : -10);

    confidenceScore = Math.max(0, Math.min(100, confidenceScore));
    return { confidenceScore, rulesApplied, reason: `Confidence score ${confidenceScore} from account, customer, verification, duplicate, KYC, ownership, and name signals.` };
  }

  private outcome(score: number, facts: { accountFound: boolean; accountStatus?: string; duplicate: boolean; kycAllowed: boolean; nameMatched: boolean; verified: boolean }): ReconciliationOutcome {
    if (facts.duplicate) return 'DUPLICATE_EVENT';
    if (!facts.verified) return 'PENDING_VERIFICATION';
    if (!facts.accountFound || facts.accountStatus === 'CLOSED' || facts.accountStatus === 'EXPIRED') return 'MISDIRECTED_PAYMENT';
    if (facts.accountStatus === 'RESTRICTED' || !facts.kycAllowed) return 'KYC_REVIEW_REQUIRED';
    if (!facts.nameMatched) return 'MANUAL_REVIEW';
    if (score >= 90) return 'AUTO_RECONCILED';
    if (score >= 40) return 'MANUAL_REVIEW';
    return 'REJECTED';
  }

  private recommendedAction(outcome: string) {
    if (outcome === 'MISDIRECTED_PAYMENT' || outcome === 'REJECTED') return 'REJECT_OR_REFUND';
    if (outcome === 'KYC_REVIEW_REQUIRED') return 'REQUEST_KYC_REVIEW';
    if (outcome === 'DUPLICATE_EVENT') return 'MARK_DUPLICATE';
    return 'MANUAL_REVIEW';
  }

  private nameMatches(senderName: string, candidates: string[]) {
    const sender = this.normalizeName(senderName);
    if (!sender) return false;
    return candidates.some((candidate) => {
      const normalized = this.normalizeName(candidate);
      if (!normalized) return false;
      if (sender === normalized) return true;
      const senderParts = new Set(sender.split(' '));
      const candidateParts = normalized.split(' ');
      const matches = candidateParts.filter((part) => senderParts.has(part)).length;
      return candidateParts.length > 0 && matches / candidateParts.length >= 0.75;
    });
  }

  private normalizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').sort().join(' ');
  }

  private async event(transactionId: string, eventType: string, metadata: Record<string, unknown>) {
    await this.db.insert(transactionEvents).values({ transactionId, eventType, actor: 'system', metadata });
  }
}