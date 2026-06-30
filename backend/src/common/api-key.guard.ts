import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.tokens';
import type { Database } from '../database/database.module';
import { apiKeys } from '../database/schema';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const configuredBypass = process.env.PORTAPAY_DEV_API_KEY;
    const provided = String(request.headers['x-api-key'] ?? '');

    if (!provided) {
      throw new UnauthorizedException('Missing API key');
    }

    if (configuredBypass && safeEqual(provided, configuredBypass)) {
      return true;
    }

    const keyHash = createHash('sha256').update(provided).digest('hex');
    const [record] = await this.db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    if (!record || !record.isActive) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}