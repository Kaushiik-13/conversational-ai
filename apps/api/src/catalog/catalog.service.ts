import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedSession } from '../auth/auth.types';
import { FieldAccessService } from '../authorization/field-access.service';
import { DatabaseService } from '../database/database.service';
import type { CatalogFacet, CatalogRecord } from './catalog.types';
import type { CreateCatalogPartDto, UpdateCatalogPartDto } from './catalog.dto';

interface CatalogRecordRow {
  id: number;
  part_number: string;
  part_name: string;
  description: string;
  commodity: string;
  sub_commodity: string;
  manufacturer: string;
  vehicle_program: string;
  region: string;
  country: string;
  plant: string;
  model_year: number;
  material: string;
  lifecycle_status: string;
  supplier_status: string;
  cost_usd: string;
  weight_kg: string;
  security_domain_id: number;
  primary_category_id: number;
  source_system: string;
  source_record_id: string | null;
  document_version: number;
  active: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fieldAccess: FieldAccessService,
  ) {}

  async findOne(
    session: AuthenticatedSession,
    id: number,
  ): Promise<Record<string, unknown>> {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<CatalogRecordRow>(
        `
          SELECT
            id, part_number, part_name, description, commodity, sub_commodity,
            manufacturer, vehicle_program, region, country, plant, model_year,
            material, lifecycle_status, supplier_status, cost_usd, weight_kg,
            security_domain_id, primary_category_id, source_system,
            source_record_id, document_version, active
          FROM catalog.part_catalog
          WHERE id = $1
        `,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException({
          code: 'CATALOG_RECORD_NOT_FOUND',
          message: 'The catalog record was not found.',
        });
      }
      const record: CatalogRecord = {
        id: Number(row.id),
        partNumber: row.part_number,
        partName: row.part_name,
        description: row.description,
        commodity: row.commodity,
        subCommodity: row.sub_commodity,
        manufacturer: row.manufacturer,
        vehicleProgram: row.vehicle_program,
        region: row.region,
        country: row.country,
        plant: row.plant,
        modelYear: row.model_year,
        material: row.material,
        lifecycleStatus: row.lifecycle_status,
        supplierStatus: row.supplier_status,
        costUsd: row.cost_usd,
        weightKg: row.weight_kg,
        securityDomainId: Number(row.security_domain_id),
        primaryCategoryId: Number(row.primary_category_id),
        sourceSystem: row.source_system,
        sourceRecordId: row.source_record_id,
        version: row.document_version,
        active: row.active,
      };
      return this.fieldAccess.filterCatalogRecord(
        client,
        record as unknown as Record<string, unknown>,
      );
    });
  }

  async create(
    session: AuthenticatedSession,
    input: CreateCatalogPartDto,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const requestHash = this.requestHash(input);
    const partId = await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const existing = await client.query<{
          request_hash: string;
          response_body: { id: number } | null;
        }>(
          `SELECT request_hash, response_body
           FROM app.idempotency_keys
           WHERE user_id = $1
             AND organization_id = security.authz_current_uuid('app.organization_id')
             AND http_method = 'POST' AND route = '/catalog/parts'
             AND idempotency_key = $2 AND expires_at > clock_timestamp()`,
          [session.userId, idempotencyKey],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].request_hash !== requestHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CONFLICT',
              message:
                'The idempotency key was already used for another request.',
            });
          }
          if (existing.rows[0].response_body?.id) {
            return existing.rows[0].response_body.id;
          }
        } else {
          const inserted = await client.query(
            `INSERT INTO app.idempotency_keys (
               user_id, organization_id, http_method, route,
               idempotency_key, request_hash
             ) VALUES (
               $1, security.authz_current_uuid('app.organization_id'),
               'POST', '/catalog/parts', $2, $3
             ) ON CONFLICT DO NOTHING`,
            [session.userId, idempotencyKey, requestHash],
          );
          if (inserted.rowCount === 0) {
            const raced = await client.query<{
              request_hash: string;
              response_body: { id: number } | null;
            }>(
              `SELECT request_hash, response_body FROM app.idempotency_keys
               WHERE user_id = $1
                 AND organization_id = security.authz_current_uuid('app.organization_id')
                 AND http_method = 'POST' AND route = '/catalog/parts'
                 AND idempotency_key = $2`,
              [session.userId, idempotencyKey],
            );
            if (
              raced.rows[0]?.request_hash !== requestHash ||
              !raced.rows[0].response_body?.id
            ) {
              throw new ConflictException({
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'The idempotency key is already in use.',
              });
            }
            return raced.rows[0].response_body.id;
          }
        }

        if (
          input.visibilityStatus === 'internal' &&
          !(await this.isGlobalAdmin(client))
        ) {
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message: 'Only Global Admin can create internal records.',
          });
        }
        await this.assertVisibleCategories(client, [
          input.securityDomainId,
          input.primaryCategoryId,
          ...(input.secondaryCategoryIds ?? []),
        ]);

        const result = await client.query<{ id: number }>(
          `INSERT INTO catalog.part_catalog (
             company_id, tenant_id, part_number, part_name, description,
             commodity, sub_commodity, manufacturer, vehicle_program, region,
             country, plant, model_year, material, lifecycle_status,
             supplier_status, cost_usd, weight_kg, security_domain_id,
             primary_category_id, visibility_status, source_system
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             $17,$18,$19,$20,$21,'application'
           ) RETURNING id`,
          [
            input.companyId,
            input.tenantId,
            input.partNumber.trim(),
            input.partName.trim(),
            input.description,
            input.commodity.trim(),
            input.subCommodity.trim(),
            input.manufacturer.trim(),
            input.vehicleProgram.trim(),
            input.region.trim(),
            input.country.trim(),
            input.plant.trim(),
            input.modelYear,
            input.material.trim(),
            input.lifecycleStatus.trim(),
            input.supplierStatus.trim(),
            input.costUsd,
            input.weightKg,
            input.securityDomainId,
            input.primaryCategoryId,
            input.visibilityStatus,
          ],
        );
        const id = Number(result.rows[0].id);
        const assignments = [
          { categoryId: input.primaryCategoryId, type: 'primary' },
          ...(input.secondaryCategoryIds ?? [])
            .filter((categoryId) => categoryId !== input.primaryCategoryId)
            .map((categoryId) => ({ categoryId, type: 'secondary' })),
        ];
        for (const assignment of assignments) {
          await client.query(
            `INSERT INTO catalog.part_categories (
               part_id, category_id, assignment_type, source
             ) VALUES ($1, $2, $3, 'manual')`,
            [id, assignment.categoryId, assignment.type],
          );
        }
        await client.query(
          `UPDATE app.idempotency_keys SET response_body = jsonb_build_object('id', $3::bigint)
           WHERE user_id = $1
             AND organization_id = security.authz_current_uuid('app.organization_id')
             AND http_method = 'POST' AND route = '/catalog/parts'
             AND idempotency_key = $2`,
          [session.userId, idempotencyKey, id],
        );
        return id;
      },
    );
    return this.findOne(session, partId);
  }

  async update(
    session: AuthenticatedSession,
    id: number,
    version: number,
    input: UpdateCatalogPartDto,
  ): Promise<Record<string, unknown>> {
    if (Object.keys(input).length === 0) {
      throw new ConflictException({
        code: 'EMPTY_UPDATE',
        message: 'At least one catalog field must be supplied.',
      });
    }
    await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const current = await client.query<{
          document_version: number;
          security_domain_id: number;
        }>(
          `SELECT document_version, security_domain_id
         FROM catalog.part_catalog WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (!current.rows[0]) this.partNotFound();
        if (current.rows[0].document_version !== version)
          this.versionMismatch();
        if (
          input.securityDomainId !== undefined &&
          input.securityDomainId !==
            Number(current.rows[0].security_domain_id) &&
          !(await this.isGlobalAdmin(client))
        ) {
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message:
              'Only Global Admin can move a record between security domains.',
          });
        }
        await this.assertVisibleCategories(
          client,
          [
            input.securityDomainId,
            input.primaryCategoryId,
            ...(input.secondaryCategoryIds ?? []),
          ].filter(
            (categoryId): categoryId is number => categoryId !== undefined,
          ),
        );
        if (
          input.visibilityStatus === 'internal' &&
          !(await this.isGlobalAdmin(client))
        ) {
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message: 'Only Global Admin can mark a record internal.',
          });
        }

        const fields: Array<[string, unknown]> = [
          ['company_id', input.companyId],
          ['tenant_id', input.tenantId],
          ['part_number', input.partNumber?.trim()],
          ['part_name', input.partName?.trim()],
          ['description', input.description],
          ['commodity', input.commodity?.trim()],
          ['sub_commodity', input.subCommodity?.trim()],
          ['manufacturer', input.manufacturer?.trim()],
          ['vehicle_program', input.vehicleProgram?.trim()],
          ['region', input.region?.trim()],
          ['country', input.country?.trim()],
          ['plant', input.plant?.trim()],
          ['model_year', input.modelYear],
          ['material', input.material?.trim()],
          ['lifecycle_status', input.lifecycleStatus?.trim()],
          ['supplier_status', input.supplierStatus?.trim()],
          ['cost_usd', input.costUsd],
          ['weight_kg', input.weightKg],
          ['security_domain_id', input.securityDomainId],
          ['primary_category_id', input.primaryCategoryId],
          ['visibility_status', input.visibilityStatus],
          ['active', input.active],
        ].filter((entry) => entry[1] !== undefined) as Array<[string, unknown]>;
        const values = fields.map((entry) => entry[1]);
        const assignments = fields.map(
          (entry, index) => `${entry[0]} = $${index + 2}`,
        );
        assignments.push(`document_version = document_version + 1`);
        await client.query(
          `UPDATE catalog.part_catalog SET ${assignments.join(', ')}
         WHERE id = $1`,
          [id, ...values],
        );

        if (
          input.primaryCategoryId !== undefined ||
          input.secondaryCategoryIds !== undefined
        ) {
          const primaryCategoryId =
            input.primaryCategoryId ??
            (
              await client.query<{ primary_category_id: number }>(
                'SELECT primary_category_id FROM catalog.part_catalog WHERE id = $1',
                [id],
              )
            ).rows[0].primary_category_id;
          await client.query(
            'DELETE FROM catalog.part_categories WHERE part_id = $1',
            [id],
          );
          await client.query(
            `INSERT INTO catalog.part_categories (part_id, category_id, assignment_type, source)
           VALUES ($1, $2, 'primary', 'manual')`,
            [id, primaryCategoryId],
          );
          for (const categoryId of input.secondaryCategoryIds ?? []) {
            if (categoryId !== Number(primaryCategoryId)) {
              await client.query(
                `INSERT INTO catalog.part_categories (part_id, category_id, assignment_type, source)
               VALUES ($1, $2, 'secondary', 'manual')`,
                [id, categoryId],
              );
            }
          }
        }
      },
    );
    return this.findOne(session, id);
  }

  async archive(
    session: AuthenticatedSession,
    id: number,
    version: number,
  ): Promise<void> {
    await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const result = await client.query<{ result: string }>(
          `SELECT security.app_archive_catalog_part($1, $2, $3, $4) AS result`,
          [session.sessionId, session.userId, id, version],
        );
        if (result.rows[0]?.result === 'not_found') this.partNotFound();
        if (result.rows[0]?.result === 'version_mismatch')
          this.versionMismatch();
        if (result.rows[0]?.result !== 'ok') {
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message: 'The catalog record cannot be archived.',
          });
        }
      },
    );
  }

  private async isGlobalAdmin(
    client: import('pg').PoolClient,
  ): Promise<boolean> {
    const result = await client.query<{ allowed: boolean }>(
      'SELECT security.authz_is_global_admin() AS allowed',
    );
    return result.rows[0]?.allowed === true;
  }

  private async assertVisibleCategories(
    client: import('pg').PoolClient,
    categoryIds: number[],
  ): Promise<void> {
    const uniqueIds = [...new Set(categoryIds)];
    if (uniqueIds.length === 0) return;
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM catalog.categories WHERE id = ANY($1::bigint[]) AND status = 'active'`,
      [uniqueIds],
    );
    if (result.rows[0].count !== uniqueIds.length) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'One or more categories were not found in the active scope.',
      });
    }
  }

  private requestHash(value: unknown): string {
    const canonical = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(canonical);
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.entries(input as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, canonical(nested)]),
        );
      }
      return input;
    };
    return createHash('sha256')
      .update(JSON.stringify(canonical(value)))
      .digest('hex');
  }

  private partNotFound(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'The catalog record was not found.',
    });
  }

  private versionMismatch(): never {
    throw new PreconditionFailedException({
      code: 'VERSION_MISMATCH',
      message: 'The record has changed. Reload it and retry.',
    });
  }

  async facets(session: AuthenticatedSession): Promise<CatalogFacet[]> {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<{
        security_domain_id: number;
        slug: string;
        name: string;
        count: number;
      }>(`
        SELECT
          part.security_domain_id,
          category.slug,
          category.name,
          count(*)::integer AS count
        FROM catalog.part_catalog part
        JOIN catalog.categories category ON category.id = part.security_domain_id
        GROUP BY part.security_domain_id, category.slug, category.name
        ORDER BY category.slug
      `);
      return result.rows.map((row) => ({
        securityDomainId: Number(row.security_domain_id),
        slug: row.slug,
        name: row.name,
        count: row.count,
      }));
    });
  }
}
