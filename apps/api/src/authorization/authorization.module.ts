import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApplicationAuditService } from '../common/application-audit.service';
import { FieldAccessService } from './field-access.service';
import { PermissionGuard } from './permission.guard';

@Module({
  imports: [AuthModule],
  providers: [FieldAccessService, PermissionGuard, ApplicationAuditService],
  exports: [FieldAccessService, PermissionGuard, ApplicationAuditService],
})
export class AuthorizationModule {}
