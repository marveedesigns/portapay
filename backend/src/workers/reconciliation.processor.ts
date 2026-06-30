import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReconciliationService } from '../modules/reconciliation/reconciliation.service';
import { queueNames } from '../queues/queue-names';

@Injectable()
@Processor(queueNames.reconciliation)
export class ReconciliationProcessor extends WorkerHost {
  constructor(private readonly reconciliation: ReconciliationService) {
    super();
  }

  async process(job: Job<{ transactionId: string }>) {
    await this.reconciliation.reconcileTransaction(job.data.transactionId);
  }
}