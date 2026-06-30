import 'reflect-metadata';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createRateLimitHook } from './common/rate-limit.middleware';

async function bootstrap() {
  const adapter = new FastifyAdapter({ bodyLimit: 2 * 1024 * 1024 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  await app.register(helmet);
  await app.register(compress);

  const corsAllowAll = config.get<boolean>('app.cors.allowAll', false);
  const corsAllowedOrigins = config.get<string[]>('app.cors.allowedOrigins', []);
  app.enableCors({
    origin: corsAllowAll
      ? true
      : (origin: string | undefined, callback: (error: Error | null, origin: boolean | string) => void) => {
          if (!origin || corsAllowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error(`CORS origin not allowed: ${origin}`), false);
        },
    credentials: !corsAllowAll,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-API-Key',
      'x-api-key',
    ],
  });

  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  fastify.addHook('onRequest', createRateLimitHook());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PortaPay Core API')
    .setDescription('Identity-aware dedicated virtual account infrastructure')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen({ port: config.get<number>('app.port', 4000), host: '0.0.0.0' });
}

void bootstrap();

export type PortaPayFastifyRequest = FastifyRequest & { rawBody?: Buffer };
export type PortaPayFastifyReply = FastifyReply;

