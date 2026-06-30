import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadEnvFile();

type SimulatedScenario = {
  key: string;
  accountNumber: string;
  senderName: string;
  senderAccountNumber: string;
  amount: string;
};

const scenarios: Record<string, SimulatedScenario> = {
  clean: {
    key: 'clean',
    accountNumber: '9901000001',
    senderName: 'Chinedu Okafor',
    senderAccountNumber: '8011110001',
    amount: '3210.00',
  },
  mismatch: {
    key: 'mismatch',
    accountNumber: '9901000003',
    senderName: 'Samuel Adebayo',
    senderAccountNumber: '8011110003',
    amount: '54000.00',
  },
};

const scenarioName = readArg('--scenario') ?? 'clean';
const scenario = scenarios[scenarioName];
if (!scenario) {
  throw new Error(`Unknown scenario "${scenarioName}". Use one of: ${Object.keys(scenarios).join(', ')}`);
}

const webhookSecret = process.env.NOMBA_TEST_WEBHOOK_SECRET ?? process.env.NOMBA_LIVE_WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error('NOMBA_TEST_WEBHOOK_SECRET is required to generate signed Apidog webhook variables.');
}

const unique = Date.now().toString(36);
const transactionId = readArg('--reference') ?? `apidog-${scenario.key}-${unique}`;
const timestamp = new Date().toISOString();
const requestId = `req-${transactionId}`;
const sessionId = `session-${transactionId}`;
const signature = webhookSecret
  ? signPayload({ scenario, requestId, sessionId, transactionId, timestamp, secret: webhookSecret })
  : '';
const baseUrl = readArg('--base-url') ?? process.env.PORTAPAY_API_BASE_URL ?? `http://localhost:${process.env.PORTAPAY_CORE_PORT ?? process.env.PORT ?? 4000}/api/v1`;

const environment = {
  id: 'portapay-local-apidog-environment',
  name: `PortaPay Local Apidog (${scenario.key})`,
  values: [
    variable('baseUrl', baseUrl),
    variable('adminEmail', process.env.ADMIN_EMAIL ?? 'admin@portapay.local'),
    variable('adminPassword', process.env.ADMIN_PASSWORD ?? ''),
    variable('adminToken', ''),
    variable('apiKey', process.env.PORTAPAY_DEV_API_KEY ?? ''),
    variable('customerId', ''),
    variable('virtualAccountId', ''),
    variable('transactionId', transactionId),
    variable('caseId', ''),
    variable('webhookTargetUrl', 'https://example.com/webhooks/portapay'),
    variable('customerIdempotencyKey', `customer-${unique}`),
    variable('accountIdempotencyKey', `account-${unique}`),
    variable('customerExternalReference', `demo-amina-${unique}`),
    variable('nombaSignature', signature),
    variable('nombaTimestamp', timestamp),
    variable('nombaRequestId', requestId),
    variable('nombaAliasAccountNumber', scenario.accountNumber),
    variable('nombaSessionId', sessionId),
    variable('nombaTransactionId', transactionId),
    variable('nombaTransactionAmount', scenario.amount),
    variable('nombaTransactionTime', timestamp),
    variable('nombaSenderName', scenario.senderName),
    variable('nombaSenderAccountNumber', scenario.senderAccountNumber),
    variable('nombaBankName', 'Demo Bank'),
    variable('nombaBankCode', '999999'),
  ],
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date().toISOString(),
  _postman_exported_using: 'PortaPay Apidog Prep',
};

const outputDir = resolve(process.cwd(), '..', '.local');
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, 'apidog_local_environment.json');
writeFileSync(outputPath, `${JSON.stringify(environment, null, 2)}\n`, { encoding: 'utf8' });

console.log(`Apidog environment written to ${outputPath}`);
console.log(`Scenario: ${scenario.key}`);
console.log(`Nomba transaction ID: ${transactionId}`);
if (!webhookSecret) {
  console.log('No Nomba webhook secret found; generated webhook variables will rely on provider verification after receipt.');
}
console.log('Import the generated environment into Apidog, then use the running API Swagger endpoint at /api/docs-json.');

function variable(key: string, value: string) {
  return { key, value, type: 'default', enabled: true };
}

function signPayload(input: {
  scenario: SimulatedScenario;
  requestId: string;
  sessionId: string;
  transactionId: string;
  timestamp: string;
  secret: string;
}) {
  const hashingPayload = [
    'payment_success',
    input.requestId,
    'portapay-demo-merchant',
    'portapay-demo-wallet',
    input.transactionId,
    'vact_transfer',
    input.timestamp,
    '',
    input.timestamp,
  ].join(':');

  return createHmac('sha256', input.secret).update(hashingPayload).digest('base64');
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
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
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

