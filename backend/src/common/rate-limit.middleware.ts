import type { FastifyReply, FastifyRequest } from 'fastify';

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimitHook(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const max = options?.max ?? Number(process.env.RATE_LIMIT_MAX ?? 120);
  const buckets = new Map<string, Bucket>();

  return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const now = Date.now();
    const forwardedFor = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    const key = forwardedFor || request.ip || request.socket.remoteAddress || 'unknown';
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      reply.header('RateLimit-Limit', String(max));
      reply.header('RateLimit-Remaining', String(max - 1));
      done();
      return;
    }

    bucket.count += 1;
    reply.header('RateLimit-Limit', String(max));
    reply.header('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    reply.header('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      reply.status(429).send({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.' },
      });
      return;
    }

    done();
  };
}
