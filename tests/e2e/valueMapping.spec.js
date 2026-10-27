// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Value Mapping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Data Mapping' }).click();
  });

  test('suggests canonical values for a customer picklist', async ({ page }) => {
    await page.getByLabel('Customer').selectOption({ label: 'XYZ Financial Services' });

    await expect(page.getByLabel('clientStatus A')).toHaveValue('active');
    await expect(page.getByLabel('entityType SCORP')).toHaveValue('s_corporation');
  });

  test('saves a CS override', async ({ page }) => {
    await page.getByLabel('Customer').selectOption({ label: 'Premier Bookkeeping' });
    await page.getByRole('button', { name: 'Transactions' }).click();

    const select = page.getByLabel('settlement_method Online Payment');
    await select.selectOption('card');

    const row = page.locator('tr', { has: select });
    await expect(row.locator('.vm-badge')).toHaveText('Saved');
    await expect(select).toHaveValue('card');
  });

  test('shows normalized ISO dates in the preview', async ({ page }) => {
    await page.getByLabel('Customer').selectOption({ label: 'Premier Bookkeeping' });
    await page.getByRole('button', { name: 'Show normalized preview' }).click();

    await expect(page.locator('.vm-preview')).toContainText('2023-03-15');
  });
});
