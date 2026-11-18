import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EntitlementDto {
  @ApiProperty() @IsInt() @Min(1) categoryId!: number;
  @ApiProperty({ enum: ['allow', 'deny'] }) @IsIn(['allow', 'deny']) effect!:
    'allow' | 'deny';
  @ApiProperty({ default: true }) @IsBoolean() includeDescendants!: boolean;
}

export class ReplaceEntitlementsDto {
  @ApiProperty({ type: [EntitlementDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((entry: EntitlementDto) => `${entry.categoryId}:${entry.effect}`)
  @ValidateNested({ each: true })
  @Type(() => EntitlementDto)
  entitlements!: EntitlementDto[];
}
