/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const { createCustomer, createTenant, createDefaultOnboardingSteps } = require('../models');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: [],
  valueMappings: [],
  customerConfigs: []
};

// Seed with example data
function seedData() {
  // Example customer - Acme Corporation
  const exampleCustomer = createCustomer({
    id: 'cust_001',
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    region: 'North America',
    contactEmail: 'onboarding@acme.example.com',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example tenant for Acme
  const exampleTenant = createTenant({
    id: 'tenant_001',
    customerId: 'cust_001',
    status: 'pending',
    plan: 'professional',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example onboarding state - just started, nothing completed
  const exampleOnboardingState = {
    customerId: 'cust_001',
    steps: createDefaultOnboardingSteps(),
    progressPercent: 0
  };

  store.customers.push(exampleCustomer);
  store.tenants.push(exampleTenant);
  store.onboardingStates.push(exampleOnboardingState);
}

// Initialize with seed data
seedData();

// Store access functions
function getCustomers() {
  return [...store.customers];
}

function getCustomerById(id) {
  return store.customers.find(c => c.id === id);
}

function addCustomer(customer) {
  store.customers.push(customer);
  return customer;
}

function getTenants() {
  return [...store.tenants];
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
}

function getOnboardingState(customerId) {
  return store.onboardingStates.find(s => s.customerId === customerId);
}

function getAllOnboardingStates() {
  return [...store.onboardingStates];
}

function addOnboardingState(state) {
  store.onboardingStates.push(state);
  return state;
}

function updateOnboardingState(customerId, updates) {
  const index = store.onboardingStates.findIndex(s => s.customerId === customerId);
  if (index !== -1) {
    store.onboardingStates[index] = { ...store.onboardingStates[index], ...updates };
    return store.onboardingStates[index];
  }
  return null;
}

/**
 * Saved CS value-mapping choices for a customer.
 * @returns {Record<string, Record<string, string>>} vocabulary -> raw -> value
 */
function getValueMappings(customerKey) {
  const overrides = {};
  for (const m of store.valueMappings.filter(m => m.customerKey === customerKey)) {
    overrides[m.vocabulary] = { ...overrides[m.vocabulary], [m.raw]: m.value };
  }
  return overrides;
}

function upsertValueMapping(mapping) {
  const index = store.valueMappings.findIndex(m =>
    m.customerKey === mapping.customerKey && m.vocabulary === mapping.vocabulary && m.raw === mapping.raw
  );
  if (index !== -1) {
    store.valueMappings[index] = mapping;
  } else {
    store.valueMappings.push(mapping);
  }
  return mapping;
}

function getCustomerConfig(customerKey) {
  return store.customerConfigs.find(c => c.customerKey === customerKey);
}

function upsertCustomerConfig(customerKey, updates) {
  const index = store.customerConfigs.findIndex(c => c.customerKey === customerKey);
  if (index !== -1) {
    store.customerConfigs[index] = { ...store.customerConfigs[index], ...updates };
    return store.customerConfigs[index];
  }
  const config = { customerKey, ...updates };
  store.customerConfigs.push(config);
  return config;
}

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  getTenants,
  getTenantByCustomerId,
  addTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState,
  getValueMappings,
  upsertValueMapping,
  getCustomerConfig,
  upsertCustomerConfig
};
