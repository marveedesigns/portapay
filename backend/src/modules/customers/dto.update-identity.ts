import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIdentityDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  fieldName!: 'fullName' | 'email' | 'phoneNumber';

  @ApiProperty()
  @IsString()
  @MaxLength(320)
  newValue!: string;

  @ApiProperty()
  @IsString()
  changeReason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowPreviousValueForMatching?: boolean;
}