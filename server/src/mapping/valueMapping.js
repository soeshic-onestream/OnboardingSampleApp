/**
 * Value mapping: normalizes picklists, dates and numbers from customer data
 * into the canonical target vocabulary.
 */

const { VOCABULARIES, TARGET_SCHEMA } = require('./vocabularies');

const DATE_FORMATS = {
  'MM/DD/YYYY': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['month', 'day', 'year'] },
  'YYYY-MM-DD': { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['year', 'month', 'day'] },
  'DD-MM-YYYY': { pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['day', 'month', 'year'] }
};

/** Case-, whitespace- and punctuation-insensitive comparison key. */
function normalizeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LOOKUPS = Object.fromEntries(
  Object.entries(VOCABULARIES).map(([key, vocab]) => [
    key,
    {
      values: new Map(vocab.values.map(v => [normalizeKey(v), v])),
      aliases: new Map(Object.entries(vocab.aliases).map(([alias, v]) => [normalizeKey(alias), v])),
      review: new Set(vocab.review.map(normalizeKey))
    }
  ])
);

/**
 * Suggests a canonical value for a raw source value.
 * @returns {{ value: string|null, confidence: 'exact'|'alias'|'review'|'none' }}
 */
function suggestValue(vocabularyKey, raw) {
  const vocab = VOCABULARIES[vocabularyKey];
  const lookup = LOOKUPS[vocabularyKey];
  if (!vocab) throw new Error(`Unknown vocabulary: ${vocabularyKey}`);

  const key = normalizeKey(raw);
  const parsed = vocab.parse?.(String(raw).trim());
  const exact = lookup.values.get(key);
  const value = exact ?? lookup.aliases.get(key) ?? (vocab.values.includes(parsed) ? parsed : null);

  if (value === null) return { value: null, confidence: 'none' };
  if (lookup.review.has(key)) return { value, confidence: 'review' };
  return { value, confidence: exact ? 'exact' : 'alias' };
}

/**
 * Resolves a raw value, letting a CS override win over the suggestion.
 * @param {Record<string, Record<string, string>>} overrides - vocabulary -> raw -> value
 */
function resolveValue(vocabularyKey, raw, overrides = {}) {
  const manual = overrides[vocabularyKey]?.[raw];
  if (manual !== undefined) return { value: manual, confidence: 'manual' };
  return suggestValue(vocabularyKey, raw);
}

/** Parses a date in the given format and returns ISO `YYYY-MM-DD`, or null if invalid. */
function normalizeDate(raw, format) {
  const spec = DATE_FORMATS[format];
  if (!spec) throw new Error(`Unknown date format: ${format}`);

  const match = String(raw ?? '').trim().match(spec.pattern);
  if (!match) return null;

  const parts = Object.fromEntries(spec.order.map((name, i) => [name, Number(match[i + 1])]));
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const isRealDate =
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day;
  return isRealDate ? date.toISOString().slice(0, 10) : null;
}

/**
 * Returns the only date format that parses every value, or null when none or
 * several do (an ambiguous column must be confirmed by CS).
 */
function detectDateFormat(values) {
  const present = values.filter(v => String(v ?? '').trim() !== '');
  if (present.length === 0) return null;
  const candidates = Object.keys(DATE_FORMATS).filter(format =>
    present.every(v => normalizeDate(v, format) !== null)
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/** Parses an amount like `2500000.00`, `1,250.00`, `(500.00)` or `£12.50`; null if invalid. */
function normalizeNumber(raw) {
  let text = String(raw ?? '').trim().replace(/[£$€,\s]/g, '');
  const negative = /^\(.*\)$/.test(text);
  if (negative) text = text.slice(1, -1);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return negative ? -value : value;
}

function coerce(value, kind) {
  if (kind === 'integer') return Number(value);
  if (kind === 'boolean') return value === 'true';
  return value;
}

/**
 * Normalizes one source row.
 * @param {Record<string, string>} row - raw source row keyed by source column
 * @param {Record<string, string>} columnMap - source column -> target field
 * @param {string} entity - key of TARGET_SCHEMA
 * @param {{ dateFormat: string, currency: string }} config
 * @param {Record<string, Record<string, string>>} overrides
 * @returns {{ normalized: Record<string, unknown>, issues: { field: string, raw: string, reason: string }[] }}
 */
function normalizeRow(row, columnMap, entity, config, overrides = {}) {
  const schema = TARGET_SCHEMA[entity];
  if (!schema) throw new Error(`Unknown entity: ${entity}`);

  const normalized = {};
  const issues = [];

  for (const [sourceColumn, field] of Object.entries(columnMap)) {
    const definition = schema[field];
    if (!definition) continue;

    const raw = String(row[sourceColumn] ?? '').trim();
    if (raw === '') {
      normalized[field] = null;
      continue;
    }

    if (definition.type === 'picklist') {
      const { value } = resolveValue(definition.vocabulary, raw, overrides);
      if (value === null) issues.push({ field, raw, reason: 'unmapped value' });
      normalized[field] = value === null ? null : coerce(value, VOCABULARIES[definition.vocabulary].coerce);
    } else if (definition.type === 'date') {
      const value = normalizeDate(raw, config.dateFormat);
      if (value === null) issues.push({ field, raw, reason: `not a valid ${config.dateFormat} date` });
      normalized[field] = value;
    } else if (definition.type === 'number') {
      const value = normalizeNumber(raw);
      if (value === null) issues.push({ field, raw, reason: 'not a number' });
      normalized[field] = value;
    } else {
      normalized[field] = raw;
    }
  }

  if (Object.values(schema).some(d => d.type === 'number')) {
    normalized.currency = config.currency;
  }

  return { normalized, issues };
}

/**
 * Lists each picklist field's distinct source values with counts and the
 * resolved target value, for the CS review table.
 */
function summarizeValues(rows, columnMap, entity, overrides = {}) {
  const schema = TARGET_SCHEMA[entity];
  return Object.entries(columnMap)
    .filter(([, field]) => schema[field]?.type === 'picklist')
    .map(([sourceColumn, field]) => {
      const vocabulary = schema[field].vocabulary;
      const counts = new Map();
      for (const row of rows) {
        const raw = String(row[sourceColumn] ?? '').trim();
        if (raw !== '') counts.set(raw, (counts.get(raw) ?? 0) + 1);
      }
      const values = [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([raw, count]) => {
          const suggestion = suggestValue(vocabulary, raw);
          const { value, confidence } = resolveValue(vocabulary, raw, overrides);
          return { raw, count, value, confidence, suggested: suggestion.value };
        });
      return {
        field,
        sourceColumn,
        vocabulary,
        label: VOCABULARIES[vocabulary].label,
        options: VOCABULARIES[vocabulary].values,
        values
      };
    });
}

/** Source columns mapped to date fields, with their raw values. */
function dateColumns(rows, columnMap, entity) {
  const schema = TARGET_SCHEMA[entity];
  return Object.entries(columnMap)
    .filter(([, field]) => schema[field]?.type === 'date')
    .map(([sourceColumn, field]) => ({ field, sourceColumn, values: rows.map(r => r[sourceColumn]) }));
}

module.exports = {
  DATE_FORMATS,
  normalizeKey,
  suggestValue,
  resolveValue,
  normalizeDate,
  detectDateFormat,
  normalizeNumber,
  normalizeRow,
  summarizeValues,
  dateColumns
};
