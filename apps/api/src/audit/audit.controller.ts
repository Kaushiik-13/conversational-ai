import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AccessSessionGuard } from '../auth/access-session.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit-events')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @UseGuards(AccessSessionGuard, PermissionGuard)
  @RequirePermissions('audit.read')
  async list(@Query() query: AuditQueryDto, @Req() request: Request) {
    const result = await this.audit.list(request.auth!, query);
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor, limit: query.limit },
    };
  }
}
