const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  suggestValue,
  resolveValue,
  normalizeDate,
  detectDateFormat,
  normalizeNumber,
  normalizeRow,
  summarizeValues
} = require('./valueMapping');
const { SAMPLE_CUSTOMERS, parseCsv, loadSampleEntity } = require('./sampleData');

describe('Value Mapping', () => {
  describe('suggestValue', () => {
    const cases = {
      'client.status': {
        active: ['Active', 'A', 'ACTIVE'],
        inactive: ['Inactive', 'I', 'DORMANT'],
        pending: ['Pending', 'P', 'SUSPENDED']
      },
      'client.entityType': {
        corporation: ['Corporation', 'CORP', 'Limited Company'],
        s_corporation: ['S-Corporation', 'SCORP'],
        llc: ['LLC', 'LLP'],
        partnership: ['Partnership', 'PART'],
        sole_proprietor: ['Sole Proprietorship', 'SOLE', 'Sole Trader'],
        non_profit: ['Non-Profit', 'NPROF']
      },
      'client.paymentTerms': {
        0: ['Due on Receipt', 'COD', 'Immediate'],
        14: ['14 Days'],
        30: ['Net 30', 'NET30', '30 Days']
      },
      'contact.status': {
        active: ['Active', 'Y'],
        inactive: ['Inactive', 'N', 'Dormant'],
        pending: ['Pending', 'P', 'Suspended']
      },
      'contact.preferredChannel': {
        email: ['Email', 'EMAIL'],
        phone: ['Phone', 'PHONE'],
        sms: ['TEXT', 'SMS']
      },
      'account.type': {
        asset: ['Asset', 'ASSET', 'Assets'],
        liability: ['Liability', 'LIABILITY', 'Liabilities'],
        equity: ['Equity', 'EQUITY', 'Capital'],
        revenue: ['Revenue', 'REVENUE', 'Income'],
        expense: ['Expense', 'EXPENSE', 'Direct Costs', 'Overheads', 'Finance Costs']
      },
      'account.normalBalance': { debit: ['Debit', 'DR', 'D'], credit: ['Credit', 'CR', 'C'] },
      'account.isActive': { true: ['Active', '1', 'Yes'] },
      'transaction.type': { debit: ['Debit', 'DR', 'D'], credit: ['Credit', 'CR', 'C'] },
      'transaction.status': {
        completed: ['Cleared', 'POSTED', 'Reconciled'],
        pending: ['Pending', 'PENDING', 'Unreconciled'],
        cancelled: ['Voided', 'VOID', 'Cancelled']
      },
      'transaction.paymentMethod': {
        wire: ['Wire Transfer', 'WIRE', 'Wire'],
        ach: ['ACH', 'EFT', 'BACS', 'Direct Deposit'],
        check: ['Check', 'CHECK', 'Cheque'],
        card: ['Credit Card', 'CARD', 'Card Payment'],
        cash: ['Cash', 'CASH', 'Petty Cash'],
        bank_transfer: ['Bank Transfer', 'BANK', 'Bank'],
        direct_debit: ['Direct Debit'],
        standing_order: ['Standing Order'],
        bank_fee: ['Bank Charge', 'FEE'],
        journal_entry: ['Journal Entry', 'JE'],
        financing: ['Financing', 'LEASE', 'HP'],
        other: ['Online Payment']
      }
    };

    for (const [vocabulary, targets] of Object.entries(cases)) {
      for (const [target, raws] of Object.entries(targets)) {
        it(`maps ${raws.join(', ')} to ${vocabulary} = ${target}`, () => {
          for (const raw of raws) {
            assert.strictEqual(suggestValue(vocabulary, raw).value, target, `raw value "${raw}"`);
          }
        });
      }
    }

    it('reports confidence for exact, alias, review and unknown values', () => {
      assert.strictEqual(suggestValue('client.status', 'ACTIVE').confidence, 'exact');
      assert.strictEqual(suggestValue('client.status', 'A').confidence, 'alias');
      assert.strictEqual(suggestValue('client.status', 'SUSPENDED').confidence, 'review');
      assert.deepStrictEqual(suggestValue('client.status', 'Archived'), { value: null, confidence: 'none' });
    });

    it('rejects payment terms outside the allowed day values', () => {
      assert.strictEqual(suggestValue('client.paymentTerms', 'Net 31').value, null);
    });
  });

  describe('resolveValue', () => {
    it('lets a saved override beat the suggestion', () => {
      const overrides = { 'client.status': { SUSPENDED: 'inactive' } };
      assert.deepStrictEqual(resolveValue('client.status', 'SUSPENDED', overrides), {
        value: 'inactive',
        confidence: 'manual'
      });
    });

    it('falls back to the suggestion without an override', () => {
      assert.strictEqual(resolveValue('client.status', 'A', {}).value, 'active');
    });
  });

  describe('normalizeDate', () => {
    it('parses each supported format to ISO', () => {
      assert.strictEqual(normalizeDate('01/15/2024', 'MM/DD/YYYY'), '2024-01-15');
      assert.strictEqual(normalizeDate('2024-01-15', 'YYYY-MM-DD'), '2024-01-15');
      assert.strictEqual(normalizeDate('15-01-2024', 'DD-MM-YYYY'), '2024-01-15');
    });

    it('returns null for impossible or mismatched dates', () => {
      assert.strictEqual(normalizeDate('31-02-2024', 'DD-MM-YYYY'), null);
      assert.strictEqual(normalizeDate('15/01/2024', 'MM/DD/YYYY'), null);
      assert.strictEqual(normalizeDate('2024-01-15', 'DD-MM-YYYY'), null);
    });
  });

  describe('detectDateFormat', () => {
    it('detects the single format that parses every value', () => {
      assert.strictEqual(detectDateFormat(['01/15/2024', '12/01/2023']), 'MM/DD/YYYY');
      assert.strictEqual(detectDateFormat(['2024-01-15']), 'YYYY-MM-DD');
      assert.strictEqual(detectDateFormat(['15-01-2024', '']), 'DD-MM-YYYY');
    });

    it('returns null when no format parses every value', () => {
      assert.strictEqual(detectDateFormat(['01/15/2024', '2024-01-15']), null);
      assert.strictEqual(detectDateFormat([]), null);
    });
  });

  describe('normalizeNumber', () => {
    it('parses plain, grouped, negative and currency-prefixed amounts', () => {
      assert.strictEqual(normalizeNumber('2500000.00'), 2500000);
      assert.strictEqual(normalizeNumber('1850000'), 1850000);
      assert.strictEqual(normalizeNumber('1,250.50'), 1250.5);
      assert.strictEqual(normalizeNumber('(500.00)'), -500);
      assert.strictEqual(normalizeNumber('£12.50'), 12.5);
      assert.strictEqual(normalizeNumber('-3'), -3);
    });

    it('returns null for non-numbers', () => {
      assert.strictEqual(normalizeNumber('abc'), null);
      assert.strictEqual(normalizeNumber(''), null);
    });
  });

  describe('normalizeRow', () => {
    const config = { dateFormat: 'DD-MM-YYYY', currency: 'GBP' };
    const columnMap = { id: 'id', status: 'status', since: 'startDate', revenue: 'annualRevenue', terms: 'paymentTermsDays' };

    it('normalizes picklists, dates, numbers and codes', () => {
      const { normalized, issues } = normalizeRow(
        { id: '0010', status: 'DORMANT', since: '15-03-2023', revenue: '285000.00', terms: '30 Days' },
        columnMap,
        'clients',
        config
      );
      assert.deepStrictEqual(normalized, {
        id: '0010',
        status: 'inactive',
        startDate: '2023-03-15',
        annualRevenue: 285000,
        paymentTermsDays: 30,
        currency: 'GBP'
      });
      assert.deepStrictEqual(issues, []);
    });

    it('reports unmapped values and invalid dates or numbers', () => {
      const { normalized, issues } = normalizeRow(
        { id: 'X', status: 'Archived', since: '31-02-2024', revenue: 'n/a', terms: '' },
        columnMap,
        'clients',
        config
      );
      assert.strictEqual(normalized.status, null);
      assert.strictEqual(normalized.paymentTermsDays, null);
      assert.deepStrictEqual(issues.map(i => i.field), ['status', 'startDate', 'annualRevenue']);
    });

    it('coerces boolean picklists', () => {
      const { normalized } = normalizeRow({ active: 'Yes' }, { active: 'isActive' }, 'accounts', config);
      assert.strictEqual(normalized.isActive, true);
    });
  });

  describe('parseCsv', () => {
    it('honours quoted commas', () => {
      const { rows, parseIssues } = parseCsv('a,b\n"Williams, Robert",2\n');
      assert.deepStrictEqual(rows, [{ a: 'Williams, Robert', b: '2' }]);
      assert.deepStrictEqual(parseIssues, []);
    });

    it('reports rows with an unquoted comma instead of dropping them', () => {
      const { rows, parseIssues } = parseCsv('name,parent\nElectric, gas, water,6000\n');
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(parseIssues[0].line, 2);
    });
  });

  describe('sample data', () => {
    const entities = ['clients', 'contacts', 'accounts', 'transactions'];

    for (const customer of SAMPLE_CUSTOMERS) {
      for (const entity of entities) {
        it(`${customer.name} ${entity}: every picklist value maps and every date and number parses`, () => {
          const { rows, columnMap } = loadSampleEntity(customer.key, entity);
          const unmapped = summarizeValues(rows, columnMap, entity)
            .flatMap(f => f.values.filter(v => v.value === null).map(v => `${f.field}=${v.raw}`));
          assert.deepStrictEqual(unmapped, []);

          const invalid = rows
            .flatMap(row => normalizeRow(row, columnMap, entity, customer.defaults).issues)
            .filter(i => i.reason !== 'unmapped value');
          assert.deepStrictEqual(invalid, []);
        });
      }
    }

    it('flags the two known broken rows', () => {
      assert.strictEqual(loadSampleEntity('xyz', 'clients').parseIssues.length, 12);
      assert.deepStrictEqual(loadSampleEntity('abc', 'accounts').parseIssues.map(i => i.line), [33]);
    });

    it('keeps leading zeros on codes', () => {
      const { rows, columnMap } = loadSampleEntity('premier', 'accounts');
      const { normalized } = normalizeRow(rows[0], columnMap, 'accounts', { dateFormat: 'DD-MM-YYYY', currency: 'GBP' });
      assert.strictEqual(normalized.number, '0010');
    });
  });
});
