import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import { Database } from '../../database/database.module';
import { auditLogs, customerIdentityHistory, customers, kycTierHistory, ledgerEntries } from '../../database/schema';
import { CreateCustomerDto } from './dto.create-customer';
import { UpdateIdentityDto } from './dto.update-identity';
import { UpdateKycTierDto } from './dto.update-kyc-tier';

@Injectable()
export class CustomersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(dto: CreateCustomerDto) {
    const [customer] = await this.db.insert(customers).values({
      fullName: dto.fullName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      externalReference: dto.externalReference,
    }).returning();

    await this.db.insert(customerIdentityHistory).values({
      customerId: customer.id,
      fieldName: 'fullName',
      oldValue: null,
      newValue: dto.fullName,
      changeReason: 'customer_created',
      changedBy: 'system',
      allowPreviousValueForMatching: false,
    });
    await this.audit('CUSTOMER_CREATED', 'customer', customer.id, { fullName: dto.fullName });

    return customer;
  }

  async findOne(id: string) {
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async updateIdentity(id: string, dto: UpdateIdentityDto) {
    const customer = await this.findOne(id);
    const oldValue = String((customer as Record<string, unknown>)[dto.fieldName] ?? '');
    const patch = { [dto.fieldName]: dto.newValue, updatedAt: new Date() } as Partial<typeof customers.$inferInsert>;
    const [updated] = await this.db.update(customers).set(patch).where(eq(customers.id, id)).returning();

    await this.db.insert(customerIdentityHistory).values({
      customerId: id,
      fieldName: dto.fieldName,
      oldValue,
      newValue: dto.newValue,
      changeReason: dto.changeReason,
      changedBy: 'admin',
      allowPreviousValueForMatching: dto.allowPreviousValueForMatching ?? dto.fieldName === 'fullName',
    });
    await this.audit('IDENTITY_UPDATED', 'customer', id, { fieldName: dto.fieldName, oldValue, newValue: dto.newValue });
    return updated;
  }

  async updateKycTier(id: string, dto: UpdateKycTierDto) {
    const customer = await this.findOne(id);
    const [updated] = await this.db.update(customers).set({ kycTier: dto.newTier, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    await this.db.insert(kycTierHistory).values({
      customerId: id,
      oldTier: customer.kycTier,
      newTier: dto.newTier,
      changeReason: dto.changeReason,
      changedBy: 'admin',
    });
    await this.audit('KYC_UPDATED', 'customer', id, { oldTier: customer.kycTier, newTier: dto.newTier });
    return updated;
  }

  async statement(id: string) {
    await this.findOne(id);
    const entries = await this.db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, id));
    const balance = entries.reduce((sum, entry) => {
      const amount = Number(entry.amount);
      if (entry.direction === 'CREDIT') return sum + amount;
      if (entry.direction === 'DEBIT') return sum - amount;
      return sum;
    }, 0);
    return { customerId: id, currency: 'NGN', balance: balance.toFixed(2), entries };
  }

  private async audit(eventType: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    await this.db.insert(auditLogs).values({
      actorType: 'system',
      eventType,
      entityType,
      entityId,
      metadata,
    });
  }
}