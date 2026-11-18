import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export type FieldAccess = 'allow' | 'omit' | 'mask';

@Injectable()
export class FieldAccessService {
  async catalogFieldAccess(
    client: PoolClient,
    field: string,
  ): Promise<FieldAccess> {
    const result = await client.query<{ access: FieldAccess }>(
      'SELECT security.authz_field_access($1) AS access',
      [field],
    );
    return result.rows[0]?.access ?? 'omit';
  }

  async filterCatalogRecord(
    client: PoolClient,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const protectedFields = [
      'costUsd',
      'supplierStatus',
      'sourceSystem',
      'sourceRecordId',
    ];
    const result = await client.query<{
      field_name: string;
      access: FieldAccess;
    }>(
      `
        SELECT field_name, security.authz_field_access(field_name) AS access
        FROM unnest($1::text[]) field_name
      `,
      [protectedFields],
    );
    const decisions = new Map(
      result.rows.map((row) => [row.field_name, row.access]),
    );
    const filtered = { ...record };
    for (const field of protectedFields) {
      const access = decisions.get(field) ?? 'omit';
      if (access === 'omit') delete filtered[field];
      if (access === 'mask' && field in filtered) filtered[field] = null;
    }
    return filtered;
  }
}
