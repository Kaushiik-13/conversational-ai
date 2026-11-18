import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AuditQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  action?: string;
  @ApiPropertyOptional({ enum: ['allow', 'deny', 'error'] })
  @IsOptional()
  @IsIn(['allow', 'deny', 'error'])
  decision?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  targetType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[1-9][0-9]*$/)
  cursor?: string;
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
