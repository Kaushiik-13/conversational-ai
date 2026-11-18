import { Injectable } from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ApplicationAuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(
    requestId: string,
    session: AuthenticatedSession,
    action: string,
    decision: 'allow' | 'deny' | 'error',
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.database.query(
      `SELECT security.app_record_event(
        $1, $2, NULL, $3, $4, $5, $6, $7, $8::jsonb
      )`,
      [
        requestId,
        session.userId,
        session.sessionId,
        action,
        decision,
        resourceType,
        resourceId,
        JSON.stringify(metadata),
      ],
    );
  }
}
