import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { Database } from '../../database/database.module';
import { idempotencyRecords } from '../../database/schema';

export interface IdempotencyLookup {
  id: string;
  responseBody: unknown;
  statusCode: number | null;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  hashPayload(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
  }

  hashResponse(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
  }

  async start(idempotencyKey: string, scope: string, requestHash: string): Promise<{ id: string; cached?: unknown }> {
    const now = new Date();
    const [existing] = await this.db.select().from(idempotencyRecords).where(and(
      eq(idempotencyRecords.idempotencyKey, idempotencyKey),
      eq(idempotencyRecords.scope, scope),
      gt(idempotencyRecords.expiresAt, now),
    )).limit(1);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key was already used with a different request body');
      }
      if (existing.responseBody !== null && existing.responseBody !== undefined) {
        return { id: existing.id, cached: existing.responseBody };
      }
      throw new ConflictException('Idempotent request is already being processed');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [created] = await this.db.insert(idempotencyRecords).values({
      idempotencyKey,
      scope,
      requestHash,
      expiresAt,
    }).returning();
    return { id: created.id };
  }

  async complete(id: string, statusCode: number, responseBody: unknown) {
    await this.db.update(idempotencyRecords).set({
      statusCode,
      responseBody,
      responseHash: this.hashResponse(responseBody),
      updatedAt: new Date(),
    }).where(eq(idempotencyRecords.id, id));
  }
}