import type { Page } from '@playwright/test';
import { BRANCH, CUSTOM_LINE, SA, SUP, call, colomboToday, itemId, jobCard, material, reserved, sql, stock, transfer } from '../support/api';
import { expect, test } from '../support/fixtures';
import { dialog, pickBranch, row } from '../support/ui';

const MGR = 'manager_thangalla';
/** INV / ALR: Stock Levels and Restock (own branch only for supervisors, BR06; Docs/decisions/0012). */

const itemRows = (page: Page) => page.locator('tbody tr').filter({ has: page.locator('td:nth-child(5)') });
const SEARCH = 'Search items by name, SKU, or category...';
/** A status card (button) by its title; its accessible name ends with the count. */
// The title runs straight into the note and count ("To restock2 out of stock5"), so no \b
const statusCard = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^${title}(?![a-z])`) });
const cardCount = async (page: Page, title: string) => Number((await statusCard(page, title).innerText()).match(/(\d+)\s*$/)?.[1] ?? 0);

test.describe('stock levels (supervisor)', () => {
  test('INV-10 look-up cards: each count equals its rows; Booked and Requested list only matching items', async ({ page }) => {
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Stock Levels' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const all = (await call(SUP.thangalla, 'GET', '/inventory')).data.rows as { free: number; stock: number; open_request: unknown }[];
    expect(await cardCount(page, 'All items')).toBe(all.length);
    await expect(itemRows(page)).toHaveCount(all.length);
    await statusCard(page, 'Booked').click();
    await expect(itemRows(page)).toHaveCount(all.filter((r) => r.stock - r.free > 0).length);
    await statusCard(page, 'Requested').click();
    await expect(itemRows(page)).toHaveCount(all.filter((r) => !!r.open_request).length);
  });

  test('INV-11 search, category, sort; Clear filters when nothing matches', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByPlaceholder(SEARCH).fill('PIP-GI-100');
    await expect(itemRows(page)).toHaveCount(1);
    await page.getByPlaceholder(SEARCH).fill('');
    await page.getByRole('combobox').nth(0).selectOption('Pipes');
    for (const r of await itemRows(page).allInnerTexts()) expect(r).toContain('Pipes');
    await page.getByRole('combobox').nth(1).selectOption('STOCK_ASC');
    await page.getByPlaceholder(SEARCH).fill('zzz-nothing');
    await expect(page.getByText('No items found')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(itemRows(page).first()).toBeVisible();
  });

  test('INV-12 shows only our own stock; a row opens its details with recent movements', async ({ page }) => {
    const qty = await stock('thangalla', 'PIP-GI-100');
    await page.goto('/inventory');
    await page.getByPlaceholder(SEARCH).fill('PIP-GI-100');
    await expect(row(page, 'PIP-GI-100')).toContainText(String(qty));
    await row(page, 'PIP-GI-100').click();
    const d = dialog(page);
    await expect(d.getByText('Recent movements')).toBeVisible();
    await expect(d).not.toContainText('Veyangoda');
    await expect(d).not.toContainText('Naiwala');
  });

  test('INV-16 a saved job card books its sheets: the row shows On hand / Booked / Free, details list the hold', async ({ page }) => {
    const m = await material('thangalla', 3);
    const card = await jobCard({ lines: [{ job_type: 'CUT_BEND', material_type: m.material_type, thickness: m.thickness, material_quantity: 2, cut_count: 1 }, CUSTOM_LINE] });
    const onHand = await stock('thangalla', m.sku);
    const held = await reserved('thangalla', m.sku);
    await page.goto('/inventory');
    await expect(page.getByRole('columnheader', { name: 'Booked' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Free' })).toBeVisible();
    await page.getByPlaceholder(SEARCH).fill(m.sku);
    const cells = row(page, m.sku).locator('td');
    await expect(cells.nth(1)).toContainText(String(onHand));
    await expect(cells.nth(2)).toContainText(String(held));
    await expect(cells.nth(3)).toContainText(String(onHand - held));
    await row(page, m.sku).click();
    await expect(dialog(page).getByText('Held for open orders')).toBeVisible();
    await expect(dialog(page)).toContainText(card.order_number);
  });

  test('INV-13 Below minimum opens Restock; a low item links there; a supervisor cannot change the minimum', async ({ page }) => {
    await page.goto('/inventory');
    await statusCard(page, 'Below minimum').click();
    await expect(page).toHaveURL(/\/stock-alerts/);
    const low = ((await call(SUP.thangalla, 'GET', '/inventory?status=LOW')).data.rows as { sku: string; open_request: unknown }[]).find((r) => !r.open_request);
    test.skip(!low, 'no low item without a request at Thangalla');
    await page.goto('/inventory');
    await page.getByPlaceholder(SEARCH).fill(low!.sku);
    await row(page, low!.sku).click();
    const d = dialog(page);
    await expect(d.getByText('Minimum', { exact: true })).toBeVisible();
    await expect(d.getByRole('button', { name: 'Change' })).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Go to Restock' })).toBeVisible();
  });

  test('INV-14 an open request shows on the row; details offer View request, which opens Waiting on others', async ({ page }) => {
    await transfer('thangalla', 'veyangoda', [['PIP-GI-100', 1]]);
    await page.goto('/inventory');
    await page.getByPlaceholder(SEARCH).fill('PIP-GI-100');
    await expect(row(page, 'PIP-GI-100')).toContainText('Requested');
    await row(page, 'PIP-GI-100').click();
    await dialog(page).getByRole('button', { name: 'View request' }).click();
    await expect(page).toHaveURL(/\/stock-requests\?.*tab=waiting/);
  });
});

test.describe('minimums (branch manager)', () => {
  test.use({ user: MGR });
  test('INV-17 the manager changes an item minimum from the details popup', async ({ page }) => {
    const id = await itemId('PIP-GI-100');
    const [before] = await sql<{ reorder_level: string }>(`SELECT reorder_level FROM branch_stock WHERE branch_id = $1 AND item_id = $2`, [BRANCH.thangalla, id]);
    try {
      await page.goto('/inventory');
      await page.getByPlaceholder(SEARCH).fill('PIP-GI-100');
      await row(page, 'PIP-GI-100').click();
      const d = dialog(page);
      await d.getByRole('button', { name: 'Change' }).click();
      await d.getByLabel('New minimum').fill('7');
      await d.getByRole('button', { name: 'Save' }).click();
      await expect(d.getByRole('button', { name: 'Change' })).toBeVisible();
      await expect(d).toContainText('7');
      await expect(row(page, 'PIP-GI-100').locator('td').nth(4)).toContainText('7');
    } finally {
      await sql(`UPDATE branch_stock SET reorder_level = $3 WHERE branch_id = $1 AND item_id = $2`, [BRANCH.thangalla, id, before.reorder_level]);
    }
  });
});

test.describe('inventory at a workshop-only branch', () => {
  test.use({ user: SUP.veyangoda });
  test('INV-15 no coils are listed at Veyangoda', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByPlaceholder(SEARCH).fill('coil');
    await expect(page.getByText('No items found')).toBeVisible();
  });
});

test.describe('restock (supervisor)', () => {
  test('ALR-10 the cards: To restock + Requested + On the way = Stock Levels low + out', async ({ page }) => {
    const inv = (await call(SUP.thangalla, 'GET', '/inventory')).data.counts;
    const al = (await call(SUP.thangalla, 'GET', '/stock-alerts')).data;
    expect(al.counts.needs_restock + al.counts.requested).toBe(inv.low + inv.out);
    await page.goto('/stock-alerts');
    await expect(page.getByRole('heading', { name: 'Restock', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await cardCount(page, 'To restock')).toBe(al.counts.needs_restock);
    expect((await cardCount(page, 'Requested')) + (await cardCount(page, 'On the way'))).toBe(al.counts.requested);
    if (al.counts.needs_restock > 0) await expect(itemRows(page)).toHaveCount(al.counts.needs_restock);
  });

  test('ALR-11 tick rows, then send the request from Restock: it moves to Requested', async ({ page }) => {
    await page.goto('/stock-alerts');
    const boxes = page.locator('tbody input[type="checkbox"]');
    test.skip((await boxes.count()) === 0, 'nothing to restock at Thangalla');
    const name = (await itemRows(page).first().locator('td').nth(1).locator('div').first().innerText()).trim();
    await boxes.first().check();
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
    await page.getByLabel('Needed by date').fill(colomboToday(3));
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/Request GI-.* sent to/)).toBeVisible();
    await expect(itemRows(page).filter({ hasText: name })).toHaveCount(0);
    await statusCard(page, 'Requested').click();
    await expect(itemRows(page).filter({ hasText: name })).toHaveCount(1);
  });

  test('ALR-12 More options opens the New Request popup with the ticked items; Clear empties the selection', async ({ page }) => {
    await page.goto('/stock-alerts');
    const boxes = page.locator('tbody input[type="checkbox"]');
    test.skip((await boxes.count()) < 2, 'fewer than two items to restock at Thangalla');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByText(/2 items/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send request' })).toHaveCount(0);
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page).toHaveURL(/\/stock-requests\?.*items=[^&]*(%2C|,)/);
    await expect(dialog(page)).toContainText('New stock request');
    await expect(dialog(page).getByLabel(/^Amount of /)).toHaveCount(2);
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
    await expect(dialog(page).getByRole('button', { name: /Go to Restock|View request|Change/ })).toHaveCount(0);
  });

  test('INV-21 one branch picked: that branch only, no New item and no minimum change', async ({ page }) => {
    await page.goto('/inventory');
    await pickBranch(page, 'Thangalla');
    await expect(page.getByText('View only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New item' })).toHaveCount(0);
    await itemRows(page).first().click();
    await expect(dialog(page).getByRole('button', { name: 'Change' })).toHaveCount(0);
  });

  test('ALR-20 network Restock, and one branch without request controls', async ({ page }) => {
    await page.goto('/stock-alerts');
    await expect(page.getByRole('heading', { name: 'Restock', exact: true })).toBeVisible();
    await expect(statusCard(page, 'To restock')).toBeVisible();
    await pickBranch(page, 'Thangalla');
    await expect(page.getByRole('button', { name: 'Send request' })).toHaveCount(0);
    await expect(page.locator('tbody input[type="checkbox"]')).toHaveCount(0);
  });
});
