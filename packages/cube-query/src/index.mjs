import { engineFor } from "./engine.mjs";

const MAX_SORTS = 3;
const MAX_IN_VALUES = 50;
const MAX_STRING_LENGTH = 256;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function validateFilterValue(engine, field, operator, value, path, errors) {
  const rules = engine.filterFields.get(field);
  const operators = rules.operators;

  if (!operators.has(operator)) {
    addError(
      errors,
      `${path}.operator`,
      "OPERATOR_NOT_ALLOWED",
      `Operator '${operator}' is not allowed for field '${field}'.`,
    );
    return;
  }

  const expectedType = rules.expectedType;
  const values = operator === "in" ? value : [value];

  if (operator === "in" && !Array.isArray(value)) {
    addError(
      errors,
      `${path}.value`,
      "EXPECTED_ARRAY",
      "Operator 'in' requires an array value.",
    );
    return;
  }
  if (operator !== "in" && Array.isArray(value)) {
    addError(
      errors,
      `${path}.value`,
      "UNEXPECTED_ARRAY",
      "Only the in operator accepts an array value.",
    );
    return;
  }
  if (operator === "in" && (value.length < 1 || value.length > MAX_IN_VALUES)) {
    addError(
      errors,
      `${path}.value`,
      "ARRAY_LIMIT_EXCEEDED",
      `An in filter must contain between 1 and ${MAX_IN_VALUES} values.`,
    );
    return;
  }

  for (const [index, item] of values.entries()) {
    const itemPath =
      operator === "in" ? `${path}.value[${index}]` : `${path}.value`;
    if (expectedType === "number") {
      if (
        typeof item !== "number" ||
        !Number.isFinite(item) ||
        (rules.integer && !Number.isInteger(item))
      ) {
        const expected = rules.integer ? "an integer" : "a finite number";
        addError(
          errors,
          itemPath,
          "INVALID_VALUE_TYPE",
          `Field '${field}' requires ${expected}.`,
        );
      }
    } else if (typeof item !== expectedType) {
      addError(
        errors,
        itemPath,
        "INVALID_VALUE_TYPE",
        `Field '${field}' requires a ${expectedType} value.`,
      );
    } else if (rules.date) {
      if (
        Number.isNaN(Date.parse(item)) ||
        !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(item)
      ) {
        addError(
          errors,
          itemPath,
          "INVALID_DATE_VALUE",
          `Field '${field}' requires an ISO date or timestamp.`,
        );
      }
    } else if (expectedType === "string") {
      const invalidCategorySlug =
        rules.slug === true && !/^[a-z][a-z0-9-]{0,126}$/.test(item);
      if (
        item.trim().length === 0 ||
        item.length > MAX_STRING_LENGTH ||
        invalidCategorySlug
      ) {
        addError(
          errors,
          itemPath,
          "INVALID_STRING_VALUE",
          rules.slug === true
            ? "Category filters require a lowercase taxonomy slug."
            : `String values must be non-empty and at most ${MAX_STRING_LENGTH} characters.`,
        );
      }
    }
  }
}

/**
 * Validate and normalize a v1 Cube Query. This function does not authorize a
 * user, create SQL, or execute a query; those remain trusted backend steps.
 * @param {unknown} input
 * @param {object} model the semantic model document the query is checked against
 * @returns {{ valid: true, query: object } | { valid: false, errors: Array<object> }}
 */
export function validateCubeQuery(input, model) {
  const engine = engineFor(model);
  const errors = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        {
          path: "$",
          code: "EXPECTED_OBJECT",
          message: "Cube Query must be a JSON object.",
        },
      ],
    };
  }

  const allowedKeys = new Set([
    "version",
    "model",
    "mode",
    "measures",
    "dimensions",
    "fields",
    "filters",
    "order_by",
    "limit",
  ]);
  if (!hasOnlyKeys(input, allowedKeys)) {
    for (const key of Object.keys(input)) {
      if (!allowedKeys.has(key)) {
        addError(
          errors,
          `$.${key}`,
          "UNKNOWN_PROPERTY",
          `Property '${key}' is not allowed.`,
        );
      }
    }
  }

  if (input.version !== 1) {
    addError(
      errors,
      "$.version",
      "UNSUPPORTED_VERSION",
      "Only Cube Query version 1 is supported.",
    );
  }
  if (input.model !== engine.code) {
    addError(
      errors,
      "$.model",
      "UNKNOWN_MODEL",
      `Only model '${engine.code}' is supported.`,
    );
  }
  const mode =
    input.mode ?? (Array.isArray(input.fields) ? "records" : "aggregate");
  if (!["aggregate", "records"].includes(mode)) {
    addError(
      errors,
      "$.mode",
      "INVALID_MODE",
      "Mode must be aggregate or records.",
    );
  }
  if (mode === "aggregate") {
    if (
      !Array.isArray(input.measures) ||
      input.measures.length < 1 ||
      input.measures.length > 1
    ) {
      addError(
        errors,
        "$.measures",
        "INVALID_MEASURES",
        "Provide exactly one supported measure.",
      );
    } else if (
      input.measures.some((measure) => !engine.measures.has(measure))
    ) {
      addError(
        errors,
        "$.measures",
        "UNKNOWN_MEASURE",
        "One of the approved catalog measures is required.",
      );
    }
    if (input.fields !== undefined)
      addError(
        errors,
        "$.fields",
        "FIELDS_NOT_ALLOWED",
        "Record fields are only allowed in records mode.",
      );
  } else {
    if (
      input.measures !== undefined &&
      (!Array.isArray(input.measures) || input.measures.length > 0)
    ) {
      addError(
        errors,
        "$.measures",
        "MEASURES_NOT_ALLOWED",
        "Records mode does not accept aggregate measures.",
      );
    }
    if (
      input.dimensions !== undefined &&
      (!Array.isArray(input.dimensions) || input.dimensions.length > 0)
    ) {
      addError(
        errors,
        "$.dimensions",
        "DIMENSIONS_NOT_ALLOWED",
        "Records mode returns selected fields, not grouped dimensions.",
      );
    }
    if (
      !Array.isArray(input.fields) ||
      input.fields.length < 1 ||
      input.fields.length > engine.limits.maxRecordFields
    ) {
      addError(
        errors,
        "$.fields",
        "INVALID_FIELDS",
        `Select between 1 and ${engine.limits.maxRecordFields} approved record fields.`,
      );
    } else {
      const seen = new Set();
      input.fields.forEach((field, index) => {
        if (!engine.detailFields.has(field))
          addError(
            errors,
            `$.fields[${index}]`,
            "UNKNOWN_RECORD_FIELD",
            `Record field '${field}' is not allowed.`,
          );
        else if (seen.has(field))
          addError(
            errors,
            `$.fields[${index}]`,
            "DUPLICATE_RECORD_FIELD",
            `Record field '${field}' is repeated.`,
          );
        seen.add(field);
      });
    }
  }

  if (
    !Array.isArray(input.dimensions) ||
    input.dimensions.length > engine.limits.maxDimensions
  ) {
    addError(
      errors,
      "$.dimensions",
      "INVALID_DIMENSIONS",
      `Provide an array of at most ${engine.limits.maxDimensions} dimensions.`,
    );
  } else {
    const seen = new Set();
    input.dimensions.forEach((dimension, index) => {
      if (!engine.dimensions.has(dimension)) {
        addError(
          errors,
          `$.dimensions[${index}]`,
          "UNKNOWN_DIMENSION",
          `Dimension '${dimension}' is not allowed.`,
        );
      } else if (seen.has(dimension)) {
        addError(
          errors,
          `$.dimensions[${index}]`,
          "DUPLICATE_DIMENSION",
          `Dimension '${dimension}' is repeated.`,
        );
      }
      seen.add(dimension);
    });
  }

  if (
    !Array.isArray(input.filters) ||
    input.filters.length > engine.limits.maxFilters
  ) {
    addError(
      errors,
      "$.filters",
      "INVALID_FILTERS",
      `Provide an array of at most ${engine.limits.maxFilters} filters.`,
    );
  } else {
    input.filters.forEach((filter, index) => {
      const path = `$.filters[${index}]`;
      if (!isRecord(filter)) {
        addError(
          errors,
          path,
          "EXPECTED_OBJECT",
          "Each filter must be a JSON object.",
        );
        return;
      }
      const filterKeys = new Set(["field", "operator", "value"]);
      for (const key of Object.keys(filter)) {
        if (!filterKeys.has(key)) {
          addError(
            errors,
            `${path}.${key}`,
            "UNKNOWN_PROPERTY",
            `Filter property '${key}' is not allowed.`,
          );
        }
      }
      if (!engine.filterFields.has(filter.field)) {
        addError(
          errors,
          `${path}.field`,
          "UNKNOWN_FILTER_FIELD",
          `Filter field '${filter.field}' is not allowed.`,
        );
      } else if (typeof filter.operator === "string") {
        validateFilterValue(
          engine,
          filter.field,
          filter.operator,
          filter.value,
          path,
          errors,
        );
      } else {
        addError(
          errors,
          `${path}.operator`,
          "INVALID_OPERATOR",
          "Each filter needs a supported operator.",
        );
      }
      if (!Object.hasOwn(filter, "value")) {
        addError(
          errors,
          `${path}.value`,
          "MISSING_VALUE",
          "Each filter needs a value.",
        );
      }
    });
  }

  if (input.order_by !== undefined) {
    if (!Array.isArray(input.order_by) || input.order_by.length > MAX_SORTS) {
      addError(
        errors,
        "$.order_by",
        "INVALID_SORTS",
        `Provide an array of at most ${MAX_SORTS} sort fields.`,
      );
    } else {
      const seen = new Set();
      input.order_by.forEach((sort, index) => {
        const path = `$.order_by[${index}]`;
        if (!isRecord(sort)) {
          addError(
            errors,
            path,
            "EXPECTED_OBJECT",
            "Each sort entry must be a JSON object.",
          );
          return;
        }
        for (const key of Object.keys(sort)) {
          if (!["field", "direction"].includes(key)) {
            addError(
              errors,
              `${path}.${key}`,
              "UNKNOWN_PROPERTY",
              `Sort property '${key}' is not allowed.`,
            );
          }
        }
        if (!engine.sortFields.has(sort.field)) {
          addError(
            errors,
            `${path}.field`,
            "UNKNOWN_SORT_FIELD",
            `Sort field '${sort.field}' is not allowed.`,
          );
        } else if (seen.has(sort.field)) {
          addError(
            errors,
            `${path}.field`,
            "DUPLICATE_SORT_FIELD",
            `Sort field '${sort.field}' is repeated.`,
          );
        } else if (
          !input.dimensions?.includes(sort.field) &&
          !input.measures?.includes(sort.field) &&
          !input.fields?.includes(sort.field)
        ) {
          addError(
            errors,
            `${path}.field`,
            "SORT_FIELD_NOT_SELECTED",
            "A sort field must also be selected as a dimension or measure.",
          );
        }
        seen.add(sort.field);
        if (!["asc", "desc"].includes(sort.direction)) {
          addError(
            errors,
            `${path}.direction`,
            "INVALID_SORT_DIRECTION",
            "Sort direction must be 'asc' or 'desc'.",
          );
        }
      });
    }
  }

  if (
    input.limit !== undefined &&
    (!Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > engine.limits.maxLimit)
  ) {
    addError(
      errors,
      "$.limit",
      "INVALID_LIMIT",
      `Limit must be an integer between 1 and ${engine.limits.maxLimit}.`,
    );
  }

  if (
    mode === "records" &&
    input.limit !== undefined &&
    input.limit > engine.limits.maxRecordRows
  ) {
    addError(
      errors,
      "$.limit",
      "RECORD_LIMIT_EXCEEDED",
      `Part-detail queries are limited to ${engine.limits.maxRecordRows} rows.`,
    );
  }
  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    query: {
      version: 1,
      model: engine.code,
      mode,
      measures: mode === "aggregate" ? [...input.measures] : [],
      dimensions: mode === "aggregate" ? [...input.dimensions] : [],
      ...(mode === "records" ? { fields: [...input.fields] } : {}),
      filters: input.filters.map((filter) => ({
        field: filter.field,
        operator: filter.operator,
        value: Array.isArray(filter.value) ? [...filter.value] : filter.value,
      })),
      ...(input.order_by === undefined
        ? {}
        : {
            order_by: input.order_by.map(({ field, direction }) => ({
              field,
              direction,
            })),
          }),
      limit: input.limit ?? engine.limits.defaultLimit,
    },
  };
}
