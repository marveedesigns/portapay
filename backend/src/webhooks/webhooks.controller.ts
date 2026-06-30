import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ok } from '../common/api-response';
import type { RawBodyRequest } from '../common/raw-body-request';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('nomba')
  async receiveNombaWebhook(
    @Body() payload: Record<string, unknown>,
    @Req() request: RawBodyRequest,
    @Headers('nomba-signature') signature?: string,
    @Headers('nomba-sig-value') signatureValue?: string,
    @Headers('nomba-signature-algorithm') signatureAlgorithm?: string,
    @Headers('nomba-signature-version') signatureVersion?: string,
    @Headers('nomba-timestamp') timestamp?: string,
  ) {
    return ok(await this.webhooks.receiveProviderWebhook('nomba', payload, {
      rawBody: request.rawBody,
      signature: signature ?? signatureValue,
      timestamp,
      signatureAlgorithm,
      signatureVersion,
    }));
  }
}
