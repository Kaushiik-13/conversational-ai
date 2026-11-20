import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_PASSWORD_CHANGE_KEY } from './allow-password-change.decorator';
import { AuthService } from './auth.service';

@Injectable()
export class AccessSessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    request.auth = await this.authService.authenticateAccess(request);

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      !allowed &&
      (await this.authService.mustChangePassword(request.auth.userId))
    ) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must choose a new password before continuing.',
      });
    }
    return true;
  }
}
