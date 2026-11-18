import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessSessionGuard } from '../auth/access-session.guard';
import { SessionCsrfGuard } from '../auth/session-csrf.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { ApplicationAuditService } from '../common/application-audit.service';
import { parseIfMatch } from '../common/http-contract';
import {
  CreateMembershipDto,
  CreateUserDto,
  UpdateMembershipDto,
  UpdateUserDto,
  UserListQueryDto,
} from './users.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: ApplicationAuditService,
  ) {}

  @Get('users')
  @UseGuards(AccessSessionGuard, PermissionGuard)
  @RequirePermissions('organization.users.read')
  async list(@Query() query: UserListQueryDto, @Req() request: Request) {
    const result = await this.users.list(request.auth!, query);
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor, limit: query.limit },
    };
  }

  @Get('users/:id')
  @UseGuards(AccessSessionGuard, PermissionGuard)
  @RequirePermissions('organization.users.read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return { data: await this.users.findOne(request.auth!, id) };
  }

  @Post('users')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('organization.users.manage')
  async create(@Body() input: CreateUserDto, @Req() request: Request) {
    const data = await this.users.create(request.auth!, input);
    await this.audit.record(
      request.requestId,
      request.auth!,
      'users.create',
      'allow',
      'user',
      String(data.id),
      { role: input.roleCode },
    );
    return { data };
  }

  @Patch('users/:id')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('organization.users.manage')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateUserDto,
    @Req() request: Request,
  ) {
    const data = await this.users.update(
      request.auth!,
      id,
      parseIfMatch(ifMatch),
      input,
    );
    await this.audit.record(
      request.requestId,
      request.auth!,
      'users.update',
      'allow',
      'user',
      id,
      { changedFields: Object.keys(input) },
    );
    return { data };
  }

  @Post('users/:id/memberships')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('organization.users.manage', 'organization.roles.assign')
  async createMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateMembershipDto,
    @Req() request: Request,
  ) {
    const data = await this.users.createMembership(request.auth!, id, input);
    await this.audit.record(
      request.requestId,
      request.auth!,
      'memberships.create',
      'allow',
      'membership',
      data.id,
      { userId: id, role: input.roleCode },
    );
    return { data };
  }

  @Patch('memberships/:id')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('organization.users.manage', 'organization.roles.assign')
  async updateMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateMembershipDto,
    @Req() request: Request,
  ) {
    const data = await this.users.updateMembership(
      request.auth!,
      id,
      parseIfMatch(ifMatch),
      input,
    );
    await this.audit.record(
      request.requestId,
      request.auth!,
      'memberships.update',
      'allow',
      'membership',
      id,
      { changedFields: Object.keys(input) },
    );
    return { data };
  }
}
