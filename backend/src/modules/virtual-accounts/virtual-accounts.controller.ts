import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/api-key.guard';
import { ok } from '../../common/api-response';
import { CreateVirtualAccountDto } from './dto.create-virtual-account';
import { VirtualAccountsService } from './virtual-accounts.service';

@ApiTags('virtual accounts')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('virtual-accounts')
export class VirtualAccountsController {
  constructor(private readonly virtualAccounts: VirtualAccountsService) {}

  @Post()
  async create(@Body() dto: CreateVirtualAccountDto) {
    return ok(await this.virtualAccounts.create(dto));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return ok(await this.virtualAccounts.findOne(id));
  }

  @Post(':id/close')
  async close(@Param('id') id: string) {
    return ok(await this.virtualAccounts.setStatus(id, 'CLOSED', 'ACCOUNT_CLOSED'));
  }

  @Post(':id/restrict')
  async restrict(@Param('id') id: string) {
    return ok(await this.virtualAccounts.setStatus(id, 'RESTRICTED', 'ACCOUNT_RESTRICTED'));
  }
}