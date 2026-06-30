CREATE TYPE "public"."virtual_account_status" AS ENUM('ACTIVE', 'RESTRICTED', 'EXPIRED', 'CLOSED', 'UNDER_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."virtual_account_type" AS ENUM('STATIC', 'DYNAMIC');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."kyc_tier" AS ENUM('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_case_status" AS ENUM('OPEN', 'UNDER_REVIEW', 'AWAITING_PROOF', 'APPROVED', 'REJECTED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_outcome" AS ENUM('AUTO_RECONCILED', 'MANUAL_REVIEW', 'PENDING_VERIFICATION', 'DUPLICATE_EVENT', 'MISDIRECTED_PAYMENT', 'KYC_REVIEW_REQUIRED', 'REJECTED', 'REFUND_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('RECEIVED', 'VERIFIED', 'RECONCILED', 'MANUAL_REVIEW', 'REJECTED', 'DUPLICATE');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"full_name" varchar(180) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"key_hash" text NOT NULL,
	"webhook_secret_encrypted" text,
	"environment" varchar(24) DEFAULT 'sandbox' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_type" varchar(40) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"ip_address" varchar(80),
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_identity_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"field_name" varchar(80) NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"change_reason" text NOT NULL,
	"changed_by" varchar(160) NOT NULL,
	"allow_previous_value_for_matching" boolean DEFAULT false NOT NULL,
	"approval_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_reference" varchar(160),
	"full_name" varchar(180) NOT NULL,
	"email" varchar(320),
	"phone_number" varchar(40),
	"status" "customer_status" DEFAULT 'ACTIVE' NOT NULL,
	"kyc_tier" "kyc_tier" DEFAULT 'TIER_1' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_tier_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"old_tier" "kyc_tier",
	"new_tier" "kyc_tier" NOT NULL,
	"change_reason" text NOT NULL,
	"changed_by" varchar(160) NOT NULL,
	"approval_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"transaction_id" uuid,
	"entry_type" varchar(80) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"reference" varchar(180) NOT NULL,
	"narration" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar(120) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_event_id" varchar(180) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"status" "reconciliation_case_status" DEFAULT 'OPEN' NOT NULL,
	"reason_code" varchar(100) NOT NULL,
	"reason" text NOT NULL,
	"recommended_action" varchar(120) NOT NULL,
	"assigned_to" uuid,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"outcome" "reconciliation_outcome" NOT NULL,
	"confidence_score" integer NOT NULL,
	"rules_applied" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision_reason" text NOT NULL,
	"decided_by" varchar(160) DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"actor" varchar(160) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_account_id" uuid,
	"customer_id" uuid,
	"provider" varchar(40) DEFAULT 'nomba' NOT NULL,
	"provider_reference" varchar(180) NOT NULL,
	"nomba_reference" varchar(180),
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"sender_name" varchar(180),
	"sender_account_number" varchar(20),
	"recipient_account_number" varchar(20) NOT NULL,
	"status" "transaction_status" DEFAULT 'RECEIVED' NOT NULL,
	"verified_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_account_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_account_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"reason" text,
	"actor" varchar(160) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" varchar(40) DEFAULT 'nomba' NOT NULL,
	"provider_account_id" varchar(160),
	"account_number" varchar(20) NOT NULL,
	"bank_name" varchar(120) NOT NULL,
	"account_name" varchar(180) NOT NULL,
	"type" "virtual_account_type" DEFAULT 'STATIC' NOT NULL,
	"status" "virtual_account_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_event_id" varchar(180) NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"replay_protected" boolean DEFAULT false NOT NULL,
	"processing_status" varchar(40) DEFAULT 'RECEIVED' NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_identity_history" ADD CONSTRAINT "customer_identity_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_tier_history" ADD CONSTRAINT "kyc_tier_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_assigned_to_admin_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_decisions" ADD CONSTRAINT "reconciliation_decisions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_virtual_account_id_virtual_accounts_id_fk" FOREIGN KEY ("virtual_account_id") REFERENCES "public"."virtual_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_account_events" ADD CONSTRAINT "virtual_account_events_virtual_account_id_virtual_accounts_id_fk" FOREIGN KEY ("virtual_account_id") REFERENCES "public"."virtual_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_event_idx" ON "audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "customer_identity_history_customer_idx" ON "customer_identity_history" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_external_reference_unique" ON "customers" USING btree ("external_reference");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "kyc_tier_history_customer_idx" ON "kyc_tier_history" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_reference_unique" ON "ledger_entries" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "ledger_entries_customer_idx" ON "ledger_entries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_action_unique" ON "permissions" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_provider_event_unique" ON "provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_cases_transaction_unique" ON "reconciliation_cases" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "reconciliation_cases_status_idx" ON "reconciliation_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reconciliation_decisions_transaction_idx" ON "reconciliation_decisions" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_unique" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "transaction_events_transaction_idx" ON "transaction_events" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_provider_reference_unique" ON "transactions" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "transactions_recipient_account_idx" ON "transactions" USING btree ("recipient_account_number");--> statement-breakpoint
CREATE INDEX "transactions_customer_idx" ON "transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "virtual_account_events_account_idx" ON "virtual_account_events" USING btree ("virtual_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "virtual_accounts_account_number_unique" ON "virtual_accounts" USING btree ("account_number");--> statement-breakpoint
CREATE INDEX "virtual_accounts_customer_idx" ON "virtual_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "virtual_accounts_provider_account_idx" ON "virtual_accounts" USING btree ("provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("processing_status");