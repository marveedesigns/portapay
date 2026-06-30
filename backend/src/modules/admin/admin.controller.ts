import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CreateApiKeyDto, CreateWebhookSubscriptionDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  async dashboard() {
    return ok(await this.admin.dashboard());
  }

  @Post('api-keys')
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    return ok(await this.admin.createApiKey(dto));
  }

  @Post('webhook-subscriptions')
  async createWebhookSubscription(@Body() dto: CreateWebhookSubscriptionDto) {
    return ok(await this.admin.createWebhookSubscription(dto));
  }
}