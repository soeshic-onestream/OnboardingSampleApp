/**
 * TEMPORARY: loads the three sample customers straight from `sample-data/`
 * with hardcoded column maps, so value mapping works before CSV upload and
 * schema mapping exist. Replace with uploaded rows + saved column maps.
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_DIR = path.join(__dirname, '..', '..', '..', 'sample-data');

const ENTITY_FILES = {
  clients: 'clients.csv',
  contacts: 'contacts.csv',
  accounts: 'chart_of_accounts.csv',
  transactions: 'transactions.csv'
};

const SAMPLE_CUSTOMERS = [
  {
    key: 'abc',
    name: 'ABC Accounting',
    folder: 'CustomerA_ABCAccounting',
    defaults: { dateFormat: 'MM/DD/YYYY', currency: 'USD' },
    columnMaps: {
      clients: {
        'Client ID': 'id', 'Client Name': 'name', 'Business Type': 'entityType', Status: 'status',
        'Date Onboarded': 'startDate', 'Tax ID': 'taxId', 'Annual Revenue': 'annualRevenue',
        Industry: 'industry', 'Payment Terms': 'paymentTermsDays', 'Primary Contact': 'primaryContact'
      },
      contacts: {
        'Contact ID': 'id', 'Client ID': 'clientId', 'First Name': 'firstName', 'Last Name': 'lastName',
        Email: 'email', Phone: 'phone', Role: 'jobTitle', Status: 'status',
        'Preferred Contact Method': 'preferredChannel', Department: 'department'
      },
      accounts: {
        'Account Number': 'number', 'Account Name': 'name', 'Account Type': 'type', 'Sub Type': 'subType',
        'Normal Balance': 'normalBalance', Status: 'isActive', Description: 'description',
        'Parent Account': 'parentNumber'
      },
      transactions: {
        'Transaction ID': 'id', Date: 'date', 'Client ID': 'clientId', 'Account Number': 'accountNumber',
        Description: 'description', 'Transaction Type': 'type', Amount: 'amount',
        'Reference Number': 'reference', 'Payment Method': 'paymentMethod', Status: 'status',
        Category: 'category'
      }
    }
  },
  {
    key: 'xyz',
    name: 'XYZ Financial Services',
    folder: 'CustomerB_XYZFinancialServices',
    defaults: { dateFormat: 'YYYY-MM-DD', currency: 'USD' },
    columnMaps: {
      clients: {
        clientCode: 'id', companyName: 'name', entityType: 'entityType', clientStatus: 'status',
        startDate: 'startDate', federalTaxId: 'taxId', yearlyRevenue: 'annualRevenue',
        sectorCode: 'industry', billingTerms: 'paymentTermsDays', mainContact: 'primaryContact'
      },
      contacts: {
        contactId: 'id', clientCode: 'clientId', firstName: 'firstName', lastName: 'lastName',
        emailAddress: 'email', phoneNumber: 'phone', jobTitle: 'jobTitle', isActive: 'status',
        communicationPreference: 'preferredChannel', businessUnit: 'department'
      },
      accounts: {
        acctCode: 'number', acctName: 'name', acctCategory: 'type', acctSubCategory: 'subType',
        balanceType: 'normalBalance', activeFlag: 'isActive', acctDescription: 'description',
        parentAcctCode: 'parentNumber'
      },
      transactions: {
        txnId: 'id', txnDate: 'date', clientCode: 'clientId', acctCode: 'accountNumber', memo: 'description',
        entryType: 'type', txnAmount: 'amount', docNumber: 'reference', paymentType: 'paymentMethod',
        txnStatus: 'status', expenseCategory: 'category'
      }
    }
  },
  {
    key: 'premier',
    name: 'Premier Bookkeeping',
    folder: 'CustomerC_PremierBookkeeping',
    defaults: { dateFormat: 'DD-MM-YYYY', currency: 'GBP' },
    columnMaps: {
      clients: {
        customer_id: 'id', business_name: 'name', legal_structure: 'entityType', account_status: 'status',
        registration_date: 'startDate', tax_reference: 'taxId', gross_revenue: 'annualRevenue',
        industry_sector: 'industry', credit_terms: 'paymentTermsDays', key_contact_name: 'primaryContact'
      },
      contacts: {
        contact_ref: 'id', customer_id: 'clientId', given_name: 'firstName', family_name: 'lastName',
        email: 'email', telephone: 'phone', position: 'jobTitle', contact_status: 'status',
        preferred_channel: 'preferredChannel', division: 'department'
      },
      accounts: {
        nominal_code: 'number', account_title: 'name', category: 'type', sub_category: 'subType',
        debit_credit: 'normalBalance', is_active: 'isActive', notes: 'description', parent_code: 'parentNumber'
      },
      transactions: {
        transaction_ref: 'id', posting_date: 'date', customer_id: 'clientId', nominal_code: 'accountNumber',
        narrative: 'description', dr_cr: 'type', amount_gbp: 'amount', document_ref: 'reference',
        settlement_method: 'paymentMethod', posting_status: 'status', cost_centre: 'category'
      }
    }
  }
];

/** Splits one CSV line, honouring double-quoted cells. */
function splitCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

/**
 * Parses CSV text into rows keyed by header. Rows whose cell count does not
 * match the header are kept (by position) and reported in `parseIssues`.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const rows = [];
  const parseIssues = [];

  lines.slice(1).forEach((line, index) => {
    const cells = splitCsvLine(line);
    if (cells.length !== headers.length) {
      parseIssues.push({
        line: index + 2,
        reason: `expected ${headers.length} cells but found ${cells.length} (unquoted comma?)`,
        text: line
      });
    }
    rows.push(Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])));
  });

  return { headers, rows, parseIssues };
}

function getSampleCustomer(key) {
  return SAMPLE_CUSTOMERS.find(c => c.key === key);
}

/** Loads one entity for a sample customer, or null if the customer/entity is unknown. */
function loadSampleEntity(customerKey, entity) {
  const customer = getSampleCustomer(customerKey);
  if (!customer || !ENTITY_FILES[entity]) return null;
  const text = fs.readFileSync(path.join(SAMPLE_DIR, customer.folder, ENTITY_FILES[entity]), 'utf8');
  return { ...parseCsv(text), columnMap: customer.columnMaps[entity] };
}

module.exports = {
  ENTITY_FILES,
  SAMPLE_CUSTOMERS,
  parseCsv,
  getSampleCustomer,
  loadSampleEntity
};
