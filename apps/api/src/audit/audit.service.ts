import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import type { AuditQueryDto } from './audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async list(session: AuthenticatedSession, query: AuditQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 7 * 86_400_000);
    if (from >= to || to.getTime() - from.getTime() > 31 * 86_400_000) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          'The audit date range must be positive and no longer than 31 days.',
      });
    }
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<{
        id: string;
        occurred_at: string;
        request_id: string;
        actor_user_id: string | null;
        organization_id: string | null;
        action: string;
        decision: string;
        resource_type: string | null;
        resource_id: string | null;
        metadata: Record<string, unknown>;
      }>(
        `SELECT id::text, occurred_at, request_id, actor_user_id, organization_id,
                action, decision, resource_type, resource_id, metadata
         FROM audit.audit_events
         WHERE occurred_at >= $1 AND occurred_at < $2
           AND ($3::text IS NULL OR action = $3)
           AND ($4::text IS NULL OR decision = $4)
           AND ($5::uuid IS NULL OR actor_user_id = $5)
           AND ($6::text IS NULL OR resource_type = $6)
           AND ($7::bigint IS NULL OR id < $7)
         ORDER BY id DESC LIMIT $8`,
        [
          from.toISOString(),
          to.toISOString(),
          query.action ?? null,
          query.decision ?? null,
          query.actorId ?? null,
          query.targetType ?? null,
          query.cursor ?? null,
          query.limit + 1,
        ],
      );
      const hasMore = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      return {
        items: rows.map((row) => ({
          id: row.id,
          occurredAt: row.occurred_at,
          requestId: row.request_id,
          actorUserId: row.actor_user_id,
          organizationId: row.organization_id,
          action: row.action,
          decision: row.decision,
          targetType: row.resource_type,
          targetId: row.resource_id,
          metadata: row.metadata,
        })),
        nextCursor: hasMore ? rows.at(-1)!.id : null,
      };
    });
  }
}
