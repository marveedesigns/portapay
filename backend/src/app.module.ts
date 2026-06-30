import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { QueuesModule } from './queues/queues.module';
import { AuditModule } from './modules/audit/audit.module';
import { CustomersModule } from './modules/customers/customers.module';
import { IdentityLedgerModule } from './modules/identity-ledger/identity-ledger.module';
import { KycModule } from './modules/kyc/kyc.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RiskModule } from './modules/risk/risk.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { VirtualAccountsModule } from './modules/virtual-accounts/virtual-accounts.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkersModule } from './workers/workers.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], load: [appConfig] }),
    DatabaseModule,
    IdempotencyModule,
    QueuesModule,
    AdminModule,
    AuditModule,
    IdentityLedgerModule,
    KycModule,
    LedgerModule,
    RiskModule,
    CustomersModule,
    VirtualAccountsModule,
    TransactionsModule,
    ReconciliationModule,
    ReportsModule,
    WebhooksModule,
    WorkersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}