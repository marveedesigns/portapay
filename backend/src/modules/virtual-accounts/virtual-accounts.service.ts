import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import { Database } from '../../database/database.module';
import { auditLogs, customers, virtualAccountEvents, virtualAccounts } from '../../database/schema';
import { NombaProvider } from '../../providers/nomba/nomba.provider';
import { CreateVirtualAccountDto } from './dto.create-virtual-account';

@Injectable()
export class VirtualAccountsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly nomba: NombaProvider,
  ) {}

  async create(dto: CreateVirtualAccountDto) {
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, dto.customerId)).limit(1);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const providerAccount = await this.nomba.createVirtualAccount({
      customerId: customer.id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phoneNumber,
      type: dto.type ?? 'STATIC',
      bvn: dto.bvn,
      expectedAmount: dto.expectedAmount,
      expiryDate: dto.expiryDate,
    });

    const [account] = await this.db.insert(virtualAccounts).values({
      customerId: customer.id,
      provider: 'nomba',
      providerAccountId: providerAccount.providerAccountId,
      accountNumber: providerAccount.accountNumber,
      bankName: providerAccount.bankName,
      accountName: providerAccount.accountName,
      type: dto.type ?? 'STATIC',
      metadata: providerAccount.metadata ?? {},
    }).returning();

    await this.db.insert(virtualAccountEvents).values({
      virtualAccountId: account.id,
      eventType: 'ACCOUNT_CREATED',
      reason: dto.reason ?? 'virtual_account_created',
      actor: 'system',
      metadata: providerAccount.metadata ?? {},
    });
    await this.audit('ACCOUNT_CREATED', 'virtual_account', account.id, { customerId: customer.id });

    return account;
  }

  async findOne(id: string) {
    const [account] = await this.db.select().from(virtualAccounts).where(eq(virtualAccounts.id, id)).limit(1);
    if (!account) {
      throw new NotFoundException('Virtual account not found');
    }
    return account;
  }

  async setStatus(id: string, status: 'CLOSED' | 'RESTRICTED', eventType: string) {
    await this.findOne(id);
    const [account] = await this.db.update(virtualAccounts).set({ status, updatedAt: new Date() }).where(eq(virtualAccounts.id, id)).returning();
    await this.db.insert(virtualAccountEvents).values({
      virtualAccountId: id,
      eventType,
      reason: eventType.toLowerCase(),
      actor: 'admin',
    });
    await this.audit(eventType, 'virtual_account', id, { status });
    return account;
  }

  private async audit(eventType: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    await this.db.insert(auditLogs).values({ actorType: 'system', eventType, entityType, entityId, metadata });
  }
}