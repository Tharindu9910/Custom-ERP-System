import type { Page } from '@playwright/test';
import { SA, SUP, call, clearOpenRequests, colomboToday, sendAll, stock, transfer } from '../support/api';
import { expect, test } from '../support/fixtures';
import { dialog, pickBranch } from '../support/ui';

/** TRF: Stock Requests between branches (Docs/testing/role-capabilities.md). */

/** The request card for a GI number (the innermost block holding the number and its View button). */
const card = (page: Page, number: string) =>
  page.locator('div').filter({ has: page.getByText(number, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'View' }) }).last();
const tab = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).last();

async function openTab(page: Page, label: 'Requests to Us' | 'Our Requests', all = false) {
  await page.goto('/stock-requests');
  await tab(page, label).click();
  if (all) await page.getByRole('button', { name: 'All', exact: true }).click();
}

test.describe('new request (Thangalla supervisor)', () => {
  test('TRF-20 the supplier list has the other branches by name only, main branch first', async ({ page }) => {
    await page.goto('/stock-requests?tab=create');
    const options = await page.locator('select').first().locator('option').allInnerTexts();
    expect(options.map((o) => o.trim())).toEqual(expect.arrayContaining([expect.stringContaining('Naiwala'), 'Veyangoda']));
    expect(options.join('|')).not.toContain('Thangalla');
    expect(options[0]).toContain('Naiwala');
  });

  test('TRF-21 item search shows our own stock; Send stays disabled until an item is added', async ({ page }) => {
    await clearOpenRequests('thangalla', ['CON-CD-100']);
    await page.goto('/stock-requests?tab=create');
    await expect(page.getByRole('button', { name: 'Send Request' })).toBeDisabled();
    await expect(page.getByText(/To send, add an item/)).toBeVisible();
    await page.getByPlaceholder('Add item — type name or SKU').fill('CON-CD-100');
    await expect(page.locator('ul li').filter({ hasText: 'CON-CD-100' })).toContainText(`Ours: ${await stock('thangalla', 'CON-CD-100')}`);
    await page.locator('ul li button').filter({ hasText: 'CON-CD-100' }).click();
    await expect(page.getByText('To send, pick a date.')).toBeVisible();
    await page.getByLabel('Needed by date').fill(colomboToday(2));
    await expect(page.getByRole('button', { name: 'Send Request' })).toBeEnabled();
  });

  test('TRF-22 quantity steppers, remove, and an item already requested cannot be added', async ({ page }) => {
    await transfer('thangalla', 'veyangoda', [['PIP-GI-100', 1]]);
    await clearOpenRequests('thangalla', ['CON-WR-032']);
    await page.goto('/stock-requests?tab=create');
    await page.getByPlaceholder('Add item — type name or SKU').fill('PIP-GI-100');
    await expect(page.locator('ul li button').filter({ hasText: 'PIP-GI-100' })).toBeDisabled();
    await expect(page.locator('ul li').filter({ hasText: 'PIP-GI-100' })).toContainText('Requested');
    await page.getByPlaceholder('Add item — type name or SKU').fill('CON-WR-032');
    await page.locator('ul li button').filter({ hasText: 'CON-WR-032' }).click();
    await page.getByRole('button', { name: /^More / }).click();
    await page.getByRole('button', { name: /^More / }).click();
    await expect(page.getByRole('textbox', { name: /^Amount of / }).or(page.getByLabel(/^Amount of /))).toHaveValue('3');
    await page.getByRole('button', { name: /^Less / }).click();
    await expect(page.getByLabel(/^Amount of /)).toHaveValue('2');
    await page.getByRole('button', { name: /^Remove / }).click();
    await expect(page.getByText('No items yet')).toBeVisible();
  });

  test('TRF-23 the needed-by date cannot be in the past', async ({ page }) => {
    await page.goto('/stock-requests?tab=create');
    await expect(page.getByLabel('Needed by date')).toHaveAttribute('min', colomboToday());
  });

  test('TRF-24 send an urgent request with a note: it appears in Our Requests as Waiting', async ({ page }) => {
    await clearOpenRequests('thangalla', ['CON-WR-032']);
    await page.goto('/stock-requests?tab=create');
    await page.locator('select').first().selectOption({ label: 'Veyangoda' });
    await page.getByLabel('Needed by date').fill(colomboToday());
    await page.getByPlaceholder('Add item — type name or SKU').fill('CON-WR-032');
    await page.locator('ul li button').filter({ hasText: 'CON-WR-032' }).click();
    await page.getByLabel(/^Amount of /).fill('4');
    await page.getByText('Urgent', { exact: true }).click();
    await page.getByPlaceholder('Note for the other branch (optional)').fill('Browser test');
    await expect(page.getByText(/1 item\s*\(4 total\) from Veyangoda/)).toBeVisible();
    await page.getByRole('button', { name: 'Send Request' }).click();
    const toast = page.getByText(/Request GI-\d{4}-\d+ sent to Veyangoda\./);
    await expect(toast).toBeVisible();
    const number = (await toast.innerText()).match(/GI-\d{4}-\d+/)![0];
    await expect(card(page, number)).toContainText(/Waiting/i);
    await expect(card(page, number).getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('TRF-25 prefilled items from Stock Alerts arrive in the form', async ({ page }) => {
    const id = (await call(SUP.thangalla, 'GET', '/stock-transfers/items?q=CON-PR-001')).data[0].item_id;
    await clearOpenRequests('thangalla', ['CON-PR-001']);
    await page.goto(`/stock-requests?tab=create&items=${id}:3`);
    await expect(page.getByLabel(/^Amount of /)).toHaveValue('3');
  });
});

test.describe('the supplier side (Veyangoda supervisor)', () => {
  test.use({ user: SUP.veyangoda });

  test('TRF-30 Check & Send: over our stock is blocked; a smaller amount sends and stock leaves', async ({ page }) => {
    const have = await stock('veyangoda', 'FST-BM-1250');
    const tr = await transfer('thangalla', 'veyangoda', [['FST-BM-1250', have + 5]]);
    await openTab(page, 'Requests to Us');
    await card(page, tr.transfer_number).getByRole('button', { name: 'Check & Send' }).click();
    const d = dialog(page);
    await expect(d).toContainText('Check & Send');
    const amount = d.getByLabel(/^Amount of /);
    await amount.fill(String(have + 1));
    await expect(d.getByRole('button', { name: /^Send / })).toBeDisabled();
    await amount.fill('5');
    await d.getByRole('button', { name: 'Send 5 units' }).click();
    await expect(d).toHaveCount(0);
    expect(await stock('veyangoda', 'FST-BM-1250')).toBe(have - 5);
  });

  test('TRF-31 nothing to send keeps Send disabled; Reject needs a reason', async ({ page }) => {
    const tr = await transfer('thangalla', 'veyangoda', [['PIP-GI-100', 2]]);
    await openTab(page, 'Requests to Us');
    await card(page, tr.transfer_number).getByRole('button', { name: 'Check & Send' }).click();
    const d = dialog(page);
    await d.getByLabel(/^Amount of /).fill('0');
    await expect(d.getByRole('button', { name: /^Send / })).toBeDisabled();
    await d.getByRole('button', { name: 'Reject' }).click();
    await expect(d.getByRole('button', { name: 'Reject request' })).toBeDisabled();
    await d.locator('textarea').fill('Need it here');
    await d.getByRole('button', { name: 'Reject request' }).click();
    await expect(d).toHaveCount(0);
    expect((await call(SUP.thangalla, 'GET', `/stock-transfers/${tr.transfer_id}`)).data.display_status).toBe('REJECTED');
  });

  test('TRF-32 the supplier cannot cancel or receive someone else\'s request (only Check & Send / View)', async ({ page }) => {
    const tr = await transfer('thangalla', 'veyangoda', [['CON-PR-001', 1]]);
    await openTab(page, 'Requests to Us');
    const c = card(page, tr.transfer_number);
    await expect(c.getByRole('button', { name: 'Check & Send' })).toBeVisible();
    await expect(c.getByRole('button', { name: /^Cancel$|^Receive$/ })).toHaveCount(0);
  });
});

test.describe('the requester receives (Thangalla supervisor)', () => {
  test('TRF-40 Receive: "We have" and "New total" follow the count; over the sent amount is blocked; short count records a note', async ({ page }) => {
    const tr = await transfer('thangalla', 'veyangoda', [['FST-NM-012', 10]]);
    await call(SUP.veyangoda, 'POST', `/stock-transfers/${tr.transfer_id}/send`, sendAll(tr, () => 10));
    const have = await stock('thangalla', 'FST-NM-012');
    await openTab(page, 'Our Requests');
    await card(page, tr.transfer_number).getByRole('button', { name: 'Receive' }).click();
    const d = dialog(page);
    await expect(d).toContainText('Receive stock');
    await expect(d.locator('tbody tr').first()).toContainText(String(have));
    await expect(d.locator('tbody tr').first()).toContainText(String(have + 10));
    await d.getByLabel(/^Amount of /).fill('11');
    await expect(d.getByRole('button', { name: 'Add to our stock' })).toBeDisabled();
    await d.getByLabel(/^Amount of /).fill('8');
    await expect(d.locator('tbody tr').first()).toContainText(String(have + 8));
    await expect(d.getByText(/1 item is short\./)).toBeVisible();
    await d.getByPlaceholder('e.g. 2 plates bent on arrival.').fill('2 nuts missing');
    await d.getByRole('button', { name: 'Add to our stock' }).click();
    await expect(d).toHaveCount(0);
    expect(await stock('thangalla', 'FST-NM-012')).toBe(have + 8);
  });

  test('TRF-41 Cancel asks first; "No" keeps it, "Yes, cancel" closes it', async ({ page }) => {
    const tr = await transfer('thangalla', 'naiwala', [['CON-CD-100', 1]]);
    await openTab(page, 'Our Requests');
    const c = card(page, tr.transfer_number);
    await c.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Cancel this request?')).toBeVisible();
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await expect(c.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await c.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Yes, cancel' }).click();
    await expect(card(page, tr.transfer_number)).toHaveCount(0); // Open list
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(card(page, tr.transfer_number)).toContainText(/Cancelled/i);
  });

  test('TRF-42 View shows the history; a rejected request shows its reason', async ({ page }) => {
    const tr = await transfer('thangalla', 'naiwala', [['SHT-MS-030', 1]]);
    await call(SUP.naiwala, 'POST', `/stock-transfers/${tr.transfer_id}/reject`, { reason: 'Keeping these for now' });
    await openTab(page, 'Our Requests', true);
    const c = card(page, tr.transfer_number);
    await expect(c).toContainText('Reason: Keeping these for now');
    await c.getByRole('button', { name: 'View' }).click();
    await expect(dialog(page)).toContainText('Request details');
    await expect(dialog(page)).toContainText('Rejected: Keeping these for now');
    await expect(dialog(page)).toContainText('Asked on');
  });

  test('TRF-43 the To Send / To Receive badges match the actions waiting', async ({ page }) => {
    await page.goto('/stock-requests');
    await page.waitForLoadState('networkidle');
    const counts = (await call(SUP.thangalla, 'GET', '/stock-transfers?direction=OUTGOING')).data.counts;
    await tab(page, 'Requests to Us').click();
    await expect(page.getByRole('button', { name: 'Check & Send' })).toHaveCount(counts.to_send);
    await tab(page, 'Our Requests').click();
    await expect(page.getByRole('button', { name: 'Receive', exact: true })).toHaveCount(counts.to_receive);
  });
});

test.describe('a third branch', () => {
  test.use({ user: SUP.naiwala });
  test('TRF-44 a request between two other branches is not listed', async ({ page }) => {
    const tr = await transfer('thangalla', 'veyangoda', [['SHT-GI-G20', 1]]);
    await openTab(page, 'Requests to Us', true);
    await expect(card(page, tr.transfer_number)).toHaveCount(0);
    await openTab(page, 'Our Requests', true);
    await expect(card(page, tr.transfer_number)).toHaveCount(0);
  });
});

test.describe('super admin', () => {
  test.use({ user: SA });
  test('TRF-50 network list is read-only (View only); no New Request tab', async ({ page }) => {
    const tr = await transfer('thangalla', 'veyangoda', [['BAR-AN-200', 1]]);
    await page.goto('/stock-requests');
    await expect(page.getByRole('button', { name: /^New Request/i })).toHaveCount(0);
    const c = card(page, tr.transfer_number);
    await expect(c).toBeVisible();
    await expect(c.getByRole('button', { name: /Check & Send|Receive|Cancel/ })).toHaveCount(0);
    await c.getByRole('button', { name: 'View' }).click();
    await expect(dialog(page)).toContainText('Request details');
  });

  test('TRF-51 a picked branch shows its lists with no actions', async ({ page }) => {
    const tr = await transfer('thangalla', 'veyangoda', [['BAR-FL-025', 1]]);
    await page.goto('/stock-requests');
    await pickBranch(page, 'Veyangoda');
    await tab(page, 'Requests to Us').click();
    await expect(card(page, tr.transfer_number)).toBeVisible();
    await expect(card(page, tr.transfer_number).getByRole('button', { name: 'Check & Send' })).toHaveCount(0);
  });
});
