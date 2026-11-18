import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApplicationAuditService } from '../common/application-audit.service';
import { DatabaseService } from '../database/database.service';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
    private readonly audit: ApplicationAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions || permissions.length === 0) {
      throw new Error('A protected route must declare required permissions.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) {
      throw new Error('PermissionGuard must run after AccessSessionGuard.');
    }

    const result = await this.database.query<{ allowed: boolean }>(
      'SELECT security.authz_authorize_session($1, $2, $3::text[]) AS allowed',
      [request.auth.sessionId, request.auth.userId, permissions],
    );
    if (!result.rows[0]?.allowed) {
      await this.audit.record(
        request.requestId,
        request.auth,
        'authorization.denied',
        'deny',
        'route',
        request.path,
        { method: request.method, requiredPermissions: permissions },
      );
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to perform this action.',
      });
    }
    return true;
  }
}
