import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const cleanString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const SEARCH_FACETS = [
  'securityDomain',
  'primaryCategory',
  'manufacturer',
  'region',
  'material',
  'lifecycleStatus',
] as const;

export const SEARCH_SORT_FIELDS = [
  'relevance',
  'partNumber',
  'modelYear',
  'updatedAt',
] as const;

export type SearchFacetName = (typeof SEARCH_FACETS)[number];
export type SearchSortField = (typeof SEARCH_SORT_FIELDS)[number];
export type SearchSortDirection = 'asc' | 'desc';

export class NumberRangeDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  min?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  max?: number;
}

export class IntegerRangeDto {
  @IsOptional()
  @IsInt()
  @Min(1886)
  @Max(2100)
  from?: number;

  @IsOptional()
  @IsInt()
  @Min(1886)
  @Max(2100)
  to?: number;
}

export class SearchFiltersDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  securityDomainIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  primaryCategoryIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  manufacturerNames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  companyIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  materials?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  lifecycleStatuses?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => IntegerRangeDto)
  modelYears?: IntegerRangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NumberRangeDto)
  weightKg?: NumberRangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NumberRangeDto)
  cost?: NumberRangeDto;
}

export class SearchSortDto {
  @IsIn(SEARCH_SORT_FIELDS)
  field: SearchSortField = 'relevance';

  @IsIn(['asc', 'desc'])
  direction: SearchSortDirection = 'desc';
}

export class SearchRequestDto {
  @Transform(cleanString)
  @IsString()
  @Length(0, 300)
  query!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchFiltersDto)
  filters?: SearchFiltersDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(SEARCH_FACETS, { each: true })
  facets?: SearchFacetName[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchSortDto)
  sort?: SearchSortDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}
