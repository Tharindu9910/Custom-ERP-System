import type { Page } from '@playwright/test';
import { CASHIER, ROLLING_LINE, SUP, call, finishedJobCard, jobCard } from '../support/api';
import { expect, test } from '../support/fixtures';
import { navLink, row } from '../support/ui';

/** HO: the cashier collects the money; the supervisor checks the items and hands them over (Docs/decisions/0005). */

const card = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^${title}`) }).first();

test.describe('cashier', () => {
  test.use({ user: CASHIER.thangalla });

  test('HO-01 a finished card with a balance is under Finished – Balance Due with Collect Balance only; paid in full it leaves the board', async ({ page }) => {
    const done = await finishedJobCard({ name: `Finished Due ${Date.now() % 1_000_000}` });
    await page.goto('/cashier-queue');
    await card(page, 'Finished – Balance Due').click();
    const r = row(page, done.order_number);
    await expect(r.getByRole('button', { name: 'Collect Balance' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Close/ })).toHaveCount(0);

    await r.getByRole('button', { name: 'Collect Balance' }).click();
    await page.getByRole('button', { name: 'Check all' }).click();
    await page.getByRole('button', { name: 'Next: Take Payment' }).click();
    await expect(page.getByText('Close job card after payment')).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm Payment' }).click();
    await expect(page.getByText('Paid in full — sent to the supervisor for hand-over.')).toBeVisible();
    await expect(row(page, done.order_number)).toHaveCount(0);
  });
});

test.describe('cashier, nothing due', () => {
  test.use({ user: CASHIER.thangalla });

  test('HO-04 a Rs 0 advance card still waits at the cashier, who sends it to the workshop without payment', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE], name: `No Advance ${Date.now() % 1_000_000}` });
    expect(card.status).toBe('DRAFT');
    await page.goto('/cashier-queue');
    const r = row(page, card.order_number);
    await expect(r).toContainText('No advance');
    await r.getByRole('button', { name: 'Take Advance' }).click();
    await page.getByRole('button', { name: 'Check all' }).click();
    await page.getByRole('button', { name: 'Next: Take Payment' }).click();
    await page.getByRole('button', { name: 'Send to Workshop (no payment)' }).click();
    await expect(page.getByText(`${card.order_number} sent to the Workshop Queue without payment.`)).toBeVisible();
    expect((await call(SUP.thangalla, 'GET', `/orders/${card.order_id}`)).data.status).toBe('IN_QUEUE');
  });
});

test.describe('supervisor', () => {
  test.use({ user: SUP.thangalla });

  test('HO-02 Ready for Collection: tick every item, name who received them, and the card closes', async ({ page }) => {
    const unpaid = await finishedJobCard({ name: `Still Owing ${Date.now() % 1_000_000}` });
    const ready = await finishedJobCard({ paidInFull: true, name: `Ready Collect ${Date.now() % 1_000_000}` });
    await page.goto('/workshop-queue');

    // Finished but owing: read-only, waiting for the cashier
    await card(page, 'Finished').click();
    await expect(row(page, unpaid.order_number)).toContainText('Waiting for cashier');
    await expect(row(page, unpaid.order_number).getByRole('button', { name: 'Check & Hand Over' })).toHaveCount(0);

    await card(page, 'Ready for Collection').click();
    await row(page, ready.order_number).getByRole('button', { name: 'Check & Hand Over' }).click();
    await expect(page).toHaveURL(new RegExp(`handover=${ready.order_id}`));
    await expect(navLink(page, 'Workshop Queue')).toHaveAttribute('aria-current', 'page');
    const next = page.getByRole('button', { name: 'Next: Hand Over' });
    await expect(next).toBeDisabled();
    for (const box of await page.locator('ul input[type="checkbox"]').all()) await box.check();
    await next.click();

    const received = page.getByPlaceholder('Name of the person collecting');
    await received.fill('');
    await expect(page.getByRole('button', { name: 'Hand Over & Close' })).toBeDisabled();
    await received.fill('Collector Person');
    await page.getByRole('button', { name: 'Hand Over & Close' }).click();
    await expect(page.getByText(`${ready.order_number} handed over to Collector Person and closed.`)).toBeVisible();
    await expect(row(page, ready.order_number)).toHaveCount(0);
    const detail = (await call(SUP.thangalla, 'GET', `/orders/${ready.order_id}`)).data;
    expect([detail.status, detail.released_to]).toEqual(['CLOSED', 'Collector Person']);
  });
});

test.describe('chief', () => {
  test.use({ user: 'chief_thangalla' });

  test('HO-03 the chief sees Ready for Collection but cannot hand over', async ({ page }) => {
    const ready = await finishedJobCard({ paidInFull: true, name: `Chief View ${Date.now() % 1_000_000}` });
    await page.goto('/workshop-queue');
    await card(page, 'Ready for Collection').click();
    await expect(row(page, ready.order_number)).toContainText('Waiting for supervisor to hand over');
    await expect(row(page, ready.order_number).getByRole('button', { name: 'Check & Hand Over' })).toHaveCount(0);
  });
});
