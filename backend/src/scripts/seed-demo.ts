import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  auditLogs,
  customerIdentityHistory,
  customers,
  ledgerEntries,
  providerEvents,
  reconciliationCases,
  reconciliationDecisions,
  transactionEvents,
  transactions,
  virtualAccountEvents,
  virtualAccounts,
  webhookEvents,
} from '../database/schema';
import * as schema from '../database/schema';

type DemoCustomer = {
  reference: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  kycTier: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';
  status?: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED' | 'CLOSED';
  historicalName?: string;
};

type DemoScenario = {
  key: string;
  label: string;
  customer: DemoCustomer;
  accountNumber: string;
  accountStatus: 'ACTIVE' | 'RESTRICTED' | 'EXPIRED' | 'CLOSED' | 'UNDER_REVIEW';
  amount: string;
  senderName: string;
  transactionStatus: 'RECONCILED' | 'MANUAL_REVIEW' | 'DUPLICATE';
  outcome: 'AUTO_RECONCILED' | 'MANUAL_REVIEW' | 'DUPLICATE_EVENT' | 'MISDIRECTED_PAYMENT' | 'KYC_REVIEW_REQUIRED';
  confidenceScore: number;
  reason: string;
  recommendedAction?: string;
  ledgerCredit?: boolean;
};

const scenarios: DemoScenario[] = [
  {
    key: 'auto-success',
    label: 'Successful auto-reconciled transfer',
    customer: { reference: 'demo-auto-success', fullName: 'Chinedu Okafor', email: 'chinedu.demo@portapay.test', phoneNumber: '+2348010000101', kycTier: 'TIER_3' },
    accountNumber: '9901000001',
    accountStatus: 'ACTIVE',
    amount: '12500.00',
    senderName: 'Chinedu Okafor',
    transactionStatus: 'RECONCILED',
    outcome: 'AUTO_RECONCILED',
    confidenceScore: 100,
    reason: 'Verified transfer matched active customer, active account, KYC tier, and sender identity.',
    ledgerCredit: true,
  },
  {
    key: 'duplicate-webhook',
    label: 'Duplicate webhook event',
    customer: { reference: 'demo-duplicate-webhook', fullName: 'Mariam Yusuf', email: 'mariam.demo@portapay.test', phoneNumber: '+2348010000102', kycTier: 'TIER_2' },
    accountNumber: '9901000002',
    accountStatus: 'ACTIVE',
    amount: '20000.00',
    senderName: 'Mariam Yusuf',
    transactionStatus: 'DUPLICATE',
    outcome: 'DUPLICATE_EVENT',
    confidenceScore: 0,
    reason: 'Provider reference had already been processed, so the duplicate webhook was quarantined.',
    recommendedAction: 'MARK_DUPLICATE',
  },
  {
    key: 'sender-name-mismatch',
    label: 'Sender-name mismatch',
    customer: { reference: 'demo-name-mismatch', fullName: 'Ifeoma Adeyemi', email: 'ifeoma.demo@portapay.test', phoneNumber: '+2348010000103', kycTier: 'TIER_3' },
    accountNumber: '9901000003',
    accountStatus: 'ACTIVE',
    amount: '54000.00',
    senderName: 'Samuel Adebayo',
    transactionStatus: 'MANUAL_REVIEW',
    outcome: 'MANUAL_REVIEW',
    confidenceScore: 75,
    reason: 'Payment was verified, but sender name did not match the customer or approved identity history.',
    recommendedAction: 'MANUAL_REVIEW',
  },
  {
    key: 'closed-account',
    label: 'Closed account payment',
    customer: { reference: 'demo-closed-account', fullName: 'Tunde Balogun', email: 'tunde.demo@portapay.test', phoneNumber: '+2348010000104', kycTier: 'TIER_3' },
    accountNumber: '9901000004',
    accountStatus: 'CLOSED',
    amount: '8700.00',
    senderName: 'Tunde Balogun',
    transactionStatus: 'MANUAL_REVIEW',
    outcome: 'MISDIRECTED_PAYMENT',
    confidenceScore: 45,
    reason: 'Verified payment landed on a closed dedicated virtual account and needs refund or manual handling.',
    recommendedAction: 'REJECT_OR_REFUND',
  },
  {
    key: 'kyc-restriction',
    label: 'KYC tier restriction',
    customer: { reference: 'demo-kyc-restriction', fullName: 'Ngozi Eze', email: 'ngozi.demo@portapay.test', phoneNumber: '+2348010000105', kycTier: 'TIER_1' },
    accountNumber: '9901000005',
    accountStatus: 'ACTIVE',
    amount: '95000.00',
    senderName: 'Ngozi Eze',
    transactionStatus: 'MANUAL_REVIEW',
    outcome: 'KYC_REVIEW_REQUIRED',
    confidenceScore: 60,
    reason: 'Amount exceeds the customer KYC tier limit, so credit is blocked pending review.',
    recommendedAction: 'REQUEST_KYC_REVIEW',
  },
  {
    key: 'rename-history-match',
    label: 'Customer rename matched through identity history',
    customer: { reference: 'demo-rename-history', fullName: 'Aisha Bello Okafor', historicalName: 'Aisha Bello', email: 'aisha.demo@portapay.test', phoneNumber: '+2348010000106', kycTier: 'TIER_3' },
    accountNumber: '9901000006',
    accountStatus: 'ACTIVE',
    amount: '18300.00',
    senderName: 'Aisha Bello',
    transactionStatus: 'RECONCILED',
    outcome: 'AUTO_RECONCILED',
    confidenceScore: 95,
    reason: 'Sender matched an approved historical customer name after a rename, allowing automatic credit.',
    ledgerCredit: true,
  },
];

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed demo data. Copy .env.example to .env and run migrations first.');
}

function loadEnvFile() {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')]) {
    if (!existsSync(candidate)) continue;
    const lines = readFileSync(candidate, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

async function main() {
  console.log('Seeding PortaPay demo scenarios...');

  for (const scenario of scenarios) {
    const customer = await upsertCustomer(scenario.customer);
    await ensureIdentityHistory(customer.id, scenario.customer.fullName, 'customer_created', false);
    if (scenario.customer.historicalName) {
      await ensureIdentityHistory(customer.id, scenario.customer.historicalName, 'demo_customer_rename', true);
    }

    const account = await upsertVirtualAccount(customer.id, scenario);
    const transaction = await upsertTransaction(customer.id, account.id, scenario);
    await ensureProviderWebhookRows(scenario, transaction.providerReference);
    await ensureDecision(transaction.id, scenario);
    await ensureTransactionEvent(transaction.id, scenario.ledgerCredit ? 'PAYMENT_RECONCILED' : 'PAYMENT_FLAGGED', scenario);

    if (scenario.ledgerCredit) {
      await ensureLedgerCredit(customer.id, transaction.id, scenario);
    } else {
      await ensureCase(transaction.id, scenario);
    }

    await ensureAuditLog(customer.id, transaction.id, scenario);
    console.log(`- ${scenario.label}`);
  }

  console.log('Demo seed complete. Open the admin dashboard and refresh the overview.');
}

async function upsertCustomer(input: DemoCustomer) {
  await db.insert(customers).values({
    externalReference: input.reference,
    fullName: input.fullName,
    email: input.email,
    phoneNumber: input.phoneNumber,
    kycTier: input.kycTier,
    status: input.status ?? 'ACTIVE',
    metadata: { seed: 'demo' },
  }).onConflictDoUpdate({
    target: customers.externalReference,
    set: {
      fullName: input.fullName,
      email: input.email,
      phoneNumber: input.phoneNumber,
      kycTier: input.kycTier,
      status: input.status ?? 'ACTIVE',
      metadata: { seed: 'demo' },
      updatedAt: new Date(),
    },
  });

  const [customer] = await db.select().from(customers).where(eq(customers.externalReference, input.reference)).limit(1);
  return customer;
}

async function ensureIdentityHistory(customerId: string, name: string, reason: string, allowPreviousValueForMatching: boolean) {
  const [existing] = await db.select().from(customerIdentityHistory).where(and(
    eq(customerIdentityHistory.customerId, customerId),
    eq(customerIdentityHistory.fieldName, 'fullName'),
    eq(customerIdentityHistory.newValue, name),
  )).limit(1);

  if (existing) return;

  await db.insert(customerIdentityHistory).values({
    customerId,
    fieldName: 'fullName',
    oldValue: null,
    newValue: name,
    changeReason: reason,
    changedBy: 'demo-seed',
    allowPreviousValueForMatching,
  });
}

async function upsertVirtualAccount(customerId: string, scenario: DemoScenario) {
  await db.insert(virtualAccounts).values({
    customerId,
    provider: 'nomba',
    providerAccountId: `demo-provider-account-${scenario.key}`,
    accountNumber: scenario.accountNumber,
    bankName: 'Nomba Microfinance Bank',
    accountName: scenario.customer.fullName,
    type: 'STATIC',
    status: scenario.accountStatus,
    metadata: {
      seed: 'demo',
      parentAccountId: 'demo-parent-account',
      subAccountId: 'demo-sub-account',
      scenario: scenario.key,
    },
  }).onConflictDoUpdate({
    target: virtualAccounts.accountNumber,
    set: {
      customerId,
      providerAccountId: `demo-provider-account-${scenario.key}`,
      accountName: scenario.customer.fullName,
      status: scenario.accountStatus,
      updatedAt: new Date(),
    },
  });

  const [account] = await db.select().from(virtualAccounts).where(eq(virtualAccounts.accountNumber, scenario.accountNumber)).limit(1);

  const [event] = await db.select().from(virtualAccountEvents).where(and(
    eq(virtualAccountEvents.virtualAccountId, account.id),
    eq(virtualAccountEvents.eventType, 'DEMO_ACCOUNT_READY'),
  )).limit(1);

  if (!event) {
    await db.insert(virtualAccountEvents).values({
      virtualAccountId: account.id,
      eventType: 'DEMO_ACCOUNT_READY',
      reason: scenario.label,
      actor: 'demo-seed',
      metadata: { scenario: scenario.key },
    });
  }

  return account;
}

async function upsertTransaction(customerId: string, accountId: string, scenario: DemoScenario) {
  const providerReference = `demo-nomba-${scenario.key}`;
  await db.insert(transactions).values({
    virtualAccountId: accountId,
    customerId,
    provider: 'nomba',
    providerReference,
    nombaReference: `demo-nomba-ref-${scenario.key}`,
    amount: scenario.amount,
    currency: 'NGN',
    senderName: scenario.senderName,
    senderAccountNumber: `80${scenario.accountNumber.slice(-8)}`,
    recipientAccountNumber: scenario.accountNumber,
    status: scenario.transactionStatus,
    verifiedAt: new Date(),
    metadata: { seed: 'demo', scenario: scenario.key, label: scenario.label },
  }).onConflictDoUpdate({
    target: [transactions.provider, transactions.providerReference],
    set: {
      customerId,
      virtualAccountId: accountId,
      amount: scenario.amount,
      senderName: scenario.senderName,
      status: scenario.transactionStatus,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const [transaction] = await db.select().from(transactions).where(eq(transactions.providerReference, providerReference)).limit(1);
  return transaction;
}

async function ensureProviderWebhookRows(scenario: DemoScenario, providerReference: string) {
  const payload = {
    event: 'transaction.successful',
    transactionRef: providerReference,
    amount: scenario.amount,
    senderName: scenario.senderName,
    accountNumber: scenario.accountNumber,
    scenario: scenario.key,
  };

  await db.insert(providerEvents).values({
    provider: 'nomba',
    providerEventId: providerReference,
    eventType: 'transaction.successful',
    payload,
  }).onConflictDoNothing();

  await db.insert(webhookEvents).values({
    provider: 'nomba',
    providerEventId: providerReference,
    signatureValid: true,
    replayProtected: true,
    processingStatus: scenario.outcome === 'DUPLICATE_EVENT' ? 'DUPLICATE' : 'PROCESSED',
    payload,
    processedAt: new Date(),
  }).onConflictDoNothing();
}

async function ensureDecision(transactionId: string, scenario: DemoScenario) {
  const [existing] = await db.select().from(reconciliationDecisions).where(eq(reconciliationDecisions.transactionId, transactionId)).limit(1);
  if (existing) return;

  await db.insert(reconciliationDecisions).values({
    transactionId,
    outcome: scenario.outcome,
    confidenceScore: scenario.confidenceScore,
    rulesApplied: [
      { rule: 'demo_scenario', points: scenario.confidenceScore },
      { rule: scenario.key, points: 0 },
    ],
    decisionReason: scenario.reason,
    decidedBy: 'demo-seed',
  });
}

async function ensureCase(transactionId: string, scenario: DemoScenario) {
  await db.insert(reconciliationCases).values({
    transactionId,
    status: 'OPEN',
    reasonCode: scenario.outcome,
    reason: scenario.reason,
    recommendedAction: scenario.recommendedAction ?? 'MANUAL_REVIEW',
    metadata: { confidenceScore: scenario.confidenceScore, scenario: scenario.key },
  }).onConflictDoNothing();
}

async function ensureLedgerCredit(customerId: string, transactionId: string, scenario: DemoScenario) {
  await db.insert(ledgerEntries).values({
    customerId,
    transactionId,
    entryType: 'CUSTOMER_CREDITED',
    direction: 'CREDIT',
    amount: scenario.amount,
    currency: 'NGN',
    reference: `demo-ledger-${scenario.key}`,
    narration: `Demo credit: ${scenario.label}`,
    metadata: { confidenceScore: scenario.confidenceScore, scenario: scenario.key },
  }).onConflictDoNothing();
}

async function ensureTransactionEvent(transactionId: string, eventType: string, scenario: DemoScenario) {
  const [existing] = await db.select().from(transactionEvents).where(and(
    eq(transactionEvents.transactionId, transactionId),
    eq(transactionEvents.eventType, eventType),
  )).limit(1);

  if (existing) return;

  await db.insert(transactionEvents).values({
    transactionId,
    eventType,
    actor: 'demo-seed',
    metadata: { scenario: scenario.key, outcome: scenario.outcome, confidenceScore: scenario.confidenceScore },
  });
}

async function ensureAuditLog(customerId: string, transactionId: string, scenario: DemoScenario) {
  const [existing] = await db.select().from(auditLogs).where(and(
    eq(auditLogs.entityType, 'transaction'),
    eq(auditLogs.entityId, transactionId),
    eq(auditLogs.eventType, 'DEMO_SCENARIO_SEEDED'),
  )).limit(1);

  if (existing) return;

  await db.insert(auditLogs).values({
    actorType: 'system',
    eventType: 'DEMO_SCENARIO_SEEDED',
    entityType: 'transaction',
    entityId: transactionId,
    metadata: { customerId, scenario: scenario.key, label: scenario.label, outcome: scenario.outcome },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });


