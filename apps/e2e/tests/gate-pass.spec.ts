import { SA, SUP, gatePass, newPhone } from '../support/api';
import { expect, test } from '../support/fixtures';
import { field, pickBranch, row } from '../support/ui';

/** GP: Gate Pass screen (Docs/testing/role-capabilities.md). */

test.describe('supervisor creates gate passes', () => {
  test('GP-10 required fields: customer and at least one material', async ({ page }) => {
    await page.goto('/gate-pass');
    const add = page.getByRole('button', { name: 'Add Material' });
    // Material alone is not enough: it needs thickness, length or quantity
    await expect(add).toBeDisabled();
    await field(page, 'Material Type').fill('MS Plain Sheet');
    await expect(add).toBeDisabled();
    await field(page, 'Thickness').fill('2mm');
    await expect(add).toBeEnabled();
    await field(page, 'Thickness').fill('');
    await expect(page.getByText('None').first()).toBeVisible();
    await field(page, 'Customer Phone Number').fill(newPhone());
    await field(page, 'Customer Name').fill('No Items');
    // Nothing to save until a material is added
    await expect(page.getByRole('button', { name: 'Generate Gate Pass' })).toBeDisabled();
    await field(page, 'Quantity').fill('1');
    await add.click();
    await expect(page.getByRole('button', { name: 'Generate Gate Pass' })).toBeEnabled();
  });

  test('GP-11 add two materials, remove one, generate: the pass appears in the queue', async ({ page }) => {
    const phone = newPhone();
    const name = `Browser Customer ${Date.now() % 1_000_000}`;
    await page.goto('/gate-pass');
    await field(page, 'Customer Phone Number').fill(phone);
    await field(page, 'Customer Name').fill(name);
    await field(page, 'Material Type').fill('MS Plain Sheet');
    await field(page, 'Thickness').fill('2mm');
    await field(page, 'Quantity').fill('6');
    await field(page, 'Color').fill('Blue');
    await page.getByRole('button', { name: 'Add Material' }).click();
    await field(page, 'Material Type').fill('Zinc Coated');
    await field(page, 'Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Material' }).click();
    const added = page.locator('table').first();
    await expect(added.locator('tbody tr')).toHaveCount(2);
    await row(added, 'Zinc Coated').getByRole('button').click();
    await expect(added.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Generate Gate Pass' }).click();
    await expect(page.getByText(/Gate pass #GP-\d+ created/)).toBeVisible();
    await expect(row(page, name)).toBeVisible();
  });

  test('GP-12 colour is offered at a roofing branch', async ({ page }) => {
    await page.goto('/gate-pass');
    await expect(field(page, 'Color')).toBeVisible();
  });
});

test.describe('workshop-only branch', () => {
  test.use({ user: SUP.veyangoda });
  test('GP-13 colour is not asked for at Veyangoda', async ({ page }) => {
    await page.goto('/gate-pass');
    await expect(page.locator('label').filter({ hasText: /^Color/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate Gate Pass' })).toBeVisible();
  });
  test('GP-14 details offer Allocate to Job Card only (no roofing)', async ({ page }) => {
    const gp = await gatePass(SUP.veyangoda);
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: 'Gate Pass Queue' }).click();
    await row(page, gp.pass_number).click();
    await expect(page.getByText('Gate Pass Details')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allocate to Job Card' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allocate to Order Form' })).toHaveCount(0);
  });
});

test.describe('queue', () => {
  test('GP-15 search, status filter and date range narrow the list; Reset clears them', async ({ page }) => {
    const gp = await gatePass();
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: 'Gate Pass Queue' }).click();
    await page.getByPlaceholder('Search gate pass, customer or phone').fill(gp.pass_number);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(row(page, gp.pass_number)).toBeVisible();
    await page.getByPlaceholder('Search gate pass, customer or phone').fill('');
    await field(page, 'Status').selectOption('CLOSED');
    await expect(row(page, gp.pass_number)).toHaveCount(0);
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(row(page, gp.pass_number)).toBeVisible();
    const dates = page.locator('input[type="date"]');
    await dates.nth(0).fill('2000-01-01');
    await dates.nth(1).fill('2000-01-02');
    await expect(page.getByText('None')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(row(page, gp.pass_number)).toBeVisible();
  });

  test('GP-16 the available count matches the Available filter', async ({ page }) => {
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: 'Gate Pass Queue' }).click();
    await field(page, 'Status').selectOption('AVAILABLE');
    await page.waitForLoadState('networkidle');
    const n = Number((await page.getByText(/^\d+ available$/).innerText()).split(' ')[0]);
    expect(n).toBeGreaterThan(0);
    await expect(page.locator('tbody tr')).toHaveCount(n);
  });

  test('GP-17 details → Allocate to Job Card / Order Form open the forms with the pass linked', async ({ page }) => {
    const gp = await gatePass();
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: 'Gate Pass Queue' }).click();
    await row(page, gp.pass_number).click();
    await page.getByRole('button', { name: 'Allocate to Job Card' }).click();
    await expect(page).toHaveURL(new RegExp(`/job-cards/new\\?gatePass=${gp.gate_pass_id}`));
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: 'Gate Pass Queue' }).click();
    await row(page, gp.pass_number).click();
    await page.getByRole('button', { name: 'Allocate to Order Form' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/new\\?gatePass=${gp.gate_pass_id}`));
  });

  test('GP-18 creating from a form (return_to) goes straight back with the pass linked', async ({ page }) => {
    await page.goto('/gate-pass?return_to=job-card');
    await expect(page.getByText(/go straight back to the job card/)).toBeVisible();
    await field(page, 'Customer Phone Number').fill(newPhone());
    await field(page, 'Customer Name').fill('Return Customer');
    await field(page, 'Material Type').fill('MS Plain Sheet');
    await field(page, 'Quantity').fill('3');
    await page.getByRole('button', { name: 'Add Material' }).click();
    await page.getByRole('button', { name: 'Generate Gate Pass' }).click();
    await expect(page).toHaveURL(/\/job-cards\/new\?gatePass=/);
  });
});

test.describe('super admin views gate passes', () => {
  test.use({ user: SA, branch: 'thangalla' });
  test('GP-19 queue and details are readable; no Create tab and no Allocate buttons', async ({ page }) => {
    const gp = await gatePass();
    await page.goto('/gate-pass');
    await expect(page.getByRole('button', { name: 'Create Gate Pass' })).toHaveCount(0);
    await row(page, gp.pass_number).click();
    await expect(page.getByText('Gate Pass Details')).toBeVisible();
    await expect(page.getByRole('button', { name: /Allocate to/ })).toHaveCount(0);
  });
  test('GP-20 switching branch shows that branch\'s passes', async ({ page }) => {
    const gp = await gatePass(SUP.veyangoda);
    await page.goto('/gate-pass');
    await expect(row(page, gp.pass_number)).toHaveCount(0);
    await pickBranch(page, 'Veyangoda');
    await expect(row(page, gp.pass_number)).toBeVisible();
  });
});
