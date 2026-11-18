import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
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
import { OrganizationsService } from './organizations.service';
import { ReplaceEntitlementsDto } from './organizations.dto';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly audit: ApplicationAuditService,
  ) {}

  @Get()
  @UseGuards(AccessSessionGuard)
  async list(@Req() request: Request) {
    return { data: await this.organizations.list(request.auth!) };
  }

  @Get(':id')
  @UseGuards(AccessSessionGuard)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return { data: await this.organizations.findOne(request.auth!, id) };
  }

  @Get(':id/entitlements')
  @UseGuards(AccessSessionGuard, PermissionGuard)
  @RequirePermissions('organization.entitlements.read')
  async entitlements(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return { data: await this.organizations.entitlements(request.auth!, id) };
  }

  @Put(':id/entitlements')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('organization.entitlements.update')
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: ReplaceEntitlementsDto,
    @Req() request: Request,
  ) {
    const data = await this.organizations.replaceEntitlements(
      request.auth!,
      id,
      parseIfMatch(ifMatch),
      input,
    );
    await this.audit.record(
      request.requestId,
      request.auth!,
      'entitlements.replace',
      'allow',
      'organization',
      id,
      { entryCount: input.entitlements.length },
    );
    return { data };
  }
}
