import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import type {
  CreateMembershipDto,
  CreateUserDto,
  UpdateMembershipDto,
  UpdateUserDto,
  UserListQueryDto,
} from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async list(session: AuthenticatedSession, query: UserListQueryDto) {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<{
        id: string;
        email: string;
        display_name: string;
        status: string;
        resource_version: number;
        membership_id: string;
        role_code: string;
      }>(
        `SELECT user_account.id, user_account.email::text, user_account.display_name,
                user_account.status, user_account.resource_version,
                membership.id AS membership_id, role.code AS role_code
         FROM app.app_users user_account
         JOIN app.organization_memberships membership ON membership.user_id = user_account.id
         JOIN security.roles role ON role.id = membership.role_id
         WHERE membership.organization_id = security.authz_current_uuid('app.organization_id')
           AND ($1::uuid IS NULL OR user_account.id > $1)
         ORDER BY user_account.id LIMIT $2`,
        [query.cursor ?? null, query.limit + 1],
      );
      const hasMore = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      return {
        items: rows.map((row) => ({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          status: row.status,
          version: row.resource_version,
          membershipId: row.membership_id,
          role: row.role_code,
        })),
        nextCursor: hasMore ? rows.at(-1)!.id : null,
      };
    });
  }

  async findOne(session: AuthenticatedSession, id: string) {
    return this.database.withAuthorizationContext(session, async (client) => {
      const user = await client.query<{
        id: string;
        email: string;
        display_name: string;
        status: string;
        resource_version: number;
      }>(
        'SELECT id, email::text, display_name, status, resource_version FROM app.app_users WHERE id = $1',
        [id],
      );
      if (!user.rows[0]) this.notFound();
      const memberships = await client.query<{
        id: string;
        organization_id: string;
        organization_code: string;
        organization_name: string;
        role_code: string;
        status: string;
        is_default: boolean;
        resource_version: number;
      }>(
        `SELECT membership.id, membership.organization_id, organization.code AS organization_code,
                organization.name AS organization_name, role.code AS role_code,
                membership.status, membership.is_default, membership.resource_version
         FROM app.organization_memberships membership
         JOIN app.organizations organization ON organization.id = membership.organization_id
         JOIN security.roles role ON role.id = membership.role_id
         WHERE membership.user_id = $1 ORDER BY organization.code`,
        [id],
      );
      return {
        id: user.rows[0].id,
        email: user.rows[0].email,
        displayName: user.rows[0].display_name,
        status: user.rows[0].status,
        version: user.rows[0].resource_version,
        memberships: memberships.rows.map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          organizationCode: row.organization_code,
          organizationName: row.organization_name,
          role: row.role_code,
          status: row.status,
          isDefault: row.is_default,
          version: row.resource_version,
        })),
      };
    });
  }

  async create(session: AuthenticatedSession, input: CreateUserDto) {
    const userId = await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const organizationId =
          input.organizationId ??
          (
            await client.query<{ id: string }>(
              "SELECT security.authz_current_uuid('app.organization_id') AS id",
            )
          ).rows[0].id;
        const organization = await client.query(
          "SELECT id FROM app.organizations WHERE id = $1 AND status = 'active'",
          [organizationId],
        );
        if (organization.rowCount !== 1) this.notFound();
        const role = await client.query<{ id: string }>(
          `SELECT id FROM security.roles
         WHERE code = $1 AND status = 'active' AND organization_id IS NULL`,
          [input.roleCode],
        );
        if (!role.rows[0] || input.roleCode === 'GLOBAL_ADMIN') {
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message: 'The requested role cannot be assigned.',
          });
        }
        const newUserId = randomUUID();
        await client.query(
          `INSERT INTO app.app_users (id, email, display_name, status)
         VALUES ($1, $2, $3, 'invited')`,
          [newUserId, input.email.toLowerCase(), input.displayName.trim()],
        );
        await client.query(
          `INSERT INTO app.organization_memberships (
           user_id, organization_id, role_id, status, is_default
         ) VALUES ($1, $2, $3, 'active', true)`,
          [newUserId, organizationId, role.rows[0].id],
        );
        return newUserId;
      },
    );
    return this.findOne(session, userId);
  }

  async update(
    session: AuthenticatedSession,
    id: string,
    version: number,
    input: UpdateUserDto,
  ) {
    if (Object.keys(input).length === 0)
      throw new ConflictException({
        code: 'EMPTY_UPDATE',
        message: 'At least one user field must be supplied.',
      });
    if (id === session.userId && input.status && input.status !== 'active') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: 'You cannot disable your own active account.',
      });
    }
    await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const user = await client.query<{ resource_version: number }>(
          'SELECT resource_version FROM app.app_users WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!user.rows[0]) this.notFound();
        if (user.rows[0].resource_version !== version) this.versionMismatch();
        await client.query(
          `UPDATE app.app_users SET display_name = COALESCE($2, display_name),
             status = COALESCE($3, status), resource_version = resource_version + 1,
             authorization_version = authorization_version + 1 WHERE id = $1`,
          [id, input.displayName?.trim() ?? null, input.status ?? null],
        );
      },
    );
    if (id === session.userId)
      return { id, version: version + 1, sessionInvalidated: true };
    return this.findOne(session, id);
  }

  async createMembership(
    session: AuthenticatedSession,
    userId: string,
    input: CreateMembershipDto,
  ) {
    const membershipId = await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const user = await client.query(
          'SELECT id FROM app.app_users WHERE id = $1',
          [userId],
        );
        if (user.rowCount !== 1) this.notFound();
        const role = await client.query<{ id: string }>(
          `SELECT id FROM security.roles WHERE code = $1 AND status = 'active' AND organization_id IS NULL`,
          [input.roleCode],
        );
        if (!role.rows[0] || input.roleCode === 'GLOBAL_ADMIN')
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message: 'The requested role cannot be assigned.',
          });
        const result = await client.query<{ id: string }>(
          `INSERT INTO app.organization_memberships (user_id, organization_id, role_id, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
          [userId, input.organizationId, role.rows[0].id],
        );
        await client.query(
          'UPDATE app.app_users SET authorization_version = authorization_version + 1 WHERE id = $1',
          [userId],
        );
        return result.rows[0].id;
      },
    );
    return {
      id: membershipId,
      userId,
      organizationId: input.organizationId,
      role: input.roleCode,
      status: 'active',
      version: 1,
    };
  }

  async updateMembership(
    session: AuthenticatedSession,
    id: string,
    version: number,
    input: UpdateMembershipDto,
  ) {
    if (Object.keys(input).length === 0)
      throw new ConflictException({
        code: 'EMPTY_UPDATE',
        message: 'At least one membership field must be supplied.',
      });
    return this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const membership = await client.query<{
          user_id: string;
          organization_id: string;
          resource_version: number;
        }>(
          'SELECT user_id, organization_id, resource_version FROM app.organization_memberships WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!membership.rows[0]) this.notFound();
        if (membership.rows[0].resource_version !== version)
          this.versionMismatch();
        let roleId: string | null = null;
        if (input.roleCode) {
          const role = await client.query<{ id: string }>(
            `SELECT id FROM security.roles WHERE code = $1 AND status = 'active' AND organization_id IS NULL`,
            [input.roleCode],
          );
          if (!role.rows[0] || input.roleCode === 'GLOBAL_ADMIN')
            throw new ForbiddenException({
              code: 'ACCESS_DENIED',
              message: 'The requested role cannot be assigned.',
            });
          roleId = role.rows[0].id;
        }
        await client.query(
          `UPDATE app.organization_memberships
         SET role_id = COALESCE($2, role_id), status = COALESCE($3, status),
             resource_version = resource_version + 1 WHERE id = $1`,
          [id, roleId, input.status ?? null],
        );
        if (input.restrictions) {
          await client.query(
            'DELETE FROM security.user_scope_restrictions WHERE membership_id = $1',
            [id],
          );
          for (const restriction of input.restrictions) {
            const correctTarget =
              (restriction.scopeType === 'category' &&
                restriction.categoryId &&
                !restriction.companyId &&
                !restriction.region) ||
              (restriction.scopeType === 'company' &&
                restriction.companyId &&
                !restriction.categoryId &&
                !restriction.region) ||
              (restriction.scopeType === 'region' &&
                restriction.region &&
                !restriction.categoryId &&
                !restriction.companyId);
            if (!correctTarget)
              throw new ConflictException({
                code: 'INVALID_RESTRICTION',
                message:
                  'Each restriction must contain exactly one matching target.',
              });
            await client.query(
              `INSERT INTO security.user_scope_restrictions (
               membership_id, scope_type, effect, category_id, company_id, region
             ) VALUES ($1,$2,$3,$4,$5,$6)`,
              [
                id,
                restriction.scopeType,
                restriction.effect,
                restriction.categoryId ?? null,
                restriction.companyId ?? null,
                restriction.region?.trim() ?? null,
              ],
            );
          }
        }
        await client.query(
          'UPDATE app.app_users SET authorization_version = authorization_version + 1 WHERE id = $1',
          [membership.rows[0].user_id],
        );
        return {
          id,
          userId: membership.rows[0].user_id,
          organizationId: membership.rows[0].organization_id,
          role: input.roleCode,
          status: input.status,
          version: version + 1,
          sessionInvalidated: true,
        };
      },
    );
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'The user or membership was not found.',
    });
  }
  private versionMismatch(): never {
    throw new PreconditionFailedException({
      code: 'VERSION_MISMATCH',
      message: 'The resource has changed. Reload it and retry.',
    });
  }
}
