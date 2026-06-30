import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import { ok } from './common/api-response';
import { DRIZZLE } from './database/database.tokens';
import type { Database } from './database/database.module';
import { queueNames } from './queues/queue-names';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    @InjectQueue(queueNames.verification) private readonly verificationQueue: Queue,
    @InjectQueue(queueNames.reconciliation) private readonly reconciliationQueue: Queue,
    @InjectQueue(queueNames.webhookDispatch) private readonly webhookDispatchQueue: Queue,
  ) {}

  @Get()
  async health() {
    const database = await this.databaseStatus();
    const redis = await this.redisStatus();
    const queues = await Promise.all([
      this.queueStatus(this.verificationQueue),
      this.queueStatus(this.reconciliationQueue),
      this.queueStatus(this.webhookDispatchQueue),
    ]);
    const nomba = this.config.get('app.nomba') as Record<string, unknown>;
    const providerConfigured = Boolean(nomba?.clientId && nomba?.clientSecret && nomba?.parentAccountId);
    const healthy = database.status === 'up' && redis.status === 'up' && queues.every((queue) => queue.status === 'up');

    return ok({
      status: healthy ? 'ok' : 'degraded',
      service: 'portapay-core',
      database,
      redis,
      queues,
      nomba: {
        mode: nomba?.mode,
        configured: providerConfigured,
        mock: nomba?.mock === true,
        webhookUrl: nomba?.webhookUrl ?? null,
      },
    });
  }

  private async databaseStatus() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error: this.errorMessage(error) };
    }
  }

  private async redisStatus() {
    const host = this.config.get<string>('app.redis.host') ?? 'localhost';
    const port = this.config.get<number>('app.redis.port') ?? 6379;
    try {
      const client = await this.verificationQueue.client as unknown as { ping: () => Promise<unknown> };
      await client.ping();
      return { status: 'up', host, port };
    } catch (error) {
      return { status: 'down', host, port, error: this.errorMessage(error) };
    }
  }

  private async queueStatus(queue: Queue) {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      return { name: queue.name, status: 'up', ...counts };
    } catch (error) {
      return { name: queue.name, status: 'down', error: this.errorMessage(error) };
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}


