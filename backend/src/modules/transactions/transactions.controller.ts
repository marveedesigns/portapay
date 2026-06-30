import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/api-key.guard';
import { ok } from '../../common/api-response';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return ok(await this.transactions.findOne(id));
  }

  @Get(':id/status')
  async status(@Param('id') id: string) {
    return ok(await this.transactions.status(id));
  }
}