import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

interface CategoryRow {
  id: number;
  parent_id: number | null;
  slug: string;
  name: string;
  path: string;
  depth: number;
  is_security_domain: boolean;
  status: string;
  resource_version: number;
}

export interface CategoryNode {
  id: number;
  parentId: number | null;
  slug: string;
  name: string;
  path: string;
  depth: number;
  isSecurityDomain: boolean;
  status: string;
  version: number;
  children?: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly database: DatabaseService) {}

  async tree(session: AuthenticatedSession): Promise<CategoryNode[]> {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<CategoryRow>(
        `SELECT id, parent_id, slug, name, path::text, depth,
                is_security_domain, status, resource_version
         FROM catalog.categories WHERE status = 'active' ORDER BY path`,
      );
      const nodes = new Map<number, CategoryNode>();
      for (const row of result.rows) {
        nodes.set(Number(row.id), { ...this.map(row), children: [] });
      }
      const roots: CategoryNode[] = [];
      for (const node of nodes.values()) {
        const parent = node.parentId ? nodes.get(node.parentId) : undefined;
        if (parent) parent.children!.push(node);
        else roots.push(node);
      }
      return roots;
    });
  }

  async findOne(
    session: AuthenticatedSession,
    id: number,
  ): Promise<CategoryNode> {
    return this.database.withAuthorizationContext(session, async (client) => {
      const result = await client.query<CategoryRow>(
        `SELECT id, parent_id, slug, name, path::text, depth,
                is_security_domain, status, resource_version
         FROM catalog.categories WHERE id = $1`,
        [id],
      );
      if (!result.rows[0]) this.notFound();
      return this.map(result.rows[0]);
    });
  }

  async create(
    session: AuthenticatedSession,
    input: CreateCategoryDto,
  ): Promise<CategoryNode> {
    const id = await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const parent = await client.query<{ path: string; depth: number }>(
          "SELECT path::text, depth FROM catalog.categories WHERE id = $1 AND status = 'active'",
          [input.parentId],
        );
        if (!parent.rows[0]) this.notFound();
        const pathLabel = input.slug.replaceAll('-', '_');
        const result = await client.query<{ id: number }>(
          `INSERT INTO catalog.categories (
           parent_id, slug, name, path, depth, is_security_domain
         ) VALUES ($1, $2, $3, ($4 || '.' || $5)::ltree, $6, $7)
         RETURNING id`,
          [
            input.parentId,
            input.slug,
            input.name.trim(),
            parent.rows[0].path,
            pathLabel,
            parent.rows[0].depth + 1,
            input.isSecurityDomain ?? false,
          ],
        );
        return Number(result.rows[0].id);
      },
    );
    return this.findOne(session, id);
  }

  async update(
    session: AuthenticatedSession,
    id: number,
    version: number,
    input: UpdateCategoryDto,
  ): Promise<CategoryNode> {
    if (Object.keys(input).length === 0) {
      throw new ConflictException({
        code: 'EMPTY_UPDATE',
        message: 'At least one category field must be supplied.',
      });
    }
    await this.database.withAuthorizationWriteContext(
      session,
      async (client) => {
        const current = await client.query<CategoryRow>(
          `SELECT id, parent_id, slug, name, path::text, depth,
                is_security_domain, status, resource_version
         FROM catalog.categories WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (!current.rows[0]) this.notFound();
        if (current.rows[0].resource_version !== version)
          this.versionMismatch();
        const moving =
          input.parentId !== undefined &&
          input.parentId !== Number(current.rows[0].parent_id);
        const renamingSlug =
          input.slug !== undefined && input.slug !== current.rows[0].slug;
        if (moving || renamingSlug) {
          const hasParts = await client.query<{ has_parts: boolean }>(
            'SELECT security.taxonomy_subtree_has_parts($1) AS has_parts',
            [id],
          );
          if (hasParts.rows[0]?.has_parts) {
            throw new ConflictException({
              code: 'CATEGORY_IN_USE',
              message:
                'A category subtree containing catalog records cannot be moved or change its slug.',
            });
          }
          const parentId = input.parentId ?? current.rows[0].parent_id;
          if (!parentId || parentId === id) {
            throw new ConflictException({
              code: 'INVALID_PARENT',
              message: 'The category parent is invalid.',
            });
          }
          const parent = await client.query<{ path: string }>(
            "SELECT path::text FROM catalog.categories WHERE id = $1 AND status = 'active'",
            [parentId],
          );
          if (
            !parent.rows[0] ||
            parent.rows[0].path.startsWith(`${current.rows[0].path}.`)
          ) {
            throw new ConflictException({
              code: 'INVALID_PARENT',
              message: 'A category cannot move below its own subtree.',
            });
          }
          const slug = input.slug ?? current.rows[0].slug;
          const newPath = `${parent.rows[0].path}.${slug.replaceAll('-', '_')}`;
          await client.query(
            `UPDATE catalog.categories
           SET path = CASE
                 WHEN id = $1 THEN $2::ltree
                 ELSE ($2::ltree || subpath(path, nlevel($3::ltree)))::ltree
               END,
               depth = nlevel(CASE
                 WHEN id = $1 THEN $2::ltree
                 ELSE ($2::ltree || subpath(path, nlevel($3::ltree)))::ltree
               END) - 1
           WHERE path <@ $3::ltree`,
            [id, newPath, current.rows[0].path],
          );
        }
        await client.query(
          `UPDATE catalog.categories
         SET parent_id = COALESCE($2, parent_id), slug = COALESCE($3, slug),
             name = COALESCE($4, name), resource_version = resource_version + 1
         WHERE id = $1`,
          [
            id,
            input.parentId ?? null,
            input.slug ?? null,
            input.name?.trim() ?? null,
          ],
        );
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
        const current = await client.query<{ resource_version: number }>(
          'SELECT resource_version FROM catalog.categories WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!current.rows[0]) this.notFound();
        if (current.rows[0].resource_version !== version)
          this.versionMismatch();
        const integrity = await client.query<{
          has_children: boolean;
          has_parts: boolean;
        }>(
          `SELECT
           EXISTS (SELECT 1 FROM catalog.categories WHERE parent_id = $1 AND status = 'active') AS has_children,
           security.taxonomy_subtree_has_parts($1) AS has_parts`,
          [id],
        );
        if (integrity.rows[0].has_children || integrity.rows[0].has_parts) {
          throw new ConflictException({
            code: 'CATEGORY_IN_USE',
            message: 'The category has active children or catalog records.',
          });
        }
        await client.query(
          `UPDATE catalog.categories SET status = 'inactive', resource_version = resource_version + 1 WHERE id = $1`,
          [id],
        );
      },
    );
  }

  private map(row: CategoryRow): CategoryNode {
    return {
      id: Number(row.id),
      parentId: row.parent_id === null ? null : Number(row.parent_id),
      slug: row.slug,
      name: row.name,
      path: row.path,
      depth: row.depth,
      isSecurityDomain: row.is_security_domain,
      status: row.status,
      version: row.resource_version,
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'The category was not found.',
    });
  }

  private versionMismatch(): never {
    throw new PreconditionFailedException({
      code: 'VERSION_MISMATCH',
      message: 'The category has changed. Reload it and retry.',
    });
  }
}
