import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { QueryPlannerService } from './query-planner.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ConversationController],
  providers: [ConversationService, QueryPlannerService],
})
export class ConversationModule {}
