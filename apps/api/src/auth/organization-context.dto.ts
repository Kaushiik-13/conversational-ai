import { IsUUID } from 'class-validator';

export class OrganizationContextDto {
  @IsUUID()
  organizationId!: string;
}
