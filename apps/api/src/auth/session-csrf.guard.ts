import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) {
      throw new Error('SessionCsrfGuard must run after AccessSessionGuard.');
    }
    this.authService.verifySessionCsrf(request, request.auth);
    return true;
  }
}
