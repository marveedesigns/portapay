import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { queueNames } from './queue-names';

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: 1_000,
  removeOnFail: false,
};

function redisConnection(config: ConfigService): Record<string, unknown> {
  const tls = config.get<boolean>('app.redis.tls', false);
  const connection: Record<string, unknown> = {
    host: config.get<string>('app.redis.host') ?? 'localhost',
    port: config.get<number>('app.redis.port') ?? 6379,
    db: config.get<number>('app.redis.db') ?? 0,
    maxRetriesPerRequest: null,
  };

  const username = config.get<string>('app.redis.username');
  const password = config.get<string>('app.redis.password');
  if (username) connection.username = username;
  if (password) connection.password = password;
  if (tls) connection.tls = {};

  return connection;
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config),
        defaultJobOptions,
      }),
    }),
    ...Object.values(queueNames).map((name) => BullModule.registerQueue({ name, defaultJobOptions })),
  ],
  exports: [BullModule],
})
export class QueuesModule {}

