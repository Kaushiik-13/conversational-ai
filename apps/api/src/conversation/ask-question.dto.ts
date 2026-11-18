import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AskQuestionHistoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  question!: string;

  @IsOptional()
  @IsObject()
  query?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  assistantMessage?: string;
}

export class AskQuestionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  question!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AskQuestionHistoryDto)
  history?: AskQuestionHistoryDto[];
}
