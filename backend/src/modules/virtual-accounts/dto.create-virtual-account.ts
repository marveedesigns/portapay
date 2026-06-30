import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVirtualAccountDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ enum: ['STATIC', 'DYNAMIC'] })
  @IsOptional()
  @IsIn(['STATIC', 'DYNAMIC'])
  type?: 'STATIC' | 'DYNAMIC';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bvn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedAmount?: string;

  @ApiPropertyOptional({ description: 'Nomba expiry date format, e.g. 2026-01-30 12:15:00' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}