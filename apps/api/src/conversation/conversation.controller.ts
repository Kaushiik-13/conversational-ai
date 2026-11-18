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
import { ConversationService } from './conversation.service';
import { AskQuestionDto } from './ask-question.dto';

@Controller('conversation')
@UseGuards(AccessSessionGuard, PermissionGuard)
export class ConversationController {
  constructor(private readonly conversation: ConversationService) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.read')
  async query(@Body() input: unknown, @Req() request: Request) {
    const result = await this.conversation.query(
      request.auth!,
      input,
      request.requestId,
    );
    return {
      data: result,
      meta: { rowCount: result.rows.length },
    };
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog.read')
  async ask(@Body() body: AskQuestionDto, @Req() request: Request) {
    const result = await this.conversation.ask(
      request.auth!,
      body.question,
      request.requestId,
      body.history ?? [],
    );
    return {
      data: result,
      meta: { rowCount: result.status === 'answered' ? result.rows.length : 0 },
    };
  }
}
