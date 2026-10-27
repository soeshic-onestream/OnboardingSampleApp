const express = require('express');
const store = require('../data/store');
const { VOCABULARIES, TARGET_SCHEMA, CURRENCIES } = require('../mapping/vocabularies');
const {
  DATE_FORMATS,
  normalizeDate,
  detectDateFormat,
  normalizeRow,
  summarizeValues,
  dateColumns
} = require('../mapping/valueMapping');
const { SAMPLE_CUSTOMERS, getSampleCustomer, loadSampleEntity } = require('../mapping/sampleData');

const router = express.Router();

/** Saved config wins, then the sample customer's defaults, then detection. */
function resolveConfig(customerKey, detectedDateFormat) {
  const saved = store.getCustomerConfig(customerKey) ?? {};
  const defaults = getSampleCustomer(customerKey)?.defaults ?? {};
  return {
    dateFormat: saved.dateFormat ?? defaults.dateFormat ?? detectedDateFormat ?? 'YYYY-MM-DD',
    currency: saved.currency ?? defaults.currency ?? 'USD'
  };
}

function buildSummary(customerKey, entity, { rows, columnMap, parseIssues = [] }) {
  const columns = dateColumns(rows, columnMap, entity);
  const detectedDateFormat = detectDateFormat(columns.flatMap(c => c.values));
  const config = resolveConfig(customerKey, detectedDateFormat);
  const overrides = store.getValueMappings(customerKey);

  const fields = summarizeValues(rows, columnMap, entity, overrides);
  const issues = rows.flatMap(row => normalizeRow(row, columnMap, entity, config, overrides).issues);
  const needsAttention = fields
    .flatMap(f => f.values)
    .filter(v => v.confidence === 'none' || v.confidence === 'review').length;

  return {
    customerKey,
    entity,
    rowCount: rows.length,
    config,
    detectedDateFormat,
    parseIssues,
    fields,
    dates: columns.map(({ field, sourceColumn, values }) => ({
      field,
      sourceColumn,
      samples: values.slice(0, 3).map(raw => ({ raw, iso: normalizeDate(raw, config.dateFormat) })),
      invalidCount: values.filter(raw => raw && normalizeDate(raw, config.dateFormat) === null).length
    })),
    unmappedCount: issues.filter(i => i.reason === 'unmapped value').length,
    invalidCount: issues.filter(i => i.reason !== 'unmapped value').length,
    needsAttention,
    ready: issues.length === 0 && parseIssues.length === 0
  };
}

function buildPreview(customerKey, entity, { rows, columnMap }, limit) {
  const detectedDateFormat = detectDateFormat(dateColumns(rows, columnMap, entity).flatMap(c => c.values));
  const config = resolveConfig(customerKey, detectedDateFormat);
  const overrides = store.getValueMappings(customerKey);
  return {
    customerKey,
    entity,
    config,
    rowCount: rows.length,
    rows: rows.slice(0, limit).map(raw => ({ raw, ...normalizeRow(raw, columnMap, entity, config, overrides) }))
  };
}

function previewLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? limit : 20;
}

/** Validates a POSTed dataset; returns an error message or null. */
function datasetError({ customerKey, entity, rows, columnMap }) {
  if (!customerKey) return 'customerKey is required';
  if (!TARGET_SCHEMA[entity]) return `entity must be one of: ${Object.keys(TARGET_SCHEMA).join(', ')}`;
  if (!Array.isArray(rows)) return 'rows must be an array';
  if (!columnMap || typeof columnMap !== 'object') return 'columnMap is required';
  return null;
}

/** Loads sample data for GET routes, or sends 404 and returns null. */
function sampleDataset(req, res) {
  const dataset = loadSampleEntity(req.params.customerKey, req.params.entity);
  if (!dataset) res.status(404).json({ error: 'Customer or entity not found' });
  return dataset;
}

router.get('/vocabularies', (req, res) => {
  res.json({
    vocabularies: Object.fromEntries(
      Object.entries(VOCABULARIES).map(([key, v]) => [key, { label: v.label, values: v.values }])
    ),
    entities: Object.keys(TARGET_SCHEMA),
    dateFormats: Object.keys(DATE_FORMATS),
    currencies: CURRENCIES
  });
});

router.get('/customers', (req, res) => {
  res.json(SAMPLE_CUSTOMERS.map(c => ({ key: c.key, name: c.name, config: resolveConfig(c.key) })));
});

router.post('/suggest', (req, res) => {
  const error = datasetError(req.body);
  if (error) return res.status(400).json({ error });
  res.json(buildSummary(req.body.customerKey, req.body.entity, req.body));
});

router.post('/preview', (req, res) => {
  const error = datasetError(req.body);
  if (error) return res.status(400).json({ error });
  res.json(buildPreview(req.body.customerKey, req.body.entity, req.body, previewLimit(req.body.limit)));
});

router.put('/:customerKey/values', (req, res) => {
  const { vocabulary, raw, value } = req.body;
  if (!VOCABULARIES[vocabulary]) return res.status(400).json({ error: 'Unknown vocabulary' });
  if (typeof raw !== 'string' || raw === '') return res.status(400).json({ error: 'raw is required' });
  if (!VOCABULARIES[vocabulary].values.includes(value)) {
    return res.status(400).json({ error: `value must be one of: ${VOCABULARIES[vocabulary].values.join(', ')}` });
  }
  res.json(store.upsertValueMapping({ customerKey: req.params.customerKey, vocabulary, raw, value }));
});

router.put('/:customerKey/config', (req, res) => {
  const { dateFormat, currency } = req.body;
  if (dateFormat !== undefined && !DATE_FORMATS[dateFormat]) {
    return res.status(400).json({ error: `dateFormat must be one of: ${Object.keys(DATE_FORMATS).join(', ')}` });
  }
  if (currency !== undefined && !CURRENCIES.includes(currency)) {
    return res.status(400).json({ error: `currency must be one of: ${CURRENCIES.join(', ')}` });
  }
  const updates = Object.fromEntries(Object.entries({ dateFormat, currency }).filter(([, v]) => v !== undefined));
  store.upsertCustomerConfig(req.params.customerKey, updates);
  res.json(resolveConfig(req.params.customerKey));
});

router.get('/:customerKey/:entity', (req, res) => {
  const dataset = sampleDataset(req, res);
  if (dataset) res.json(buildSummary(req.params.customerKey, req.params.entity, dataset));
});

router.get('/:customerKey/:entity/preview', (req, res) => {
  const dataset = sampleDataset(req, res);
  if (dataset) res.json(buildPreview(req.params.customerKey, req.params.entity, dataset, previewLimit(req.query.limit)));
});

module.exports = router;
