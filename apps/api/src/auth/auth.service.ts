import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_COOKIE,
} from './auth.constants';
import { AuthConfig } from './auth.config';
import { LoginDto } from './login.dto';
import { LoginRateLimiter } from './login-rate-limiter.service';
import {
  AuthenticatedSession,
  AuthProfile,
  MembershipProfile,
} from './auth.types';

interface AuthenticationCandidateRow {
  user_id: string;
  email: string;
  display_name: string;
  user_status: string;
  authorization_version: string;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | null;
  active_membership_count: number;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  authorization_version: string;
  selected_membership_id: string | null;
  csrf_token_hash: string;
}

interface CreatedSessionRow {
  session_id: string;
  user_id: string;
  authorization_version: string;
  selected_membership_id: string;
}

interface RotatedSessionRow {
  rotation_result: 'ok' | 'invalid' | 'expired' | 'replay';
  rotated_user_id: string | null;
  rotated_authorization_version: string | null;
  rotated_selected_membership_id: string | null;
  rotated_token_family_id: string | null;
  rotated_absolute_expires_at: Date | null;
}

interface MembershipRow {
  membership_id: string;
  organization_id: string;
  organization_code: string;
  organization_name: string;
  role_code: string;
  is_default: boolean;
  is_selected: boolean;
}

interface PermissionRow {
  permission_code: string;
}

interface AccessClaims extends JwtPayload {
  sub: string;
  sid: string;
  av: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash = '';

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AuthConfig,
    private readonly loginRateLimiter: LoginRateLimiter,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(
      'not-a-real-automotive-search-password',
      {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      },
    );
  }

  issuePreAuthenticationCsrf(response: Response): { csrfToken: string } {
    const csrfToken = this.randomSecret();
    this.setCsrfCookie(response, csrfToken, this.config.loginWindowSeconds);
    return { csrfToken };
  }

  async login(
    input: LoginDto,
    request: Request,
    response: Response,
  ): Promise<AuthProfile> {
    this.assertDoubleSubmitCsrf(request);
    const ipHash = this.clientIpHash(request);
    this.loginRateLimiter.assertAllowed(ipHash);
    const normalizedEmail = input.email.trim().toLowerCase();
    const candidateResult =
      await this.database.query<AuthenticationCandidateRow>(
        'SELECT * FROM security.auth_lookup_user($1::citext)',
        [normalizedEmail],
      );
    const candidate = candidateResult.rows[0];
    const passwordHash = candidate?.password_hash ?? this.dummyPasswordHash;
    const passwordMatches = await argon2.verify(passwordHash, input.password);
    const isLocked =
      candidate?.locked_until !== null &&
      candidate?.locked_until !== undefined &&
      new Date(candidate.locked_until).getTime() > Date.now();
    const isEligible =
      candidate &&
      passwordMatches &&
      !isLocked &&
      candidate.user_status === 'active' &&
      candidate.active_membership_count > 0;

    if (!isEligible) {
      this.loginRateLimiter.recordFailure(ipHash);
      let lockedNow = false;
      if (candidate && !isLocked) {
        const failure = await this.database.query<{
          failed_count: number;
          locked_until: Date | null;
        }>('SELECT * FROM security.auth_record_failure($1, $2, $3)', [
          candidate.user_id,
          this.config.loginAccountLimit,
          this.config.loginWindowSeconds,
        ]);
        lockedNow = failure.rows[0]?.locked_until !== null;
      }
      await this.audit(
        request,
        candidate?.user_id ?? null,
        null,
        null,
        lockedNow ? 'auth.lockout' : 'auth.login',
        'deny',
        { clientIpHash: ipHash, reason: 'generic-authentication-failure' },
      );
      throw this.invalidCredentials();
    }

    await this.database.query('SELECT security.auth_record_success($1)', [
      candidate.user_id,
    ]);
    this.loginRateLimiter.clear(ipHash);

    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshSecret = this.randomSecret();
    const csrfToken = this.randomSecret();
    const now = Date.now();
    const idleExpiresAt = new Date(
      now + this.config.refreshIdleTtlSeconds * 1000,
    );
    const absoluteExpiresAt = new Date(
      now + this.config.refreshAbsoluteTtlSeconds * 1000,
    );
    const sessionResult = await this.database.query<CreatedSessionRow>(
      `
        SELECT * FROM security.auth_create_session(
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
      `,
      [
        sessionId,
        candidate.user_id,
        familyId,
        this.refreshHash(refreshSecret),
        this.csrfHash(csrfToken),
        idleExpiresAt,
        absoluteExpiresAt,
        ipHash,
        this.userAgent(request),
      ],
    );
    const session = sessionResult.rows[0];
    const accessToken = this.signAccessToken(
      candidate.user_id,
      session.session_id,
      Number(session.authorization_version),
    );
    this.setSessionCookies(
      response,
      accessToken,
      `${session.session_id}.${refreshSecret}`,
      csrfToken,
    );

    const profile = await this.profileFor(
      session.session_id,
      candidate.user_id,
      candidate.email,
      candidate.display_name,
    );
    await this.audit(
      request,
      candidate.user_id,
      profile.activeContext?.organizationId ?? null,
      session.session_id,
      'auth.login',
      'allow',
      { clientIpHash: ipHash },
    );
    return profile;
  }

  async authenticateAccess(request: Request): Promise<AuthenticatedSession> {
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) {
      throw this.authenticationRequired();
    }

    let claims: AccessClaims;
    try {
      claims = jwt.verify(token, this.config.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      }) as AccessClaims;
    } catch {
      throw this.authenticationRequired();
    }

    if (
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string' ||
      !Number.isInteger(claims.av)
    ) {
      throw this.authenticationRequired();
    }

    const sessionResult = await this.database.query<SessionRow>(
      'SELECT * FROM security.auth_access_session($1, $2)',
      [claims.sid, claims.sub],
    );
    const session = sessionResult.rows[0];
    if (!session || Number(session.authorization_version) !== claims.av) {
      throw this.authenticationRequired();
    }

    return this.toAuthenticatedSession(session);
  }

  async refresh(request: Request, response: Response): Promise<AuthProfile> {
    this.assertDoubleSubmitCsrf(request);
    const csrfToken = this.csrfFromRequest(request);
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as
      string | undefined;
    const parsed = this.parseRefreshToken(refreshToken);
    if (!parsed) {
      this.clearSessionCookies(response);
      throw this.authenticationRequired();
    }

    const replacementSessionId = randomUUID();
    const replacementRefreshSecret = this.randomSecret();
    const replacementCsrfToken = this.randomSecret();
    const replacementIdleExpiry = new Date(
      Date.now() + this.config.refreshIdleTtlSeconds * 1000,
    );
    const result = await this.database.query<RotatedSessionRow>(
      `
        SELECT * FROM security.auth_rotate_session(
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
      `,
      [
        parsed.sessionId,
        this.refreshHash(parsed.secret),
        this.csrfHash(csrfToken),
        replacementSessionId,
        this.refreshHash(replacementRefreshSecret),
        this.csrfHash(replacementCsrfToken),
        replacementIdleExpiry,
        this.clientIpHash(request),
        this.userAgent(request),
      ],
    );
    const rotation = result.rows[0];

    if (
      !rotation ||
      rotation.rotation_result !== 'ok' ||
      !rotation.rotated_user_id
    ) {
      this.clearSessionCookies(response);
      await this.audit(
        request,
        rotation?.rotated_user_id ?? null,
        null,
        rotation?.rotated_user_id ? parsed.sessionId : null,
        rotation?.rotation_result === 'replay'
          ? 'auth.refresh-replay'
          : 'auth.refresh',
        'deny',
        { reason: rotation?.rotation_result ?? 'invalid' },
      );
      throw this.authenticationRequired();
    }

    const accessToken = this.signAccessToken(
      rotation.rotated_user_id,
      replacementSessionId,
      Number(rotation.rotated_authorization_version),
    );
    this.setSessionCookies(
      response,
      accessToken,
      `${replacementSessionId}.${replacementRefreshSecret}`,
      replacementCsrfToken,
    );
    const profile = await this.profileFor(
      replacementSessionId,
      rotation.rotated_user_id,
    );
    await this.audit(
      request,
      rotation.rotated_user_id,
      profile.activeContext?.organizationId ?? null,
      replacementSessionId,
      'auth.refresh',
      'allow',
      {},
    );
    return profile;
  }

  async me(session: AuthenticatedSession): Promise<AuthProfile> {
    return this.profileFor(
      session.sessionId,
      session.userId,
      session.email,
      session.displayName,
    );
  }

  async selectOrganization(
    session: AuthenticatedSession,
    organizationId: string,
    request: Request,
    response: Response,
  ): Promise<AuthProfile> {
    this.verifySessionCsrf(request, session);
    const selected = await this.database.query<{
      auth_select_membership: string | null;
    }>('SELECT security.auth_select_membership($1, $2, $3)', [
      session.sessionId,
      session.userId,
      organizationId,
    ]);
    if (!selected.rows[0]?.auth_select_membership) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'The organization context is not available.',
      });
    }

    const accessToken = this.signAccessToken(
      session.userId,
      session.sessionId,
      session.authorizationVersion,
    );
    this.setAccessCookie(response, accessToken);
    const profile = await this.profileFor(
      session.sessionId,
      session.userId,
      session.email,
      session.displayName,
    );
    await this.audit(
      request,
      session.userId,
      organizationId,
      session.sessionId,
      'auth.organization-context',
      'allow',
      {},
    );
    return profile;
  }

  async logout(
    session: AuthenticatedSession,
    request: Request,
    response: Response,
  ): Promise<void> {
    this.verifySessionCsrf(request, session);
    await this.database.query(
      'SELECT security.auth_revoke_session($1, $2, $3)',
      [session.sessionId, session.userId, 'logout'],
    );
    await this.audit(
      request,
      session.userId,
      null,
      session.sessionId,
      'auth.logout',
      'allow',
      {},
    );
    this.clearSessionCookies(response);
  }

  async logoutAll(
    session: AuthenticatedSession,
    request: Request,
    response: Response,
  ): Promise<void> {
    this.verifySessionCsrf(request, session);
    await this.database.query('SELECT security.auth_logout_all($1)', [
      session.userId,
    ]);
    await this.audit(
      request,
      session.userId,
      null,
      session.sessionId,
      'auth.logout-all',
      'allow',
      {},
    );
    this.clearSessionCookies(response);
  }

  private async profileFor(
    sessionId: string,
    userId: string,
    knownEmail?: string,
    knownDisplayName?: string,
  ): Promise<AuthProfile> {
    let email = knownEmail;
    let displayName = knownDisplayName;
    if (!email || !displayName) {
      const session = await this.database.query<SessionRow>(
        'SELECT * FROM security.auth_access_session($1, $2)',
        [sessionId, userId],
      );
      if (!session.rows[0]) {
        throw this.authenticationRequired();
      }
      email = session.rows[0].email;
      displayName = session.rows[0].display_name;
    }

    const membershipsResult = await this.database.query<MembershipRow>(
      'SELECT * FROM security.auth_list_memberships($1, $2)',
      [sessionId, userId],
    );
    const memberships: MembershipProfile[] = membershipsResult.rows.map(
      (row) => ({
        membershipId: row.membership_id,
        organizationId: row.organization_id,
        organizationCode: row.organization_code,
        organizationName: row.organization_name,
        role: row.role_code,
        isDefault: row.is_default,
        isSelected: row.is_selected,
      }),
    );
    const active =
      memberships.find((membership) => membership.isSelected) ?? null;
    const capabilitiesResult = await this.database.query<PermissionRow>(
      'SELECT * FROM security.auth_capabilities($1, $2)',
      [sessionId, userId],
    );

    return {
      user: { id: userId, email, displayName },
      activeContext: active
        ? {
            organizationId: active.organizationId,
            organizationCode: active.organizationCode,
            organizationName: active.organizationName,
            membershipId: active.membershipId,
            role: active.role,
          }
        : null,
      memberships,
      capabilities: capabilitiesResult.rows.map((row) => row.permission_code),
    };
  }

  private signAccessToken(
    userId: string,
    sessionId: string,
    authorizationVersion: number,
  ): string {
    return jwt.sign(
      { sid: sessionId, av: authorizationVersion },
      this.config.accessTokenSecret,
      {
        algorithm: 'HS256',
        audience: ACCESS_TOKEN_AUDIENCE,
        issuer: ACCESS_TOKEN_ISSUER,
        subject: userId,
        jwtid: randomUUID(),
        expiresIn: this.config.accessTokenTtlSeconds,
      },
    );
  }

  private setSessionCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
    csrfToken: string,
  ): void {
    this.setAccessCookie(response, accessToken);
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.httpOnlyCookieOptions(),
      path: '/api/v1/auth',
      maxAge: this.config.refreshIdleTtlSeconds * 1000,
    });
    this.setCsrfCookie(response, csrfToken, this.config.refreshIdleTtlSeconds);
  }

  private setAccessCookie(response: Response, accessToken: string): void {
    response.cookie(ACCESS_COOKIE, accessToken, {
      ...this.httpOnlyCookieOptions(),
      path: '/',
      maxAge: this.config.accessTokenTtlSeconds * 1000,
    });
  }

  private setCsrfCookie(
    response: Response,
    csrfToken: string,
    ttlSeconds: number,
  ): void {
    response.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: ttlSeconds * 1000,
    });
  }

  private clearSessionCookies(response: Response): void {
    response.clearCookie(ACCESS_COOKIE, {
      ...this.httpOnlyCookieOptions(),
      path: '/',
    });
    response.clearCookie(REFRESH_COOKIE, {
      ...this.httpOnlyCookieOptions(),
      path: '/api/v1/auth',
    });
    response.clearCookie(CSRF_COOKIE, {
      httpOnly: false,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
    });
  }

  private httpOnlyCookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax' as const,
    };
  }

  private assertDoubleSubmitCsrf(request: Request): void {
    const cookie = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const header = request.header(CSRF_HEADER);
    if (!cookie || !header || !this.safeEqual(cookie, header)) {
      throw new ForbiddenException({
        code: 'CSRF_FAILED',
        message: 'The request could not be verified.',
      });
    }
  }

  verifySessionCsrf(request: Request, session: AuthenticatedSession): void {
    this.assertDoubleSubmitCsrf(request);
    if (
      !this.safeEqual(
        this.csrfHash(this.csrfFromRequest(request)),
        session.csrfTokenHash,
      )
    ) {
      throw new ForbiddenException({
        code: 'CSRF_FAILED',
        message: 'The request could not be verified.',
      });
    }
  }

  private csrfFromRequest(request: Request): string {
    return (request.header(CSRF_HEADER) ?? '').trim();
  }

  private parseRefreshToken(
    token: string | undefined,
  ): { sessionId: string; secret: string } | null {
    if (!token) return null;
    const parts = token.split('.');
    if (
      parts.length !== 2 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parts[0],
      ) ||
      parts[1].length < 32
    ) {
      return null;
    }
    return { sessionId: parts[0], secret: parts[1] };
  }

  private refreshHash(secret: string): string {
    return this.hmac(`refresh:${secret}`);
  }

  private csrfHash(secret: string): string {
    return this.hmac(`csrf:${secret}`);
  }

  private clientIpHash(request: Request): string {
    return this.hmac(
      `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`,
    );
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.config.refreshTokenSecret)
      .update(value)
      .digest('hex');
  }

  private randomSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private userAgent(request: Request): string {
    return (request.header('user-agent') ?? 'unknown').slice(0, 512);
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  }

  private authenticationRequired(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required.',
    });
  }

  private async audit(
    request: Request,
    actorUserId: string | null,
    organizationId: string | null,
    sessionId: string | null,
    action: string,
    decision: 'allow' | 'deny' | 'error',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.database.query(
      'SELECT security.auth_record_event($1, $2, $3, $4, $5, $6, $7::jsonb)',
      [
        request.requestId,
        actorUserId,
        organizationId,
        sessionId,
        action,
        decision,
        JSON.stringify(metadata),
      ],
    );
  }

  private toAuthenticatedSession(row: SessionRow): AuthenticatedSession {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      authorizationVersion: Number(row.authorization_version),
      selectedMembershipId: row.selected_membership_id,
      csrfTokenHash: row.csrf_token_hash,
    };
  }
}
