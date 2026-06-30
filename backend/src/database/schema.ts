import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const customerStatusEnum = pgEnum('customer_status', ['ACTIVE', 'RESTRICTED', 'SUSPENDED', 'CLOSED']);
export const kycTierEnum = pgEnum('kyc_tier', ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4']);
export const accountTypeEnum = pgEnum('virtual_account_type', ['STATIC', 'DYNAMIC']);
export const accountStatusEnum = pgEnum('virtual_account_status', ['ACTIVE', 'RESTRICTED', 'EXPIRED', 'CLOSED', 'UNDER_REVIEW']);
export const transactionStatusEnum = pgEnum('transaction_status', ['RECEIVED', 'VERIFIED', 'RECONCILED', 'MANUAL_REVIEW', 'REJECTED', 'DUPLICATE']);
export const reconciliationOutcomeEnum = pgEnum('reconciliation_outcome', [
  'AUTO_RECONCILED',
  'MANUAL_REVIEW',
  'PENDING_VERIFICATION',
  'DUPLICATE_EVENT',
  'MISDIRECTED_PAYMENT',
  'KYC_REVIEW_REQUIRED',
  'REJECTED',
  'REFUND_REQUIRED',
]);
export const reconciliationCaseStatusEnum = pgEnum('reconciliation_case_status', [
  'OPEN',
  'UNDER_REVIEW',
  'AWAITING_PROOF',
  'APPROVED',
  'REJECTED',
  'RESOLVED',
]);

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  fullName: varchar('full_name', { length: 180 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  emailUnique: uniqueIndex('admin_users_email_unique').on(table.email),
}));

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description'),
  ...timestamps,
}, (table) => ({
  nameUnique: uniqueIndex('roles_name_unique').on(table.name),
}));

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  action: varchar('action', { length: 120 }).notNull(),
  description: text('description'),
  ...timestamps,
}, (table) => ({
  actionUnique: uniqueIndex('permissions_action_unique').on(table.action),
}));

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  keyHash: text('key_hash').notNull(),
  webhookSecretEncrypted: text('webhook_secret_encrypted'),
  environment: varchar('environment', { length: 24 }).default('sandbox').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  keyHashUnique: uniqueIndex('api_keys_key_hash_unique').on(table.keyHash),
}));

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  externalReference: varchar('external_reference', { length: 160 }),
  fullName: varchar('full_name', { length: 180 }).notNull(),
  email: varchar('email', { length: 320 }),
  phoneNumber: varchar('phone_number', { length: 40 }),
  status: customerStatusEnum('status').default('ACTIVE').notNull(),
  kycTier: kycTierEnum('kyc_tier').default('TIER_1').notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  externalReferenceUnique: uniqueIndex('customers_external_reference_unique').on(table.externalReference),
  phoneIdx: index('customers_phone_idx').on(table.phoneNumber),
  emailIdx: index('customers_email_idx').on(table.email),
}));

export const customerIdentityHistory = pgTable('customer_identity_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  fieldName: varchar('field_name', { length: 80 }).notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value').notNull(),
  changeReason: text('change_reason').notNull(),
  changedBy: varchar('changed_by', { length: 160 }).notNull(),
  allowPreviousValueForMatching: boolean('allow_previous_value_for_matching').default(false).notNull(),
  approvalMetadata: jsonb('approval_metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  customerIdx: index('customer_identity_history_customer_idx').on(table.customerId),
}));

export const kycTierHistory = pgTable('kyc_tier_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  oldTier: kycTierEnum('old_tier'),
  newTier: kycTierEnum('new_tier').notNull(),
  changeReason: text('change_reason').notNull(),
  changedBy: varchar('changed_by', { length: 160 }).notNull(),
  approvalMetadata: jsonb('approval_metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  customerIdx: index('kyc_tier_history_customer_idx').on(table.customerId),
}));

export const virtualAccounts = pgTable('virtual_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  provider: varchar('provider', { length: 40 }).default('nomba').notNull(),
  providerAccountId: varchar('provider_account_id', { length: 160 }),
  accountNumber: varchar('account_number', { length: 20 }).notNull(),
  bankName: varchar('bank_name', { length: 120 }).notNull(),
  accountName: varchar('account_name', { length: 180 }).notNull(),
  type: accountTypeEnum('type').default('STATIC').notNull(),
  status: accountStatusEnum('status').default('ACTIVE').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  accountNumberUnique: uniqueIndex('virtual_accounts_account_number_unique').on(table.accountNumber),
  customerIdx: index('virtual_accounts_customer_idx').on(table.customerId),
  providerAccountIdx: index('virtual_accounts_provider_account_idx').on(table.providerAccountId),
}));

export const virtualAccountEvents = pgTable('virtual_account_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  virtualAccountId: uuid('virtual_account_id').references(() => virtualAccounts.id).notNull(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  reason: text('reason'),
  actor: varchar('actor', { length: 160 }).notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  accountIdx: index('virtual_account_events_account_idx').on(table.virtualAccountId),
}));

export const providerEvents = pgTable('provider_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 40 }).notNull(),
  providerEventId: varchar('provider_event_id', { length: 180 }).notNull(),
  eventType: varchar('event_type', { length: 120 }).notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({
  providerEventUnique: uniqueIndex('provider_events_provider_event_unique').on(table.provider, table.providerEventId),
}));

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 40 }).notNull(),
  providerEventId: varchar('provider_event_id', { length: 180 }).notNull(),
  signatureValid: boolean('signature_valid').default(false).notNull(),
  replayProtected: boolean('replay_protected').default(false).notNull(),
  processingStatus: varchar('processing_status', { length: 40 }).default('RECEIVED').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  providerEventUnique: uniqueIndex('webhook_events_provider_event_unique').on(table.provider, table.providerEventId),
  statusIdx: index('webhook_events_status_idx').on(table.processingStatus),
}));

export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  virtualAccountId: uuid('virtual_account_id').references(() => virtualAccounts.id),
  customerId: uuid('customer_id').references(() => customers.id),
  provider: varchar('provider', { length: 40 }).default('nomba').notNull(),
  providerReference: varchar('provider_reference', { length: 180 }).notNull(),
  nombaReference: varchar('nomba_reference', { length: 180 }),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('NGN').notNull(),
  senderName: varchar('sender_name', { length: 180 }),
  senderAccountNumber: varchar('sender_account_number', { length: 20 }),
  recipientAccountNumber: varchar('recipient_account_number', { length: 20 }).notNull(),
  status: transactionStatusEnum('status').default('RECEIVED').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  providerReferenceUnique: uniqueIndex('transactions_provider_reference_unique').on(table.provider, table.providerReference),
  recipientIdx: index('transactions_recipient_account_idx').on(table.recipientAccountNumber),
  customerIdx: index('transactions_customer_idx').on(table.customerId),
}));

export const transactionEvents = pgTable('transaction_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  actor: varchar('actor', { length: 160 }).notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  transactionIdx: index('transaction_events_transaction_idx').on(table.transactionId),
}));

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  entryType: varchar('entry_type', { length: 80 }).notNull(),
  direction: varchar('direction', { length: 10 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('NGN').notNull(),
  reference: varchar('reference', { length: 180 }).notNull(),
  narration: text().notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  referenceUnique: uniqueIndex('ledger_entries_reference_unique').on(table.reference),
  customerIdx: index('ledger_entries_customer_idx').on(table.customerId),
  transactionIdx: index('ledger_entries_transaction_idx').on(table.transactionId),
}));

export const reconciliationCases = pgTable('reconciliation_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  status: reconciliationCaseStatusEnum('status').default('OPEN').notNull(),
  reasonCode: varchar('reason_code', { length: 100 }).notNull(),
  reason: text('reason').notNull(),
  recommendedAction: varchar('recommended_action', { length: 120 }).notNull(),
  assignedTo: uuid('assigned_to').references(() => adminUsers.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  transactionUnique: uniqueIndex('reconciliation_cases_transaction_unique').on(table.transactionId),
  statusIdx: index('reconciliation_cases_status_idx').on(table.status),
}));

export const reconciliationDecisions = pgTable('reconciliation_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  outcome: reconciliationOutcomeEnum('outcome').notNull(),
  confidenceScore: integer('confidence_score').notNull(),
  rulesApplied: jsonb('rules_applied').default(sql`'[]'::jsonb`).notNull(),
  decisionReason: text('decision_reason').notNull(),
  decidedBy: varchar('decided_by', { length: 160 }).default('system').notNull(),
  ...timestamps,
}, (table) => ({
  transactionUnique: uniqueIndex('reconciliation_decisions_transaction_unique').on(table.transactionId),
}));



export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  targetUrl: text('target_url').notNull(),
  secretHash: text('secret_hash').notNull(),
  signingSecretEncrypted: text('signing_secret_encrypted').notNull(),
  events: jsonb('events').default(sql`'[]'::jsonb`).notNull(),
  environment: varchar('environment', { length: 24 }).default('sandbox').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
}, (table) => ({
  targetUrlIdx: index('webhook_subscriptions_target_url_idx').on(table.targetUrl),
}));

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  subscriptionId: uuid('subscription_id').references(() => webhookSubscriptions.id).notNull(),
  eventType: varchar('event_type', { length: 120 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 40 }).default('PENDING').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  lastStatusCode: integer('last_status_code'),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  statusIdx: index('webhook_deliveries_status_idx').on(table.status),
  subscriptionIdx: index('webhook_deliveries_subscription_idx').on(table.subscriptionId),
}));
export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull(),
  scope: varchar('scope', { length: 120 }).notNull(),
  requestHash: text('request_hash').notNull(),
  responseHash: text('response_hash'),
  responseBody: jsonb('response_body'),
  statusCode: integer('status_code'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => ({
  keyScopeUnique: uniqueIndex('idempotency_records_key_scope_unique').on(table.idempotencyKey, table.scope),
  expiresAtIdx: index('idempotency_records_expires_at_idx').on(table.expiresAt),
}));
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => adminUsers.id),
  actorType: varchar('actor_type', { length: 40 }).notNull(),
  eventType: varchar('event_type', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: uuid('entity_id'),
  ipAddress: varchar('ip_address', { length: 80 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  ...timestamps,
}, (table) => ({
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  eventIdx: index('audit_logs_event_idx').on(table.eventType),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  identityHistory: many(customerIdentityHistory),
  kycHistory: many(kycTierHistory),
  virtualAccounts: many(virtualAccounts),
  transactions: many(transactions),
  ledgerEntries: many(ledgerEntries),
}));

export const virtualAccountsRelations = relations(virtualAccounts, ({ one, many }) => ({
  customer: one(customers, { fields: [virtualAccounts.customerId], references: [customers.id] }),
  events: many(virtualAccountEvents),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
  virtualAccount: one(virtualAccounts, { fields: [transactions.virtualAccountId], references: [virtualAccounts.id] }),
  events: many(transactionEvents),
  ledgerEntries: many(ledgerEntries),
  decisions: many(reconciliationDecisions),
}));