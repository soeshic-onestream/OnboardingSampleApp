/**
 * Canonical picklist vocabularies used by value mapping.
 *
 * Each vocabulary lists the target values and the known source aliases.
 * Aliases in `review` are shipped defaults that CS should confirm before
 * relying on them (see docs/value-mapping-checklist.md, section 4).
 */

const VOCABULARIES = {
  'client.status': {
    label: 'Client status',
    values: ['active', 'inactive', 'pending'],
    aliases: { A: 'active', I: 'inactive', P: 'pending', Dormant: 'inactive', Suspended: 'pending' },
    review: ['Suspended']
  },
  'client.entityType': {
    label: 'Entity type',
    values: ['corporation', 's_corporation', 'llc', 'partnership', 'sole_proprietor', 'non_profit'],
    aliases: {
      Corp: 'corporation',
      'Limited Company': 'corporation',
      SCorp: 's_corporation',
      'S-Corporation': 's_corporation',
      LLP: 'llc',
      Part: 'partnership',
      Sole: 'sole_proprietor',
      'Sole Proprietorship': 'sole_proprietor',
      'Sole Trader': 'sole_proprietor',
      NProf: 'non_profit',
      'Non-Profit': 'non_profit'
    },
    review: ['Limited Company', 'LLP']
  },
  'client.paymentTerms': {
    label: 'Payment terms (days)',
    values: ['0', '7', '14', '15', '30', '45', '60', '90'],
    aliases: { 'Due on Receipt': '0', COD: '0', Immediate: '0' },
    review: [],
    coerce: 'integer',
    parse: raw => raw.match(/^(?:net)?\s*(\d+)\s*(?:days?)?$/i)?.[1]
  },
  'contact.status': {
    label: 'Contact status',
    values: ['active', 'inactive', 'pending'],
    aliases: { Y: 'active', N: 'inactive', P: 'pending', Dormant: 'inactive', Suspended: 'pending' },
    review: ['Suspended']
  },
  'contact.preferredChannel': {
    label: 'Preferred channel',
    values: ['email', 'phone', 'sms'],
    aliases: { Text: 'sms' },
    review: []
  },
  'account.type': {
    label: 'Account type',
    values: ['asset', 'liability', 'equity', 'revenue', 'expense'],
    aliases: {
      Assets: 'asset',
      Liabilities: 'liability',
      Capital: 'equity',
      Income: 'revenue',
      'Direct Costs': 'expense',
      Overheads: 'expense',
      'Finance Costs': 'expense'
    },
    review: []
  },
  'account.normalBalance': {
    label: 'Normal balance',
    values: ['debit', 'credit'],
    aliases: { DR: 'debit', D: 'debit', CR: 'credit', C: 'credit' },
    review: []
  },
  'account.isActive': {
    label: 'Account active',
    values: ['true', 'false'],
    aliases: { Active: 'true', 1: 'true', Yes: 'true', Y: 'true', Inactive: 'false', 0: 'false', No: 'false', N: 'false' },
    review: [],
    coerce: 'boolean'
  },
  'transaction.type': {
    label: 'Transaction type',
    values: ['debit', 'credit'],
    aliases: { DR: 'debit', D: 'debit', CR: 'credit', C: 'credit' },
    review: []
  },
  'transaction.status': {
    label: 'Transaction status',
    values: ['completed', 'pending', 'cancelled'],
    aliases: {
      Cleared: 'completed',
      Posted: 'completed',
      Reconciled: 'completed',
      Unreconciled: 'pending',
      Voided: 'cancelled',
      Void: 'cancelled'
    },
    review: ['Unreconciled']
  },
  'transaction.paymentMethod': {
    label: 'Payment method',
    values: [
      'wire', 'ach', 'check', 'card', 'cash', 'bank_transfer', 'direct_debit',
      'standing_order', 'bank_fee', 'journal_entry', 'financing', 'other'
    ],
    aliases: {
      'Wire Transfer': 'wire',
      EFT: 'ach',
      BACS: 'ach',
      'Direct Deposit': 'ach',
      Cheque: 'check',
      'Credit Card': 'card',
      'Card Payment': 'card',
      'Petty Cash': 'cash',
      Bank: 'bank_transfer',
      'Bank Charge': 'bank_fee',
      Fee: 'bank_fee',
      JE: 'journal_entry',
      Lease: 'financing',
      HP: 'financing',
      'Online Payment': 'other'
    },
    review: ['EFT', 'Direct Deposit', 'Petty Cash', 'Lease', 'HP', 'Financing', 'Online Payment']
  }
};

/**
 * Target fields per entity. `type` drives normalization; picklist fields
 * name the vocabulary they are mapped against.
 */
const TARGET_SCHEMA = {
  clients: {
    id: { type: 'text' },
    name: { type: 'text' },
    entityType: { type: 'picklist', vocabulary: 'client.entityType' },
    status: { type: 'picklist', vocabulary: 'client.status' },
    startDate: { type: 'date' },
    taxId: { type: 'text' },
    annualRevenue: { type: 'number' },
    industry: { type: 'text' },
    paymentTermsDays: { type: 'picklist', vocabulary: 'client.paymentTerms' },
    primaryContact: { type: 'text' }
  },
  contacts: {
    id: { type: 'text' },
    clientId: { type: 'text' },
    firstName: { type: 'text' },
    lastName: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    jobTitle: { type: 'text' },
    status: { type: 'picklist', vocabulary: 'contact.status' },
    preferredChannel: { type: 'picklist', vocabulary: 'contact.preferredChannel' },
    department: { type: 'text' }
  },
  accounts: {
    number: { type: 'text' },
    name: { type: 'text' },
    type: { type: 'picklist', vocabulary: 'account.type' },
    subType: { type: 'text' },
    normalBalance: { type: 'picklist', vocabulary: 'account.normalBalance' },
    isActive: { type: 'picklist', vocabulary: 'account.isActive' },
    description: { type: 'text' },
    parentNumber: { type: 'text' }
  },
  transactions: {
    id: { type: 'text' },
    date: { type: 'date' },
    clientId: { type: 'text' },
    accountNumber: { type: 'text' },
    description: { type: 'text' },
    type: { type: 'picklist', vocabulary: 'transaction.type' },
    amount: { type: 'number' },
    reference: { type: 'text' },
    paymentMethod: { type: 'picklist', vocabulary: 'transaction.paymentMethod' },
    status: { type: 'picklist', vocabulary: 'transaction.status' },
    category: { type: 'text' }
  }
};

const CURRENCIES = ['USD', 'GBP', 'EUR'];

module.exports = { VOCABULARIES, TARGET_SCHEMA, CURRENCIES };
