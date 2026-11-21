import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FacetCacheService } from './facet-cache.service';
import { SearchController } from './search.controller';
import { SearchCursorService } from './search-cursor.service';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [SearchController],
  providers: [
    FacetCacheService,
    SearchCursorService,
    SearchRepository,
    SearchService,
  ],
  exports: [FacetCacheService],
})
export class SearchModule {}
