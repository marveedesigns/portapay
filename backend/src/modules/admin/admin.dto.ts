import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: ['sandbox', 'live'] })
  @IsOptional()
  @IsIn(['sandbox', 'live'])
  environment?: 'sandbox' | 'live';
}

export class CreateWebhookSubscriptionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  targetUrl!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  events?: string[];

  @ApiPropertyOptional({ enum: ['sandbox', 'live'] })
  @IsOptional()
  @IsIn(['sandbox', 'live'])
  environment?: 'sandbox' | 'live';
}