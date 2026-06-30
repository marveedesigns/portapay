# PortaPay Core

PortaPay Core is an identity-aware dedicated virtual account infrastructure for Nigerian fintech products. The first implementation is a modular monolith with a NestJS backend, Drizzle ORM, PostgreSQL, Redis/BullMQ workers, a Nomba provider adapter, and a React + Vite admin portal.


## Hackathon Context

PortaPay Core targets Nomba's Infrastructure Track under the Dedicated Virtual Accounts focus area. The product is built around a persistent customer-named virtual account system where each customer receives a dedicated account number tied to identity across transactions.

The hackathon judging signals from the track are reflected in the architecture: reconciliation accuracy, identity and naming model quality, edge-case handling for renames, closures and KYC tier changes, plus clean developer APIs for downstream teams.

## Run Locally

1. Use Node.js `24.18.0` LTS, then run `npm install`.
2. Copy `.env.example` to `.env` and fill secrets.
3. Start infrastructure with `npm run docker:up`.
4. Generate Drizzle migrations with `npm run db:generate`.
5. Apply migrations with `npm run db:migrate`.
6. Start the backend with `npm run dev:backend`.
7. Start the admin portal with `npm run dev:admin`.


## Architecture Notes

- Webhooks are never credited directly. They are persisted, verified, queued, reconciled, and only then represented in append-only ledger entries.
- Drizzle ORM is the database access layer. Financial and identity records are modeled as immutable or history-first tables.
- Redis is only used for queues, rate limiting, idempotency, locks, cache, and temporary state. It is not a source of truth.
- Provider logic is isolated behind `PaymentProvider` so Nomba can be replaced or supplemented later.

## CORS Configuration

Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of browser origins allowed to call the backend, for example:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://your-admin-domain.example.com
CORS_ALLOW_ALL=false
```

Requests without a browser `Origin` header, such as Nomba server-to-server webhooks, remain allowed. Use `CORS_ALLOW_ALL=true` only for temporary demos.
## Nomba Webhook Submission

Submit the deployed backend webhook URL to Nomba:

`https://<deployed-api-domain>/api/v1/webhooks/nomba`

Use `NOMBA_ENV=test` for the hackathon demo. Keep live credentials configured in deployment secrets but do not switch to `NOMBA_ENV=live` unless you intentionally want live traffic.

## Railway Deployment Notes

Deploy the backend with PostgreSQL and Redis services attached. Configure all `NOMBA_TEST_*`, optional `NOMBA_LIVE_*`, `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `JWT_ACCESS_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `PORTAPAY_DEV_API_KEY` in Railway environment variables.
## Demo Seed Scenarios

After migrations are applied, run:

```bash
npm run demo:seed
```

The seed is idempotent and creates six hackathon-ready records for the admin portal:

- Successful auto-reconciled transfer with one append-only ledger credit.
- Duplicate webhook quarantined as a duplicate event.
- Sender-name mismatch requiring manual review.
- Payment into a closed virtual account requiring refund/manual handling.
- KYC tier restriction blocking automatic credit.
- Customer rename matched through approved identity history.

Refresh the React + Vite admin dashboard after seeding to review cases, queue health, ledger entries, and audit logs.

## Signed Webhook Simulation

With the backend running and demo seed data loaded, run:

```bash
npm run demo:webhook
```

This posts a Nomba-shaped webhook signed with `NOMBA_TEST_WEBHOOK_SECRET`, posts the same payload again to prove duplicate handling, then waits for the worker pipeline to create the transaction, reconciliation decision, and ledger entry.

Optional scenarios:

```bash
npm run demo:webhook -- --scenario clean
npm run demo:webhook -- --scenario mismatch
```



