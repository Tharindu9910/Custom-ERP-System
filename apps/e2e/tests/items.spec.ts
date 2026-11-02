import { randomUUID } from 'node:crypto';
import { SA, SUP, call, sql } from '../support/api';
import { expect, test } from '../support/fixtures';
import { dialog, row } from '../support/ui';

/** ITM: new catalogue products — a branch asks, its manager approves (Docs/decisions/0013). */

const MGR = 'manager_thangalla';
const uniq = () => `${Date.now() % 1e6}${Math.floor(Math.random() * 100)}`;

test.describe('supervisor asks', () => {
  test('ITM-10 New item sends a request; it waits under Item requests and is not in Stock Levels', async ({ page }) => {
    const name = `E2E hinge ${uniq()}`;
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'New item' }).click();
    const d = dialog(page);
    await expect(d.getByLabel('SKU')).toHaveCount(0);
    // Category and unit offer what the catalogue already uses, plus "Other…" for a new one
    await expect(d.getByLabel('Category').locator('option', { hasText: 'Bolts' })).toHaveCount(1);
    await expect(d.getByLabel('Unit').locator('option', { hasText: 'length' })).toHaveCount(1);
    await d.getByLabel('Item name').fill(name);
    await d.getByLabel('Category').selectOption('Pipes');
    await d.getByRole('button', { name: 'Send to manager' }).click();
    await expect(page.getByText(/^Sent ".*" to your branch manager\./)).toBeVisible();
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill(name);
    await expect(page.getByText('No items found')).toBeVisible();
    await page.getByRole('button', { name: /Item requests/ }).click();
    await expect(dialog(page).getByText(name)).toBeVisible();
    await expect(dialog(page).getByText('Waiting for approval').first()).toBeVisible();
  });
});

test.describe('branch manager approves', () => {
  test.use({ user: MGR });
  test('ITM-11 Review → Approve with SKU, price and minimum: the item joins Stock Levels', async ({ page }) => {
    const name = `E2E bracket ${uniq()}`;
    const sku = `E2E-BR-${uniq()}`;
    await call(SUP.thangalla, 'POST', '/item-requests', { client_request_id: randomUUID(), name, item_type: 'HARDWARE', category: 'Fittings', unit: 'piece' });
    await page.goto('/inventory');
    await page.getByRole('button', { name: /Item requests/ }).click();
    const list = dialog(page);
    await list.locator('div').filter({ hasText: name }).getByRole('button', { name: 'Review' }).last().click();
    const d = dialog(page);
    await d.getByLabel('SKU').fill(sku);
    await d.getByLabel('Selling price').fill('25');
    await d.getByLabel('Minimum').fill('3');
    await d.getByRole('button', { name: 'Approve and add' }).click();
    await expect(page.getByText(/^Approved: /)).toBeVisible();
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill(sku);
    await expect(row(page, sku)).toBeVisible();
    const [item] = await sql<{ price: number }>(`SELECT price FROM item WHERE sku = $1`, [sku]);
    expect(item.price).toBe(2500);
  });
});

test.describe('head office', () => {
  test.use({ user: SA });
  test('ITM-12 adds a product from Price List → Item prices', async ({ page }) => {
    const sku = `E2E-HO-${uniq()}`;
    await page.goto('/settings/price-list');
    await page.getByRole('button', { name: /Item prices/ }).click();
    await page.getByRole('button', { name: 'Add Item' }).click();
    const d = dialog(page);
    await d.getByLabel('Item name').fill(`Head office clamp ${sku}`);
    await d.getByLabel('Category').selectOption('Pipes');
    await d.getByLabel('SKU').fill(sku);
    await d.getByLabel('Selling price').fill('12');
    await expect(d.getByLabel('Minimum')).toHaveCount(0);
    await d.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByText(`Added ${sku}`)).toBeVisible();
  });
});
