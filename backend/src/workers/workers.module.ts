import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../modules/reconciliation/reconciliation.module';
import { NombaModule } from '../providers/nomba/nomba.module';
import { QueuesModule } from '../queues/queues.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ReconciliationProcessor } from './reconciliation.processor';
import { VerificationProcessor } from './verification.processor';
import { WebhookDispatchProcessor } from './webhook-dispatch.processor';

@Module({
  imports: [NombaModule, QueuesModule, ReconciliationModule, WebhooksModule],
  providers: [VerificationProcessor, ReconciliationProcessor, WebhookDispatchProcessor],
})
export class WorkersModule {}