/**
 * Role-based field access for a semantic model document.
 *
 * A model field may declare `access: { resource_type, field_name }`, which maps
 * it to a rule in security.field_access_rules. Fields the current role may not
 * use are removed from the document before it reaches the planner or the query
 * engine, so a hidden field cannot be named, validated or compiled.
 */

export interface AccessMapping {
  resource_type: string;
  field_name: string;
}

export interface ModelField {
  description?: string;
  type?: string;
  groupable?: boolean;
  filterable?: boolean;
  known_values?: string[];
  synonyms?: Record<string, string>;
  aliases?: string[];
  column?: string;
  strategy?: string;
  aggregation?: string;
  access?: AccessMapping;
}

export interface ModelDocument {
  schema_version: number;
  model: string;
  description: string;
  source: { table: string; alias: string; grain?: string };
  authorization?: { require_permission?: string };
  measures: Record<string, ModelField>;
  dimensions: Record<string, ModelField>;
  lookup_fields: Record<string, ModelField>;
  record_fields: Record<string, ModelField>;
  excluded_fields: string[];
  limits: {
    max_dimensions_per_query: number;
    max_filters_per_query: number;
    default_result_limit: number;
    max_result_limit: number;
    max_record_fields: number;
    max_record_rows: number;
  };
}

export type FieldAccessDecision = 'allow' | 'omit' | 'mask';

const SECTIONS = [
  'measures',
  'dimensions',
  'lookup_fields',
  'record_fields',
] as const;

export const accessKey = (mapping: AccessMapping): string =>
  `${mapping.resource_type}\u0000${mapping.field_name}`;

/** Every distinct access mapping the document declares. */
export function collectAccessMappings(
  document: ModelDocument,
): AccessMapping[] {
  const found = new Map<string, AccessMapping>();
  for (const section of SECTIONS) {
    for (const field of Object.values(document[section] ?? {})) {
      if (field.access) found.set(accessKey(field.access), field.access);
    }
  }
  return [...found.values()];
}

export interface FilteredModel {
  document: ModelDocument;
  /** Field keys removed because the role may not use them. */
  hidden: string[];
}

/**
 * Removes every field whose access mapping is not 'allow'. A masked field is
 * hidden as well: aggregating or filtering on masked values would be
 * meaningless. Returns the original object when nothing is removed so that
 * callers can keep using it as a stable cache key.
 */
export function applyFieldAccess(
  document: ModelDocument,
  decisions: ReadonlyMap<string, FieldAccessDecision>,
): FilteredModel {
  const hidden = new Set<string>();
  const kept: Partial<
    Record<(typeof SECTIONS)[number], Record<string, ModelField>>
  > = {};

  for (const section of SECTIONS) {
    const entries = Object.entries(document[section] ?? {});
    const visible = entries.filter(([, field]) => {
      if (!field.access) return true;
      // Anything without an explicit decision is denied.
      return decisions.get(accessKey(field.access)) === 'allow';
    });
    for (const [name] of entries) {
      if (!visible.some(([key]) => key === name)) hidden.add(name);
    }
    if (visible.length !== entries.length) {
      kept[section] = Object.fromEntries(visible);
    }
  }

  if (hidden.size === 0) return { document, hidden: [] };
  return {
    document: { ...document, ...kept },
    hidden: [...hidden].sort(),
  };
}
