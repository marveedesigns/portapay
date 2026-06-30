declare module '@nestjs/bullmq' {
  import { DynamicModule, Provider, Type } from '@nestjs/common';

  export interface BullRootModuleOptions {
    connection?: Record<string, unknown>;
    defaultJobOptions?: Record<string, unknown>;
  }

  export interface BullQueueOptions {
    name: string;
    defaultJobOptions?: Record<string, unknown>;
  }

  export class BullModule {
    static forRootAsync(options: {
      inject?: Array<Type<unknown> | string | symbol>;
      useFactory: (...args: any[]) => BullRootModuleOptions | Promise<BullRootModuleOptions>;
    }): DynamicModule;
    static registerQueue(...options: BullQueueOptions[]): DynamicModule;
  }

  export function InjectQueue(name?: string): ParameterDecorator;
  export function Processor(name?: string): ClassDecorator;

  export abstract class WorkerHost {
    abstract process(job: unknown): Promise<unknown> | unknown;
  }
}