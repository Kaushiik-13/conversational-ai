import {
  Controller,
  Body,
  Delete,
  Get,
  Headers,
  HttpCode,
  Patch,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessSessionGuard } from '../auth/access-session.guard';
import { SessionCsrfGuard } from '../auth/session-csrf.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CatalogService } from './catalog.service';
import { CreateCatalogPartDto, UpdateCatalogPartDto } from './catalog.dto';
import { parseIfMatch, requireIdempotencyKey } from '../common/http-contract';
import { ApplicationAuditService } from '../common/application-audit.service';

@Controller('catalog')
@UseGuards(AccessSessionGuard, PermissionGuard)
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly audit: ApplicationAuditService,
  ) {}

  @Get('facets')
  @RequirePermissions('catalog.search')
  async facets(@Req() request: Request) {
    return { data: await this.catalogService.facets(request.auth!) };
  }

  @Get('records/:id')
  @RequirePermissions('catalog.read')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    return { data: await this.catalogService.findOne(request.auth!, id) };
  }

  @Get('parts/:id')
  @RequirePermissions('catalog.read')
  async findPart(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    return { data: await this.catalogService.findOne(request.auth!, id) };
  }

  @Post('parts')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('catalog.create')
  async create(
    @Body() input: CreateCatalogPartDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    const data = await this.catalogService.create(
      request.auth!,
      input,
      requireIdempotencyKey(idempotencyKey),
    );
    await this.audit.record(
      request.requestId,
      request.auth!,
      'catalog.create',
      'allow',
      'catalog.part',
      String(data.id),
    );
    return { data };
  }

  @Patch('parts/:id')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('catalog.update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateCatalogPartDto,
    @Req() request: Request,
  ) {
    const data = await this.catalogService.update(
      request.auth!,
      id,
      parseIfMatch(ifMatch),
      input,
    );
    await this.audit.record(
      request.requestId,
      request.auth!,
      'catalog.update',
      'allow',
      'catalog.part',
      String(id),
    );
    return { data };
  }

  @Delete('parts/:id')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('catalog.archive')
  @HttpCode(204)
  async archive(
    @Param('id', ParseIntPipe) id: number,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ): Promise<void> {
    await this.catalogService.archive(request.auth!, id, parseIfMatch(ifMatch));
    await this.audit.record(
      request.requestId,
      request.auth!,
      'catalog.archive',
      'allow',
      'catalog.part',
      String(id),
    );
  }
}
