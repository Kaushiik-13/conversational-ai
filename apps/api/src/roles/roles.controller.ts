import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AccessSessionGuard } from '../auth/access-session.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @UseGuards(AccessSessionGuard, PermissionGuard)
  @RequirePermissions('organization.roles.assign')
  async list(@Req() request: Request) {
    return { data: await this.roles.list(request.auth!) };
  }
}
