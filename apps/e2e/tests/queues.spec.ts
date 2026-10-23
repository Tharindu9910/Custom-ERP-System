import type { Page } from '@playwright/test';
import { CASHIER, CUSTOM_LINE, ROLLING_LINE, jobCard } from '../support/api';
import { expect, test } from '../support/fixtures';
import { row } from '../support/ui';

/** QS: search and date + time on the queues. Searches are cheap: one request per search, none on the Cashier Queue. */

const TIME = /\d{1,2}:\d{2}/;
const count = (page: Page, path: string) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === path) calls.push(r.url());
  });
  return calls;
};

test.describe('cashier', () => {
  test.use({ user: CASHIER.thangalla });

  test('QS-10 Cashier Queue search filters by number, name and phone without asking the server; rows show date and time', async ({ page }) => {
    const card = await jobCard({ lines: [CUSTOM_LINE], name: `Cashier Search ${Date.now() % 1_000_000}` });
    const calls = count(page, '/cashier-queue');
    await page.goto('/cashier-queue');
    await expect(row(page, card.order_number)).toBeVisible();
    await expect(row(page, card.order_number)).toContainText(TIME);
    const loaded = calls.length;

    const search = page.getByPlaceholder('Search order number, customer name or phone...');
    await search.fill(card.order_number);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await search.fill(card.customer.name.toLowerCase());
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await search.fill(card.customer.phone.slice(-6));
    await expect(row(page, card.order_number)).toBeVisible();
    await search.fill('no-such-order-xyz');
    await expect(page.getByText('No orders match')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(row(page, card.order_number)).toBeVisible();
    expect(calls.length).toBe(loaded);
  });
});

test.describe('supervisor', () => {
  test('QS-20 Workshop Queue search sends one request for a typed number; the date column shows when the card was created', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE] });
    const calls = count(page, '/workshop-queue');
    await page.goto('/workshop-queue');
    await page.waitForLoadState('networkidle');
    const loaded = calls.length;
    await page.getByPlaceholder('Search work order, customer name, or phone...').pressSequentially(card.order_number, { delay: 30 });
    await expect(page.locator('tbody tr.cursor-pointer')).toHaveCount(1);
    expect(calls.length).toBe(loaded + 1);
    await expect(row(page, card.order_number)).toContainText(/Created .*\d{1,2}:\d{2}/);
  });

  test('QS-21 Gate Pass queue and Stock Requests show date and time', async ({ page }) => {
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: /Gate Pass Queue/ }).first().click();
    await expect(page.locator('tbody tr').first()).toContainText(TIME);
    await page.goto('/stock-requests?tab=ours');
    await expect(page.getByText(/Requested .*\d{1,2}:\d{2}/).first()).toBeVisible();
  });
});
