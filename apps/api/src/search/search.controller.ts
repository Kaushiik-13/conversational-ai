import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessSessionGuard } from '../auth/access-session.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { SearchRequestDto } from './search.dto';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(AccessSessionGuard, PermissionGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.search')
  async search(@Body() body: SearchRequestDto, @Req() request: Request) {
    const result = await this.searchService.search(request.auth!, body);
    return {
      data: {
        items: result.items,
        facets: result.facets,
      },
      meta: {
        requestId: request.requestId,
        nextCursor: result.nextCursor,
        visibleHitCount: result.visibleHitCount,
        limit: result.limit,
        queryTimeMs: result.queryTimeMs,
      },
    };
  }
}
