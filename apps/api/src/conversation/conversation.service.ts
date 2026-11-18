import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import type { AuthenticatedSession } from '../auth/auth.types';
import { ApplicationAuditService } from '../common/application-audit.service';
import { DatabaseService } from '../database/database.service';
import { QueryPlannerService } from './query-planner.service';
import type {
  ConversationHistoryItem,
  ConversationPlan,
} from './query-planner.service';

export interface CubeQueryResult {
  query: {
    version: number;
    model: string;
    mode?: 'aggregate' | 'records';
    measures: string[];
    dimensions: string[];
    fields?: string[];
    filters: Array<{ field: string; operator: string; value: unknown }>;
    order_by?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    limit: number;
  };
  rows: Array<Record<string, unknown>>;
}

interface CubeQueryModule {
  compileCubeQuery(input: unknown): { query: CubeQueryResult['query'] };
  executeAuthorizedCubeQuery(
    input: unknown,
    runInAuthorizationContext: (
      operation: (client: PoolClient) => Promise<unknown>,
    ) => Promise<unknown>,
  ): Promise<CubeQueryResult>;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: ApplicationAuditService,
    private readonly planner: QueryPlannerService,
  ) {}

  async ask(
    session: AuthenticatedSession,
    question: string,
    requestId: string,
    history: ConversationHistoryItem[] = [],
  ): Promise<
    | {
        status: 'answered';
        message: string;
        query: CubeQueryResult['query'];
        rows: CubeQueryResult['rows'];
      }
    | { status: 'clarification' | 'unsupported'; message: string }
  > {
    let plan: ConversationPlan = await this.planner.plan(question, history);
    if (plan.status !== 'query') {
      return { status: plan.status, message: plan.message };
    }

    try {
      const cubeQuery = await this.loadCubeQueryModule();
      let validated: CubeQueryResult['query'];
      try {
        validated = cubeQuery.compileCubeQuery(plan.cube_query).query;
      } catch (error) {
        const queryError = (
          error && typeof error === 'object' ? error : {}
        ) as {
          name?: string;
          errors?: unknown;
        };
        if (queryError.name !== 'CubeQueryValidationError') throw error;

        plan = await this.planner.repairInvalidQuery(
          question,
          plan.cube_query,
          queryError.errors,
          history,
        );
        if (plan.status !== 'query') {
          return { status: plan.status, message: plan.message };
        }
        try {
          validated = cubeQuery.compileCubeQuery(plan.cube_query).query;
        } catch (repairError) {
          const invalidRepair =
            repairError && typeof repairError === 'object'
              ? (repairError as { name?: string })
              : {};
          if (invalidRepair.name === 'CubeQueryValidationError') {
            throw new BadGatewayException({
              code: 'INVALID_MODEL_QUERY',
              message:
                'The assistant could not create a query that passed server validation.',
            });
          }
          throw repairError;
        }
      }
      const result = await this.query(session, validated, requestId);
      return {
        status: 'answered',
        message: plan.message,
        query: result.query,
        rows: result.rows,
      };
    } catch (error) {
      const queryError = (error && typeof error === 'object' ? error : {}) as {
        name?: string;
      };
      if (queryError.name === 'CubeQueryValidationError') {
        throw new BadGatewayException({
          code: 'INVALID_MODEL_QUERY',
          message: 'The model proposed a query that failed server validation.',
        });
      }
      throw error;
    }
  }

  async query(
    session: AuthenticatedSession,
    input: unknown,
    requestId: string,
  ): Promise<CubeQueryResult> {
    try {
      const cubeQuery = await this.loadCubeQueryModule();
      const result = await cubeQuery.executeAuthorizedCubeQuery(
        input,
        (operation) =>
          this.database.withAuthorizationContext(session, operation),
      );

      await this.audit.record(
        requestId,
        session,
        'conversation.query',
        'allow',
        'automotive.query',
        null,
        {
          model: result.query.model,
          measures: result.query.measures,
          dimensions: result.query.dimensions,
          mode: result.query.mode ?? 'aggregate',
          fields: result.query.fields ?? [],
          filterFields: result.query.filters.map((filter) => filter.field),
          rowCount: result.rows.length,
        },
      );
      return result;
    } catch (error) {
      const queryError = (error && typeof error === 'object' ? error : {}) as {
        name?: string;
        code?: string;
        errors?: unknown;
      };
      if (queryError.name === 'CubeQueryValidationError') {
        throw new BadRequestException({
          code: 'INVALID_CUBE_QUERY',
          message: 'The requested query is not supported.',
          errors: queryError.errors,
        });
      }
      if (queryError.name === 'CubeQueryAuthorizationError') {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'The active organization or role cannot read this data.',
        });
      }
      if (
        queryError.code === 'ERR_MODULE_NOT_FOUND' ||
        queryError.code === 'QUERY_ENGINE_UNAVAILABLE'
      ) {
        throw new InternalServerErrorException({
          code: 'QUERY_ENGINE_UNAVAILABLE',
          message: 'The conversational query engine is not available.',
        });
      }
      throw error;
    }
  }

  private async loadCubeQueryModule(): Promise<CubeQueryModule> {
    const candidates = [
      process.env.CUBE_QUERY_PACKAGE_ENTRY,
      resolve(process.cwd(), '../../packages/cube-query/src/qgen.mjs'),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const entry = candidates.find((candidate) => existsSync(candidate));
    if (!entry) {
      const error = new Error('Cube Query package entry was not found.');
      Object.assign(error, { code: 'QUERY_ENGINE_UNAVAILABLE' });
      throw error;
    }
    return (await import(pathToFileURL(entry).href)) as CubeQueryModule;
  }
}
