import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty() @IsInt() @Min(1) parentId!: number;
  @ApiProperty() @IsString() @Length(1, 63) slug!: string;
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSecurityDomain?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) parentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 63) slug?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;
}
