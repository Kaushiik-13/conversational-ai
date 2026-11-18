import { Injectable } from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RolesService {
  constructor(private readonly database: DatabaseService) {}

  async list(session: AuthenticatedSession) {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<{
        id: string;
        code: string;
        name: string;
        permission_code: string | null;
        permission_description: string | null;
        risk_level: string | null;
      }>(
        `SELECT role.id, role.code, role.name,
                permission.code AS permission_code,
                permission.description AS permission_description,
                permission.risk_level
         FROM security.roles role
         LEFT JOIN security.role_permissions role_permission ON role_permission.role_id = role.id
         LEFT JOIN security.permissions permission ON permission.code = role_permission.permission_code
         WHERE role.status = 'active'
           AND role.organization_id IS NULL
           AND (role.code <> 'GLOBAL_ADMIN' OR security.authz_is_global_admin())
         ORDER BY role.code, permission.code`,
      );
      const roles = new Map<
        string,
        {
          id: string;
          code: string;
          name: string;
          permissions: Array<{
            code: string;
            description: string;
            riskLevel: string;
          }>;
        }
      >();
      for (const row of result.rows) {
        const role = roles.get(row.id) ?? {
          id: row.id,
          code: row.code,
          name: row.name,
          permissions: [],
        };
        if (
          row.permission_code &&
          row.permission_description &&
          row.risk_level
        ) {
          role.permissions.push({
            code: row.permission_code,
            description: row.permission_description,
            riskLevel: row.risk_level,
          });
        }
        roles.set(row.id, role);
      }
      return [...roles.values()];
    });
  }
}
