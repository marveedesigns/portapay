import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateKycTierDto {
  @ApiProperty({ enum: ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4'] })
  @IsIn(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4'])
  newTier!: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';

  @ApiProperty()
  @IsString()
  changeReason!: string;
}