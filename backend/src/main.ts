import 'reflect-metadata';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { rateLimitMiddleware } from './common/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.use(express.json({
    limit: '2mb',
    verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
      if (req.originalUrl.includes('/webhooks/nomba')) {
        req.rawBody = buf.toString('utf8');
      }
    },
  }));
  app.use(express.urlencoded({ extended: true }));
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(rateLimitMiddleware());
  app.use(compression());
  const corsAllowAll = config.get<boolean>('app.cors.allowAll', false);
  const corsAllowedOrigins = config.get<string[]>('app.cors.allowedOrigins', []);
  app.enableCors({
    origin: corsAllowAll
      ? true
      : (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
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

  await app.listen(config.get<number>('app.port', 4000));
}

void bootstrap();
