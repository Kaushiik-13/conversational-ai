import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SemanticModule } from '../semantic/semantic.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { QueryPlannerService } from './planner/query-planner.service';

@Module({
  imports: [AuthModule, AuthorizationModule, SemanticModule],
  controllers: [ConversationController],
  providers: [ConversationService, QueryPlannerService],
})
export class ConversationModule {}
