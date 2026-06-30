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

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('app.redis.host') ?? 'localhost',
          port: config.get<number>('app.redis.port') ?? 6379,
        },
        defaultJobOptions,
      }),
    }),
    ...Object.values(queueNames).map((name) => BullModule.registerQueue({ name, defaultJobOptions })),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
