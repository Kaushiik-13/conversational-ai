import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UserListQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cursor?: string;
}

export class CreateUserDto {
  @ApiProperty() @IsEmail() @Length(3, 320) email!: string;
  @ApiProperty() @IsString() @Length(1, 160) displayName!: string;
  @ApiProperty({
    enum: ['ORG_ADMIN', 'ANALYST', 'VIEWER', 'RESTRICTED_VIEWER'],
  })
  @IsIn(['ORG_ADMIN', 'ANALYST', 'VIEWER', 'RESTRICTED_VIEWER'])
  roleCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  displayName?: string;
  @ApiPropertyOptional({ enum: ['invited', 'active', 'locked', 'disabled'] })
  @IsOptional()
  @IsIn(['invited', 'active', 'locked', 'disabled'])
  status?: string;
}

export class CreateMembershipDto {
  @ApiProperty() @IsUUID() organizationId!: string;
  @ApiProperty({
    enum: ['ORG_ADMIN', 'ANALYST', 'VIEWER', 'RESTRICTED_VIEWER'],
  })
  @IsIn(['ORG_ADMIN', 'ANALYST', 'VIEWER', 'RESTRICTED_VIEWER'])
  roleCode!: string;
}

export class ScopeRestrictionDto {
  @ApiProperty({ enum: ['category', 'company', 'region'] })
  @IsIn(['category', 'company', 'region'])
  scopeType!: 'category' | 'company' | 'region';
  @ApiProperty({ enum: ['allow', 'deny'] }) @IsIn(['allow', 'deny']) effect!:
    'allow' | 'deny';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) categoryId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) companyId?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  region?: string;
}

export class UpdateMembershipDto {
  @ApiPropertyOptional({
    enum: ['ORG_ADMIN', 'ANALYST', 'VIEWER', 'RESTRICTED_VIEWER'],
  })
  @IsOptional()
  @IsIn(['ORG_ADMIN', 'ANALYST', 'VIEWER', 'RESTRICTED_VIEWER'])
  roleCode?: string;
  @ApiPropertyOptional({ enum: ['active', 'suspended', 'revoked'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'revoked'])
  status?: string;
  @ApiPropertyOptional({ type: [ScopeRestrictionDto], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScopeRestrictionDto)
  restrictions?: ScopeRestrictionDto[];
}
