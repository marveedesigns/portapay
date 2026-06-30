import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/api-key.guard';
import { ok } from '../../common/api-response';
import { CreateCustomerDto } from './dto.create-customer';
import { UpdateIdentityDto } from './dto.update-identity';
import { UpdateKycTierDto } from './dto.update-kyc-tier';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  async create(@Body() dto: CreateCustomerDto) {
    return ok(await this.customers.create(dto));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return ok(await this.customers.findOne(id));
  }

  @Patch(':id/identity')
  async updateIdentity(@Param('id') id: string, @Body() dto: UpdateIdentityDto) {
    return ok(await this.customers.updateIdentity(id, dto));
  }

  @Patch(':id/kyc-tier')
  async updateKycTier(@Param('id') id: string, @Body() dto: UpdateKycTierDto) {
    return ok(await this.customers.updateKycTier(id, dto));
  }

  @Get(':id/statement')
  async statement(@Param('id') id: string) {
    return ok(await this.customers.statement(id));
  }
}