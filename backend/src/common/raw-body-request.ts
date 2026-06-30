import type { FastifyRequest } from 'fastify';

export interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer | string;
}
