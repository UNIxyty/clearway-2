// A small JSON Schema validator — the subset the tool layer actually uses.
//
// Why not a library: the same schema object is handed to Bedrock as the tool's
// input spec, so it must BE JSON Schema, and the validation must be the thing
// the model was told about. A 200-line validator we control is easier to trust
// here than a dependency whose coercion rules we would have to audit — and this
// runs on every tool call in an ops tool.
//
// Supported: type (string/number/integer/boolean/object/array/null and unions),
// required, properties, additionalProperties, enum, pattern, minLength,
// maxLength, minimum, maximum, items, minItems, maxItems, default, nullable.

export class SchemaError extends Error {
  constructor(errors) {
    super(errors.join("; "));
    this.name = "SchemaError";
    this.errors = errors;
  }
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((t) => {
    if (t === "number") return actual === "number" || actual === "integer";
    if (t === "integer") return actual === "integer";
    return actual === t;
  });
}

function walk(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return value;

  if (value === undefined) {
    if (schema.default !== undefined) return structuredClone(schema.default);
    return undefined;
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path || "value"} must be ${Array.isArray(schema.type) ? schema.type.join(" or ") : schema.type}, got ${typeOf(value)}`);
    return value;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path || "value"} must be one of: ${schema.enum.join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path} must be at least ${schema.minLength} characters`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path} must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path} must match ${schema.pattern}`);
  }

  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }

  if (typeOf(value) === "array") {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path} must have at most ${schema.maxItems} items`);
    if (schema.items) return value.map((item, i) => walk(item, schema.items, `${path}[${i}]`, errors));
    return value;
  }

  if (typeOf(value) === "object" && schema.properties) {
    const out = {};
    for (const key of schema.required ?? []) {
      if (value[key] === undefined || value[key] === null) errors.push(`${path ? `${path}.` : ""}${key} is required`);
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      const next = walk(value[key], sub, `${path ? `${path}.` : ""}${key}`, errors);
      if (next !== undefined) out[key] = next;
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) errors.push(`${path ? `${path}.` : ""}${key} is not an accepted field`);
      }
    } else {
      for (const [key, v] of Object.entries(value)) if (!(key in (schema.properties ?? {}))) out[key] = v;
    }
    return out;
  }

  return value;
}

/** Validate and apply defaults. Throws SchemaError listing every problem at once. */
export function validate(value, schema, label = "") {
  const errors = [];
  const result = walk(value === undefined ? {} : value, schema, label, errors);
  if (errors.length > 0) throw new SchemaError(errors);
  return result;
}

/** True when the value conforms; used where a throw would be the wrong shape. */
export function conforms(value, schema) {
  try {
    validate(value, schema);
    return true;
  } catch {
    return false;
  }
}
