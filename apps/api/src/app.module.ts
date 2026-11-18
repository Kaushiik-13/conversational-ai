import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { CatalogModule } from './catalog/catalog.module';
import { BrowserSecurityMiddleware } from './common/browser-security.middleware';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { DatabaseModule } from './database/database.module';
import { SearchModule } from './search/search.module';
import { CategoriesModule } from './categories/categories.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AuditModule } from './audit/audit.module';
import { ConversationModule } from './conversation/conversation.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
    CatalogModule,
    SearchModule,
    CategoriesModule,
    OrganizationsModule,
    UsersModule,
    RolesModule,
    AuditModule,
    ConversationModule,
  ],
  controllers: [AppController],
  providers: [AppService, BrowserSecurityMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, BrowserSecurityMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
