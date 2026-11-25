import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import {
  accessKey,
  applyFieldAccess,
  collectAccessMappings,
  type FieldAccessDecision,
  type ModelDocument,
} from './model-access';

/** The model the conversation uses until organizations can pick their own. */
export const DEFAULT_MODEL_CODE = 'automotive_catalog';

const MAX_CACHED_VIEWS = 200;

export interface ResolvedModel {
  modelId: string;
  versionId: string;
  versionNumber: number;
  /** The published document, reduced to the fields this role may use. */
  document: ModelDocument;
  /** Field keys that exist in the model but are hidden from this role. */
  hidden: string[];
}

interface VersionRow {
  model_id: string;
  version_id: string;
  version_number: number;
}

@Injectable()
export class SemanticService {
  /** Published versions never change, so parsed documents are kept by id. */
  private readonly documents = new Map<string, ModelDocument>();
  /** The role-filtered view of a version, kept so the query engine can cache by object identity. */
  private readonly views = new Map<
    string,
    { document: ModelDocument; hidden: string[] }
  >();

  constructor(private readonly database: DatabaseService) {}

  /**
   * Finds the published model that applies to the signed-in user's
   * organization (its own model, else the platform template) and reduces it to
   * the fields the user's role may use.
   */
  async resolveForSession(
    session: AuthenticatedSession,
    code: string = DEFAULT_MODEL_CODE,
  ): Promise<ResolvedModel> {
    return this.database.withAuthorizationContext(session, async (client) => {
      const found = await client.query<VersionRow>(
        `SELECT m.id AS model_id, v.id AS version_id, v.version_number
         FROM semantic.models m
         JOIN semantic.model_versions v
           ON v.model_id = m.id AND v.status = 'published'
         WHERE m.code = $1
         ORDER BY m.organization_id NULLS LAST
         LIMIT 1`,
        [code],
      );
      const version = found.rows[0];
      if (!version) {
        throw new ServiceUnavailableException({
          code: 'SEMANTIC_MODEL_UNAVAILABLE',
          message:
            'No published data model is available for this organization.',
        });
      }

      let document = this.documents.get(version.version_id);
      if (!document) {
        const loaded = await client.query<{ document: ModelDocument }>(
          'SELECT document FROM semantic.model_versions WHERE id = $1',
          [version.version_id],
        );
        document = loaded.rows[0].document;
        this.documents.set(version.version_id, document);
      }

      const mappings = collectAccessMappings(document);
      const decisions = new Map<string, FieldAccessDecision>();
      if (mappings.length > 0) {
        const result = await client.query<{
          resource_type: string;
          field_name: string;
          access: FieldAccessDecision;
        }>(
          `SELECT r.resource_type, r.field_name,
                  security.authz_resource_field_access(r.resource_type, r.field_name) AS access
           FROM unnest($1::text[], $2::text[]) AS r(resource_type, field_name)`,
          [
            mappings.map((mapping) => mapping.resource_type),
            mappings.map((mapping) => mapping.field_name),
          ],
        );
        for (const row of result.rows) {
          decisions.set(
            accessKey({
              resource_type: row.resource_type,
              field_name: row.field_name,
            }),
            row.access,
          );
        }
      }

      const signature = mappings
        .map(
          (mapping) =>
            `${accessKey(mapping)}=${decisions.get(accessKey(mapping)) ?? 'omit'}`,
        )
        .sort()
        .join('|');
      const viewKey = `${version.version_id}|${signature}`;
      let view = this.views.get(viewKey);
      if (!view) {
        view = applyFieldAccess(document, decisions);
        if (this.views.size >= MAX_CACHED_VIEWS) this.views.clear();
        this.views.set(viewKey, view);
      }

      return {
        modelId: version.model_id,
        versionId: version.version_id,
        versionNumber: version.version_number,
        document: view.document,
        hidden: view.hidden,
      };
    });
  }
}
