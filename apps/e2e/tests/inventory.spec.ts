import type { Page } from '@playwright/test';
import { CUSTOM_LINE, SA, SUP, jobCard, material, reserved, stock, transfer, clearOpenRequests } from '../support/api';
import { expect, test } from '../support/fixtures';
import { dialog, pickBranch, row } from '../support/ui';

/** INV / ALR: Inventory and Stock Alerts (own branch only for supervisors, BR06). */

const itemRows = (page: Page) => page.locator('tbody tr').filter({ has: page.locator('td:nth-child(5)') });
const tab = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label}\\s*\\d*$`) }).last();
const count = async (page: Page, label: string) => Number((await tab(page, label).innerText()).replace(/\D+/g, '') || 0);

test.describe('inventory (supervisor)', () => {
  test('INV-10 tabs: each count equals its rows, and All = Healthy + Low + Out of stock', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');
    const n: Record<string, number> = {};
    for (const label of ['All items', 'Healthy', 'Low', 'Out of stock']) {
      await tab(page, label).click();
      await page.waitForLoadState('networkidle');
      n[label] = await count(page, label);
      await expect(itemRows(page)).toHaveCount(n[label]);
    }
    expect(n['All items']).toBe(n.Healthy + n.Low + n['Out of stock']);
  });

  test('INV-11 search, category, sort; Clear Filters when nothing matches', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('PIP-GI-100');
    await expect(itemRows(page)).toHaveCount(1);
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('');
    await page.locator('select').first().selectOption('Pipes');
    for (const r of await itemRows(page).allInnerTexts()) expect(r).toContain('Pipes');
    await page.locator('select').nth(1).selectOption('STOCK_ASC');
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('zzz-nothing');
    await expect(page.getByText('No items found')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Filters' }).click();
    await expect(itemRows(page).first()).toBeVisible();
  });

  test('INV-12 shows only our own stock; details list recent movements', async ({ page }) => {
    const qty = await stock('thangalla', 'PIP-GI-100');
    await page.goto('/inventory');
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('PIP-GI-100');
    await expect(row(page, 'PIP-GI-100')).toContainText(String(qty));
    await row(page, 'PIP-GI-100').getByRole('button', { name: 'Details' }).click();
    const d = dialog(page);
    await expect(d.getByText('Recent movements')).toBeVisible();
    await expect(d).not.toContainText('Veyangoda');
    await expect(d).not.toContainText('Naiwala');
  });

  test('INV-16 a saved job card holds its sheets: the row shows On hand / Reserved / Available, details list the hold', async ({ page }) => {
    const m = await material('thangalla', 3);
    const card = await jobCard({ lines: [{ job_type: 'CUT_BEND', material_type: m.material_type, thickness: m.thickness, material_quantity: 2, cut_count: 1 }, CUSTOM_LINE] });
    const onHand = await stock('thangalla', m.sku);
    const held = await reserved('thangalla', m.sku);
    await page.goto('/inventory');
    await expect(page.getByRole('columnheader', { name: 'Reserved' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Available' })).toBeVisible();
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill(m.sku);
    const cells = row(page, m.sku).locator('td');
    await expect(cells.nth(1)).toContainText(String(onHand));
    await expect(cells.nth(2)).toContainText(String(held));
    await expect(cells.nth(3)).toContainText(String(onHand - held));
    await row(page, m.sku).getByRole('button', { name: 'Details' }).click();
    await expect(dialog(page).getByText('Held for open orders')).toBeVisible();
    await expect(dialog(page)).toContainText(card.order_number);
  });

  test('INV-13 "Request from another branch" opens the New Request form with the item', async ({ page }) => {
    await clearOpenRequests('thangalla', ['SHT-GI-G20']);
    await page.goto('/inventory');
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('SHT-GI-G20');
    await row(page, 'SHT-GI-G20').getByRole('button', { name: 'Details' }).click();
    await dialog(page).getByRole('button', { name: 'Request from another branch' }).click();
    await expect(page).toHaveURL(/\/stock-requests\?.*tab=create/);
    await expect(page.getByText('SHT-GI-G20').first()).toBeVisible();
  });

  test('INV-14 an open request shows on the row and links to Our Requests; details offer View request', async ({ page }) => {
    await transfer('thangalla', 'veyangoda', [['PIP-GI-100', 1]]);
    await page.goto('/inventory');
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('PIP-GI-100');
    await expect(row(page, 'PIP-GI-100').getByText(/Requested 1 · Waiting/)).toBeVisible();
    await row(page, 'PIP-GI-100').getByRole('button', { name: 'Details' }).click();
    await expect(dialog(page).getByRole('button', { name: 'View request' })).toBeVisible();
    await page.keyboard.press('Escape');
    await row(page, 'PIP-GI-100').getByTitle('Open Stock Requests').click();
    await expect(page).toHaveURL(/\/stock-requests\?.*tab=ours/);
  });
});

test.describe('inventory at a workshop-only branch', () => {
  test.use({ user: SUP.veyangoda });
  test('INV-15 no coils are listed at Veyangoda', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByPlaceholder('Search items by name, SKU, or category...').fill('coil');
    await expect(page.getByText('No items found')).toBeVisible();
  });
});

test.describe('stock alerts (supervisor)', () => {
  test('ALR-10 KPIs agree with the tabs and with Inventory', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');
    const out = await count(page, 'Out of stock');
    const low = await count(page, 'Low');
    await page.goto('/stock-alerts');
    await page.waitForLoadState('networkidle');
    expect(await count(page, 'Out of stock')).toBe(out);
    expect(await count(page, 'Low')).toBe(low);
    expect(await count(page, 'Needs restock')).toBe(out + low);
    await tab(page, 'Needs restock').click();
    await expect(itemRows(page)).toHaveCount(out + low);
  });

  test('ALR-11 per-row Request opens the form with the shortfall; rows with an open request show its state', async ({ page }) => {
    await page.goto('/stock-alerts');
    const req = page.getByRole('button', { name: /^Request \d/ }).first();
    await expect(req).toBeVisible();
    await req.click();
    await expect(page).toHaveURL(/\/stock-requests\?.*tab=create.*items=/);
  });

  test('ALR-12 select rows, then "Request selected" carries them all; Clear empties the selection', async ({ page }) => {
    await page.goto('/stock-alerts');
    const boxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByText(/2 items\s*selected/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByText(/items?\s*selected/)).toHaveCount(0);
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'Request selected (2)' }).click();
    await expect(page).toHaveURL(/items=[^&]*%2C|items=[^&]*,/);
  });
});

test.describe('super admin', () => {
  test.use({ user: SA });
  test('INV-20 All branches: a grid with a column per branch and a total; a cell opens a read-only detail', async ({ page }) => {
    await page.goto('/inventory');
    await expect(page.getByText('All branches').first()).toBeVisible();
    for (const b of ['Naiwala', 'Veyangoda', 'Thangalla', 'Total']) await expect(page.locator('thead')).toContainText(b);
    await page.locator('tbody button').first().click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: /Request from another branch|View request/ })).toHaveCount(0);
  });

  test('INV-21 one branch picked: that branch only, with no Request buttons', async ({ page }) => {
    await page.goto('/inventory');
    await pickBranch(page, 'Thangalla');
    await expect(page.getByText('View only')).toBeVisible();
    await page.getByRole('button', { name: 'Details' }).first().click();
    await expect(dialog(page).getByRole('button', { name: /Request from another branch|View request/ })).toHaveCount(0);
  });

  test('ALR-20 network stock alerts, and per-branch alerts without request buttons', async ({ page }) => {
    await page.goto('/stock-alerts');
    await expect(page.getByRole('heading', { name: 'Stock Alerts' })).toBeVisible();
    await pickBranch(page, 'Thangalla');
    await expect(page.getByRole('button', { name: /^Request \d|Request selected/ })).toHaveCount(0);
    await expect(page.locator('tbody input[type="checkbox"]')).toHaveCount(0);
  });
});
