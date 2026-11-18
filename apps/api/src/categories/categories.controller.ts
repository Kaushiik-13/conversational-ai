import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly audit: ApplicationAuditService,
  ) {}

  @Get('tree')
  @UseGuards(AccessSessionGuard)
  async tree(@Req() request: Request) {
    return { data: await this.categories.tree(request.auth!) };
  }

  @Get(':id')
  @UseGuards(AccessSessionGuard)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    return { data: await this.categories.findOne(request.auth!, id) };
  }

  @Post()
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('taxonomy.manage')
  async create(@Body() input: CreateCategoryDto, @Req() request: Request) {
    const data = await this.categories.create(request.auth!, input);
    await this.audit.record(
      request.requestId,
      request.auth!,
      'taxonomy.create',
      'allow',
      'category',
      String(data.id),
    );
    return { data };
  }

  @Patch(':id')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('taxonomy.manage')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() input: UpdateCategoryDto,
    @Req() request: Request,
  ) {
    const data = await this.categories.update(
      request.auth!,
      id,
      parseIfMatch(ifMatch),
      input,
    );
    await this.audit.record(
      request.requestId,
      request.auth!,
      'taxonomy.update',
      'allow',
      'category',
      String(id),
    );
    return { data };
  }

  @Delete(':id')
  @UseGuards(AccessSessionGuard, SessionCsrfGuard, PermissionGuard)
  @RequirePermissions('taxonomy.manage')
  @HttpCode(204)
  async archive(
    @Param('id', ParseIntPipe) id: number,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ): Promise<void> {
    await this.categories.archive(request.auth!, id, parseIfMatch(ifMatch));
    await this.audit.record(
      request.requestId,
      request.auth!,
      'taxonomy.archive',
      'allow',
      'category',
      String(id),
    );
  }
}
