import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCatalogPartDto {
  @ApiProperty() @IsInt() @Min(1) companyId!: number;
  @ApiProperty() @IsInt() @Min(1) tenantId!: number;
  @ApiProperty() @IsString() @Length(1, 160) partNumber!: string;
  @ApiProperty() @IsString() @Length(1, 300) partName!: string;
  @ApiProperty() @IsString() @MaxLength(20000) description!: string;
  @ApiProperty() @IsString() @Length(1, 160) commodity!: string;
  @ApiProperty() @IsString() @Length(1, 160) subCommodity!: string;
  @ApiProperty() @IsString() @Length(1, 160) manufacturer!: string;
  @ApiProperty() @IsString() @Length(1, 160) vehicleProgram!: string;
  @ApiProperty() @IsString() @Length(1, 120) region!: string;
  @ApiProperty() @IsString() @Length(1, 120) country!: string;
  @ApiProperty() @IsString() @Length(1, 160) plant!: string;
  @ApiProperty({ minimum: 1886, maximum: 2100 })
  @IsInt()
  @Min(1886)
  @Max(2100)
  modelYear!: number;
  @ApiProperty() @IsString() @Length(1, 160) material!: string;
  @ApiProperty() @IsString() @Length(1, 80) lifecycleStatus!: string;
  @ApiProperty() @IsString() @Length(1, 80) supplierStatus!: string;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) costUsd!: number;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) weightKg!: number;
  @ApiProperty() @IsInt() @Min(1) securityDomainId!: number;
  @ApiProperty() @IsInt() @Min(1) primaryCategoryId!: number;
  @ApiProperty({ enum: ['organization', 'restricted', 'internal'] })
  @IsIn(['organization', 'restricted', 'internal'])
  visibilityStatus!: string;
  @ApiPropertyOptional({ type: [Number], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  secondaryCategoryIds?: number[];
}

export class UpdateCatalogPartDto extends PartialType(CreateCatalogPartDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
