import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccessSessionGuard } from './access-session.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { OrganizationContextDto } from './organization-context.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response) {
    return { data: this.authService.issuePreAuthenticationCsrf(response) };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return { data: await this.authService.login(input, request, response) };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return { data: await this.authService.refresh(request, response) };
  }

  @Get('me')
  @UseGuards(AccessSessionGuard)
  async me(@Req() request: Request) {
    return { data: await this.authService.me(request.auth!) };
  }

  @Put('organization-context')
  @UseGuards(AccessSessionGuard)
  async organizationContext(
    @Body() input: OrganizationContextDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return {
      data: await this.authService.selectOrganization(
        request.auth!,
        input.organizationId,
        request,
        response,
      ),
    };
  }

  @Post('logout')
  @UseGuards(AccessSessionGuard)
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request.auth!, request, response);
  }

  @Post('logout-all')
  @UseGuards(AccessSessionGuard)
  @HttpCode(204)
  async logoutAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(request.auth!, request, response);
  }
}
