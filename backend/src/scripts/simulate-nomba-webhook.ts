import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../database/schema';
import { ledgerEntries, reconciliationCases, reconciliationDecisions, transactions } from '../database/schema';

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
const baseUrl = process.env.PORTAPAY_API_BASE_URL ?? `http://localhost:${process.env.PORTAPAY_CORE_PORT ?? process.env.PORT ?? 4000}/api/v1`;
const webhookSecret = process.env.NOMBA_TEST_WEBHOOK_SECRET ?? process.env.NOMBA_LIVE_WEBHOOK_SECRET;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and run migrations first.');
}

if (!webhookSecret) {
  throw new Error('NOMBA_TEST_WEBHOOK_SECRET is required to sign the simulated webhook.');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

type SimulatedScenario = {
  key: string;
  label: string;
  accountNumber: string;
  senderName: string;
  senderAccountNumber: string;
  amount: string;
};

const scenarios: Record<string, SimulatedScenario> = {
  clean: {
    key: 'clean',
    label: 'Clean signed Nomba webhook to active customer account',
    accountNumber: '9901000001',
    senderName: 'Chinedu Okafor',
    senderAccountNumber: '8011110001',
    amount: '3210.00',
  },
  mismatch: {
    key: 'mismatch',
    label: 'Signed Nomba webhook with sender-name mismatch',
    accountNumber: '9901000003',
    senderName: 'Samuel Adebayo',
    senderAccountNumber: '8011110003',
    amount: '54000.00',
  },
};

async function main() {
  const scenarioName = readArg('--scenario') ?? 'clean';
  const scenario = scenarios[scenarioName];
  if (!scenario) {
    throw new Error(`Unknown scenario "${scenarioName}". Use one of: ${Object.keys(scenarios).join(', ')}`);
  }

  const secret = webhookSecret;
  if (!secret) throw new Error('NOMBA_TEST_WEBHOOK_SECRET is required to sign the simulated webhook.');

  const unique = Date.now().toString(36);
  const providerReference = readArg('--reference') ?? `sim-${scenario.key}-${unique}`;
  const timestamp = new Date().toISOString();
  const payload = buildPayload(scenario, providerReference, timestamp);
  const signature = signPayload(payload, secret, timestamp);

  console.log(`Posting ${scenario.label}`);
  console.log(`Provider reference: ${providerReference}`);

  const first = await postWebhook(payload, signature, timestamp);
  const duplicate = await postWebhook(payload, signature, timestamp);

  console.log(`First webhook response: ${JSON.stringify(first)}`);
  console.log(`Duplicate webhook response: ${JSON.stringify(duplicate)}`);

  const result = await waitForTransaction(providerReference);
  console.log('Pipeline result:');
  console.log(JSON.stringify(result, null, 2));
}

function buildPayload(scenario: SimulatedScenario, transactionId: string, timestamp: string) {
  return {
    event_type: 'payment_success',
    requestId: `req-${transactionId}`,
    data: {
      merchant: {
        userId: 'portapay-demo-merchant',
        walletId: 'portapay-demo-wallet',
      },
      transaction: {
        aliasAccountNumber: scenario.accountNumber,
        sessionId: `session-${transactionId}`,
        transactionId,
        type: 'vact_transfer',
        responseCode: '',
        transactionAmount: scenario.amount,
        time: timestamp,
      },
      customer: {
        senderName: scenario.senderName,
        accountNumber: scenario.senderAccountNumber,
      },
    },
  };
}

function signPayload(payload: ReturnType<typeof buildPayload>, secret: string, timestamp: string) {
  const hashingPayload = [
    payload.event_type,
    payload.requestId,
    payload.data.merchant.userId,
    payload.data.merchant.walletId,
    payload.data.transaction.transactionId,
    payload.data.transaction.type,
    payload.data.transaction.time,
    payload.data.transaction.responseCode,
    timestamp,
  ].join(':');

  return createHmac('sha256', secret).update(hashingPayload).digest('base64');
}

async function postWebhook(payload: ReturnType<typeof buildPayload>, signature: string, timestamp: string) {
  const response = await fetch(`${baseUrl}/webhooks/nomba`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'nomba-signature': signature,
      'nomba-sig-value': signature,
      'nomba-signature-algorithm': 'HmacSHA256',
      'nomba-signature-version': '1.0.0',
      'nomba-timestamp': timestamp,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Webhook POST failed (${response.status}): ${text}`);
  }
  return json;
}

async function waitForTransaction(providerReference: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [transaction] = await db.select().from(transactions).where(and(
      eq(transactions.provider, 'nomba'),
      eq(transactions.providerReference, providerReference),
    )).limit(1);

    if (transaction) {
      const [decision] = await db.select().from(reconciliationDecisions).where(eq(reconciliationDecisions.transactionId, transaction.id)).limit(1);
      const [reconciliationCase] = await db.select().from(reconciliationCases).where(eq(reconciliationCases.transactionId, transaction.id)).limit(1);
      const ledger = await db.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, transaction.id));

      if (decision || reconciliationCase || transaction.status === 'RECONCILED' || transaction.status === 'MANUAL_REVIEW') {
        return {
          transaction: {
            id: transaction.id,
            status: transaction.status,
            providerReference: transaction.providerReference,
            amount: transaction.amount,
            recipientAccountNumber: transaction.recipientAccountNumber,
            senderName: transaction.senderName,
          },
          decision: decision ? {
            outcome: decision.outcome,
            confidenceScore: decision.confidenceScore,
            reason: decision.decisionReason,
          } : null,
          case: reconciliationCase ? {
            id: reconciliationCase.id,
            status: reconciliationCase.status,
            reasonCode: reconciliationCase.reasonCode,
            recommendedAction: reconciliationCase.recommendedAction,
          } : null,
          ledgerEntries: ledger.map((entry) => ({ id: entry.id, direction: entry.direction, amount: entry.amount, reference: entry.reference })),
        };
      }
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for transaction ${providerReference}. Check that the backend worker is running.`);
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });



