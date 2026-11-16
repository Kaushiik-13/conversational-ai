const MODEL = "automotive_catalog";
const MEASURES = new Set(["part_count", "manufacturer_count"]);
const DIMENSIONS = new Set([
  "manufacturer",
  "commodity",
  "sub_commodity",
  "vehicle_program",
  "region",
  "country",
  "plant",
  "model_year",
  "lifecycle_status",
  "active",
  "category",
]);
const STRING_FIELDS = new Set([
  "manufacturer",
  "commodity",
  "sub_commodity",
  "vehicle_program",
  "region",
  "country",
  "plant",
  "lifecycle_status",
  "category",
  "part_number",
  "part_name",
]);
const FILTER_FIELDS = new Set([...STRING_FIELDS, "model_year", "active"]);
const SORT_FIELDS = new Set([...DIMENSIONS, ...MEASURES]);
const STRING_OPERATORS = new Set(["equals", "in", "contains"]);
const CATEGORY_OPERATORS = new Set(["equals", "in"]);
const NUMBER_OPERATORS = new Set(["equals", "in", "gt", "gte", "lt", "lte"]);
const BOOLEAN_OPERATORS = new Set(["equals", "in"]);
const MAX_DIMENSIONS = 3;
const MAX_FILTERS = 10;
const MAX_SORTS = 3;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;
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

function validateFilterValue(field, operator, value, path, errors) {
  const operators =
    field === "category"
      ? CATEGORY_OPERATORS
      : STRING_FIELDS.has(field)
        ? STRING_OPERATORS
        : field === "model_year"
          ? NUMBER_OPERATORS
          : BOOLEAN_OPERATORS;

  if (!operators.has(operator)) {
    addError(
      errors,
      `${path}.operator`,
      "OPERATOR_NOT_ALLOWED",
      `Operator '${operator}' is not allowed for field '${field}'.`,
    );
    return;
  }

  const expectedType = STRING_FIELDS.has(field)
    ? "string"
    : field === "model_year"
      ? "number"
      : "boolean";
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
        (field === "model_year" && !Number.isInteger(item))
      ) {
        const expected =
          field === "model_year" ? "an integer" : "a finite number";
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
    } else if (expectedType === "string") {
      const invalidCategorySlug =
        field === "category" && !/^[a-z][a-z0-9-]{0,126}$/.test(item);
      if (
        item.trim().length === 0 ||
        item.length > MAX_STRING_LENGTH ||
        invalidCategorySlug
      ) {
        addError(
          errors,
          itemPath,
          "INVALID_STRING_VALUE",
          field === "category"
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
 * @returns {{ valid: true, query: object } | { valid: false, errors: Array<object> }}
 */
export function validateCubeQuery(input) {
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
    "measures",
    "dimensions",
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
  if (input.model !== MODEL) {
    addError(
      errors,
      "$.model",
      "UNKNOWN_MODEL",
      `Only model '${MODEL}' is supported.`,
    );
  }
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
  } else if (input.measures.some((measure) => !MEASURES.has(measure))) {
    addError(
      errors,
      "$.measures",
      "UNKNOWN_MEASURE",
      "Supported measures are part_count and manufacturer_count.",
    );
  }

  if (
    !Array.isArray(input.dimensions) ||
    input.dimensions.length > MAX_DIMENSIONS
  ) {
    addError(
      errors,
      "$.dimensions",
      "INVALID_DIMENSIONS",
      `Provide an array of at most ${MAX_DIMENSIONS} dimensions.`,
    );
  } else {
    const seen = new Set();
    input.dimensions.forEach((dimension, index) => {
      if (!DIMENSIONS.has(dimension)) {
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

  if (!Array.isArray(input.filters) || input.filters.length > MAX_FILTERS) {
    addError(
      errors,
      "$.filters",
      "INVALID_FILTERS",
      `Provide an array of at most ${MAX_FILTERS} filters.`,
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
      if (!FILTER_FIELDS.has(filter.field)) {
        addError(
          errors,
          `${path}.field`,
          "UNKNOWN_FILTER_FIELD",
          `Filter field '${filter.field}' is not allowed.`,
        );
      } else if (typeof filter.operator === "string") {
        validateFilterValue(
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
        if (!SORT_FIELDS.has(sort.field)) {
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
          !input.measures?.includes(sort.field)
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
      input.limit > MAX_LIMIT)
  ) {
    addError(
      errors,
      "$.limit",
      "INVALID_LIMIT",
      `Limit must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    query: {
      version: 1,
      model: MODEL,
      measures: [...input.measures],
      dimensions: [...input.dimensions],
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
      limit: input.limit ?? DEFAULT_LIMIT,
    },
  };
}
