import { Module } from '@nestjs/common';
import { AccessSessionGuard } from './access-session.guard';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter.service';
import { SessionCsrfGuard } from './session-csrf.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthConfig,
    AuthService,
    AccessSessionGuard,
    SessionCsrfGuard,
    LoginRateLimiter,
  ],
  exports: [AuthConfig, AuthService, AccessSessionGuard, SessionCsrfGuard],
})
export class AuthModule {}
