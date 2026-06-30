import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { from, Observable, of, switchMap } from 'rxjs';
import { IdempotencyService } from './idempotency.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const key = String(request.headers['idempotency-key'] ?? request.headers['x-idempotency-key'] ?? '');
    if (!key) {
      return next.handle();
    }

    const scope = `${request.method}:${request.url.split('?')[0]}`;
    const requestHash = this.idempotency.hashPayload(request.body);

    return from(this.idempotency.start(key, scope, requestHash)).pipe(
      switchMap((record) => {
        if ('cached' in record) {
          response.header('Idempotency-Replayed', 'true');
          return of(record.cached);
        }
        return next.handle().pipe(
          switchMap((body) => from(this.idempotency.complete(record.id, response.statusCode || 200, body)).pipe(
            switchMap(() => of(body)),
          )),
        );
      }),
    );
  }
}
