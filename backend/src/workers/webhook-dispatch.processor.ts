import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { queueNames } from '../queues/queue-names';
import { DownstreamWebhooksService } from '../webhooks/downstream-webhooks.service';

@Injectable()
@Processor(queueNames.webhookDispatch)
export class WebhookDispatchProcessor extends WorkerHost {
  constructor(private readonly downstreamWebhooks: DownstreamWebhooksService) {
    super();
  }

  async process(job: Job<{ deliveryId: string }>) {
    await this.downstreamWebhooks.dispatch(job.data.deliveryId);
  }
}