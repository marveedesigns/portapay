import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('score-preview')
  preview(@Body() body: Record<string, unknown>) {
    return ok(this.reconciliation.previewScore(body));
  }

  @Get('cases')
  async cases() {
    return ok(await this.reconciliation.listCases());
  }

  @Post('cases/:id/approve-credit')
  async approveCredit(@Param('id') id: string) {
    return ok(await this.reconciliation.resolveCase(id, 'approve-credit'));
  }

  @Post('cases/:id/reject-refund-required')
  async rejectRefund(@Param('id') id: string) {
    return ok(await this.reconciliation.resolveCase(id, 'reject-refund-required'));
  }

  @Post('cases/:id/request-proof')
  async requestProof(@Param('id') id: string) {
    return ok(await this.reconciliation.resolveCase(id, 'request-proof'));
  }

  @Post('cases/:id/mark-duplicate')
  async markDuplicate(@Param('id') id: string) {
    return ok(await this.reconciliation.resolveCase(id, 'mark-duplicate'));
  }

  @Post('cases/:id/mark-suspicious')
  async markSuspicious(@Param('id') id: string) {
    return ok(await this.reconciliation.resolveCase(id, 'mark-suspicious'));
  }
}