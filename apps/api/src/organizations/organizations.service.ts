import {
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import type { ReplaceEntitlementsDto } from './organizations.dto';

interface OrganizationRow {
  id: string;
  code: string;
  name: string;
  status: string;
  resource_version: number;
  authorization_version: string;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(session: AuthenticatedSession) {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<OrganizationRow>(
        `SELECT id, code, name, status, resource_version, authorization_version
         FROM app.organizations ORDER BY code LIMIT 100`,
      );
      return result.rows.map((row) => this.map(row));
    });
  }

  async findOne(session: AuthenticatedSession, id: string) {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<OrganizationRow>(
        `SELECT id, code, name, status, resource_version, authorization_version
         FROM app.organizations WHERE id = $1`,
        [id],
      );
      if (!result.rows[0]) this.notFound();
      return this.map(result.rows[0]);
    });
  }

  async entitlements(session: AuthenticatedSession, id: string) {
    return this.database.withAuthorizationContext(session, async (client) => {
      const organization = await client.query<{ resource_version: number }>(
        'SELECT resource_version FROM app.organizations WHERE id = $1',
        [id],
      );
      if (!organization.rows[0]) this.notFound();
      const result = await client.query<{
        id: string;
        category_id: number;
        category_slug: string;
        category_name: string;
        effect: string;
        include_descendants: boolean;
        valid_from: string;
        valid_until: string | null;
      }>(
        `SELECT entitlement.id, entitlement.category_id, category.slug AS category_slug,
                category.name AS category_name, entitlement.effect,
                entitlement.include_descendants, entitlement.valid_from, entitlement.valid_until
         FROM security.organization_category_entitlements entitlement
         JOIN catalog.categories category ON category.id = entitlement.category_id
         WHERE entitlement.organization_id = $1
           AND entitlement.valid_from <= clock_timestamp()
           AND (entitlement.valid_until IS NULL OR entitlement.valid_until > clock_timestamp())
         ORDER BY entitlement.effect, category.path`,
        [id],
      );
      return {
        organizationId: id,
        version: organization.rows[0].resource_version,
        entries: result.rows.map((row) => ({
          id: row.id,
          categoryId: Number(row.category_id),
          categorySlug: row.category_slug,
          categoryName: row.category_name,
          effect: row.effect,
          includeDescendants: row.include_descendants,
          validFrom: row.valid_from,
          validUntil: row.valid_until,
        })),
      };
    });
  }

  async replaceEntitlements(
    session: AuthenticatedSession,
    id: string,
    version: number,
    input: ReplaceEntitlementsDto,
  ) {
    await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const organization = await client.query<{ resource_version: number }>(
          'SELECT resource_version FROM app.organizations WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!organization.rows[0]) this.notFound();
        if (organization.rows[0].resource_version !== version)
          this.versionMismatch();
        if (input.entitlements.length > 0) {
          const ids = input.entitlements.map((entry) => entry.categoryId);
          const categories = await client.query<{ count: number }>(
            `SELECT count(*)::integer AS count FROM catalog.categories
           WHERE id = ANY($1::bigint[]) AND status = 'active'`,
            [ids],
          );
          if (categories.rows[0].count !== new Set(ids).size) {
            throw new NotFoundException({
              code: 'NOT_FOUND',
              message: 'One or more entitlement categories were not found.',
            });
          }
        }
        const changedAt = (
          await client.query<{ changed_at: string }>(
            'SELECT clock_timestamp() AS changed_at',
          )
        ).rows[0].changed_at;
        await client.query(
          `UPDATE security.organization_category_entitlements
         SET valid_until = $2
         WHERE organization_id = $1
           AND valid_from <= $2
           AND (valid_until IS NULL OR valid_until > $2)`,
          [id, changedAt],
        );
        for (const entry of input.entitlements) {
          await client.query(
            `INSERT INTO security.organization_category_entitlements (
             organization_id, category_id, effect, include_descendants,
             valid_from, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              entry.categoryId,
              entry.effect,
              entry.includeDescendants,
              changedAt,
              session.userId,
            ],
          );
        }
        await client.query(
          `UPDATE app.organizations
         SET resource_version = resource_version + 1,
             authorization_version = authorization_version + 1
         WHERE id = $1`,
          [id],
        );
        await client.query(
          `UPDATE app.app_users user_account
         SET authorization_version = authorization_version + 1
         WHERE EXISTS (
           SELECT 1 FROM app.organization_memberships membership
           WHERE membership.user_id = user_account.id
             AND membership.organization_id = $1
         )`,
          [id],
        );
      },
    );
    // Every affected access token is intentionally invalid after this commit.
    return {
      organizationId: id,
      version: version + 1,
      entries: input.entitlements,
    };
  }

  private map(row: OrganizationRow) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      version: row.resource_version,
      authorizationVersion: Number(row.authorization_version),
    };
  }
  private notFound(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'The organization was not found.',
    });
  }
  private versionMismatch(): never {
    throw new PreconditionFailedException({
      code: 'VERSION_MISMATCH',
      message: 'The organization has changed. Reload it and retry.',
    });
  }
}
