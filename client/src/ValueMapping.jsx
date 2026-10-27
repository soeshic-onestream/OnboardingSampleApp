import React, { useState, useEffect, useCallback } from 'react';

const ENTITIES = [
  { id: 'clients', label: 'Clients' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'accounts', label: 'Chart of Accounts' },
  { id: 'transactions', label: 'Transactions' }
];

const STATUS_LABELS = {
  exact: 'Exact match',
  alias: 'Auto-mapped',
  review: 'Confirm',
  manual: 'Saved',
  none: 'Needs mapping'
};

async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function put(url, body) {
  return api(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function ValueMapping() {
  const [meta, setMeta] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerKey, setCustomerKey] = useState('');
  const [entity, setEntity] = useState('clients');
  const [summary, setSummary] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api('/api/value-mappings/vocabularies'), api('/api/value-mappings/customers')])
      .then(([vocabularies, customerList]) => {
        setMeta(vocabularies);
        setCustomers(customerList);
        setCustomerKey(customerList[0]?.key ?? '');
      })
      .catch(err => setError(err.message));
  }, []);

  const refresh = useCallback(() => {
    if (!customerKey) return;
    api(`/api/value-mappings/${customerKey}/${entity}`)
      .then(data => {
        setSummary(data);
        setError(null);
      })
      .catch(err => setError(err.message));
  }, [customerKey, entity]);

  useEffect(() => {
    setPreview(null);
    refresh();
  }, [refresh]);

  const saveValue = (vocabulary, raw, value) =>
    put(`/api/value-mappings/${customerKey}/values`, { vocabulary, raw, value })
      .then(() => {
        setPreview(null);
        refresh();
      })
      .catch(err => setError(err.message));

  const saveConfig = updates =>
    put(`/api/value-mappings/${customerKey}/config`, updates)
      .then(() => {
        setPreview(null);
        refresh();
      })
      .catch(err => setError(err.message));

  const loadPreview = () =>
    api(`/api/value-mappings/${customerKey}/${entity}/preview?limit=20`)
      .then(setPreview)
      .catch(err => setError(err.message));

  if (error && !summary) {
    return <p className="vm-error">⚠️ Value mapping unavailable: {error}</p>;
  }
  if (!meta || customers.length === 0) {
    return <p className="vm-muted">No customer data available for value mapping yet.</p>;
  }

  return (
    <section className="value-mapping">
      <h2>Value Mapping</h2>
      <p className="vm-muted">
        Normalize picklists, dates and numbers to the platform vocabulary.
      </p>

      <div className="vm-toolbar">
        <label>
          Customer{' '}
          <select aria-label="Customer" value={customerKey} onChange={e => setCustomerKey(e.target.value)}>
            {customers.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </label>
        <div className="vm-entities" role="group" aria-label="Data set">
          {ENTITIES.map(e => (
            <button
              key={e.id}
              className={`vm-entity ${entity === e.id ? 'active' : ''}`}
              onClick={() => setEntity(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="vm-error">⚠️ {error}</p>}
      {summary && (
        <>
          <ConfigBar summary={summary} meta={meta} onChange={saveConfig} />
          <StatusBanner summary={summary} />
          <ParseIssues issues={summary.parseIssues} />
          {summary.fields.map(field => (
            <FieldTable key={field.field} field={field} onChange={saveValue} />
          ))}
          <div className="vm-preview-actions">
            <button className="vm-button" onClick={loadPreview}>Show normalized preview</button>
          </div>
          {preview && <Preview preview={preview} />}
        </>
      )}
    </section>
  );
}

function ConfigBar({ summary, meta, onChange }) {
  const { config, detectedDateFormat, dates } = summary;
  return (
    <div className="vm-config">
      <label>
        Date format{' '}
        <select
          aria-label="Date format"
          value={config.dateFormat}
          onChange={e => onChange({ dateFormat: e.target.value })}
        >
          {meta.dateFormats.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      {detectedDateFormat && (
        <span className={detectedDateFormat === config.dateFormat ? 'vm-muted' : 'vm-warning'}>
          Detected: {detectedDateFormat}
        </span>
      )}
      <label>
        Currency{' '}
        <select aria-label="Currency" value={config.currency} onChange={e => onChange({ currency: e.target.value })}>
          {meta.currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {dates.map(d => (
        <span key={d.field} className="vm-date-samples">
          {d.sourceColumn}: {d.samples.map(s => `${s.raw} → ${s.iso ?? 'invalid'}`).join(', ')}
          {d.invalidCount > 0 && <strong className="vm-warning"> ({d.invalidCount} invalid)</strong>}
        </span>
      ))}
    </div>
  );
}

function StatusBanner({ summary }) {
  if (summary.ready && summary.needsAttention === 0) {
    return <p className="vm-banner ok">✓ All {summary.rowCount} rows normalize cleanly</p>;
  }
  const parts = [];
  if (summary.needsAttention > 0) parts.push(`${summary.needsAttention} value(s) need attention`);
  if (summary.invalidCount > 0) parts.push(`${summary.invalidCount} invalid date/number cell(s)`);
  if (summary.parseIssues.length > 0) parts.push(`${summary.parseIssues.length} malformed row(s)`);
  return <p className="vm-banner warn">{parts.join(' · ')}</p>;
}

function ParseIssues({ issues }) {
  if (issues.length === 0) return null;
  return (
    <details className="vm-parse-issues">
      <summary>Malformed rows in the source file (fix the CSV and re-upload)</summary>
      <ul>
        {issues.map(i => <li key={i.line}>Line {i.line}: {i.reason} — <code>{i.text}</code></li>)}
      </ul>
    </details>
  );
}

function FieldTable({ field, onChange }) {
  return (
    <div className="vm-field" data-field={field.field}>
      <h4>
        {field.label} <span className="vm-muted">({field.sourceColumn} → {field.field})</span>
      </h4>
      <table className="vm-table">
        <thead>
          <tr><th>Source value</th><th>Count</th><th>Target value</th><th>Status</th></tr>
        </thead>
        <tbody>
          {field.values.map(v => (
            <tr key={v.raw} className={`vm-row ${v.confidence}`}>
              <td>{v.raw}</td>
              <td>{v.count}</td>
              <td>
                <select
                  aria-label={`${field.sourceColumn} ${v.raw}`}
                  value={v.value ?? ''}
                  onChange={e => onChange(field.vocabulary, v.raw, e.target.value)}
                >
                  {v.value === null && <option value="">— choose —</option>}
                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td>
                {v.confidence === 'review' ? (
                  <button className="vm-link" onClick={() => onChange(field.vocabulary, v.raw, v.value)}>
                    Confirm
                  </button>
                ) : (
                  <span className={`vm-badge ${v.confidence}`}>{STATUS_LABELS[v.confidence]}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function Preview({ preview }) {
  const columns = Object.keys(preview.rows[0]?.normalized ?? {});
  return (
    <div className="vm-preview">
      <h4>Normalized preview (first {preview.rows.length} of {preview.rowCount} rows)</h4>
      <div className="vm-scroll">
        <table className="vm-table">
          <thead>
            <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => {
              const badFields = new Set(row.issues.map(issue => issue.field));
              return (
                <tr key={i}>
                  {columns.map(c => (
                    <td key={c} className={badFields.has(c) ? 'vm-invalid' : ''}>
                      {badFields.has(c) ? row.issues.find(issue => issue.field === c).raw : formatCell(row.normalized[c])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ValueMapping;
