import { Module } from '@nestjs/common';
import { NombaModule } from '../providers/nomba/nomba.module';
import { QueuesModule } from '../queues/queues.module';
import { DownstreamWebhooksService } from './downstream-webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [NombaModule, QueuesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, DownstreamWebhooksService],
  exports: [DownstreamWebhooksService],
})
export class WebhooksModule {}