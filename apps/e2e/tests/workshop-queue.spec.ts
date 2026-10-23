import type { Page } from '@playwright/test';
import { CUSTOM_LINE, OVERRIDE_PASSWORD, ROLLING_LINE, SA, SUP, call, jobCard, material, newPhone, payAdvance, reserved, sql, stock } from '../support/api';
import { expect, test } from '../support/fixtures';
import { dialog, field, row } from '../support/ui';

/** WQ: Workshop Queue and the job card modal (Docs/testing/role-capabilities.md). */

const jobRows = (page: Page) => page.locator('tbody tr.cursor-pointer');
const tab = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label}`) }).last();

async function openCard(page: Page, orderNumber: string, tabLabel = 'All Jobs') {
  await page.goto('/workshop-queue');
  await tab(page, tabLabel).click();
  await page.getByPlaceholder('Search work order, customer name, or phone...').fill(orderNumber);
  await row(page, orderNumber).click();
  await expect(dialog(page)).toContainText(`Main Job Card: ${orderNumber}`);
}

/** Create Job Card with one branch Cut/Bend sub-job needing `qty` sheets; returns the customer name. */
async function fillShortCard(page: Page, m: { material_type: string; thickness: string }, qty: number) {
  const name = `Short Stock ${Date.now() % 1_000_000}`;
  await page.goto('/job-cards/new');
  await field(page, 'Phone Number').fill(newPhone());
  await field(page, 'Customer Name').fill(name);
  await page.getByPlaceholder('Select worker(s)').click();
  await page.locator('ul li button').first().click();
  await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
  await field(page, 'Material Type').selectOption(m.material_type);
  await field(page, 'Thickness').selectOption(m.thickness);
  await field(page, 'Material Qty').fill(String(qty));
  await field(page, 'Total Cut Count').fill('1');
  await page.getByRole('button', { name: 'Add Sub-Job' }).click();
  return name;
}

test.describe('supervisor', () => {
  test('WQ-20 each tab count equals the rows it lists', async ({ page }) => {
    await page.goto('/workshop-queue');
    for (const label of ['All Jobs', 'In Queue', 'In Progress', 'Completed', 'Awaiting Payment']) {
      const t = tab(page, label);
      await t.click();
      await page.waitForLoadState('networkidle');
      const count = Number((await t.innerText()).replace(/\D+/g, '') || 0);
      await expect(jobRows(page)).toHaveCount(count);
    }
  });

  test('WQ-21 search finds a card by number; the date filter has a Clear', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE] });
    await page.goto('/workshop-queue');
    await page.getByPlaceholder('Search work order, customer name, or phone...').fill(card.order_number);
    await expect(jobRows(page)).toHaveCount(1);
    await page.locator('input[type="date"]').fill('2000-01-01');
    await expect(jobRows(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear', exact: true }).last().click();
    await expect(jobRows(page)).toHaveCount(1);
  });

  test('WQ-22 an unpaid card waits for the advance: no Start button (G9)', async ({ page }) => {
    const card = await jobCard();
    await openCard(page, card.order_number, 'Awaiting Payment');
    await expect(dialog(page).getByText('Waiting for the minimum advance at the cashier.')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Start' })).toHaveCount(0);
  });

  test('WQ-23 paid card: Start deducts the sheets, Complete records the supervisor; status follows', async ({ page }) => {
    const m = await material('thangalla', 3);
    const card = await jobCard({ lines: [{ job_type: 'CUT_BEND', material_type: m.material_type, thickness: m.thickness, material_quantity: 2, cut_count: 1 }], paid: true });
    const before = await stock('thangalla', m.sku);
    await openCard(page, card.order_number, 'In Queue');
    await dialog(page).getByRole('button', { name: 'Start' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Complete' })).toBeVisible();
    expect(await stock('thangalla', m.sku)).toBe(before - 2);
    await expect(dialog(page)).toContainText('In Progress');
    await dialog(page).getByRole('button', { name: 'Complete' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Complete' })).toHaveCount(0);
    await expect(dialog(page)).toContainText('Supervisor (Thangalla)');
    await expect(dialog(page)).toContainText('Completed');
  });

  test('WQ-24 not enough stock on Submit Job Card: wrong override password is refused, the right one saves; Start then asks nothing', async ({ page }) => {
    const m = await material('thangalla', 1);
    const held = await reserved('thangalla', m.sku);
    const name = await fillShortCard(page, m, m.quantity + 4);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    const ov = page.getByRole('dialog').filter({ hasText: 'Not enough stock' });
    await expect(ov).toBeVisible();
    await expect(ov.locator('tbody tr')).toContainText(String(m.quantity + 4));
    const go = ov.getByRole('button', { name: 'Override and save' });
    await expect(go).toBeDisabled();
    await ov.locator('input[type="password"]').fill('wrong-one');
    await ov.getByPlaceholder('e.g. Sheets received today, not yet entered').fill('Customer waiting');
    await go.click();
    await expect(ov.getByText('The stock override password is incorrect')).toBeVisible();
    await ov.locator('input[type="password"]').fill(OVERRIDE_PASSWORD);
    await go.click();
    await expect(ov).toHaveCount(0);
    await expect(page.getByText(/Job card JC-\d+ created/)).toBeVisible();
    // Only what was free is held; the shortfall is authorised, not held
    expect(await reserved('thangalla', m.sku)).toBe(held + m.quantity);

    const [card] = await sql(`SELECT o.order_id, o.order_number FROM "order" o JOIN customer c ON c.customer_id = o.customer_id WHERE c.name = $1`, [name]);
    await payAdvance(card);
    await openCard(page, card.order_number, 'In Queue');
    await dialog(page).getByRole('button', { name: 'Start' }).first().click();
    await expect(dialog(page).getByRole('button', { name: 'Complete' })).toBeVisible();
    await expect(page.getByRole('dialog').filter({ hasText: 'Not enough stock' })).toHaveCount(0);
    // All free sheets are used; other open orders' holds stay on the shelf
    expect(await stock('thangalla', m.sku)).toBe(held);
  });

  test('WQ-25 void an unpaid card: reason of 3+ characters, then it leaves the queue', async ({ page }) => {
    const card = await jobCard();
    await openCard(page, card.order_number, 'Awaiting Payment');
    await dialog(page).getByRole('button', { name: 'Void job card' }).click();
    const confirm = dialog(page).getByRole('button', { name: 'Confirm void' });
    await dialog(page).getByPlaceholder('Reason for voiding').fill('no');
    await expect(confirm).toBeDisabled();
    await dialog(page).getByPlaceholder('Reason for voiding').fill('Customer cancelled');
    await confirm.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row(page, card.order_number)).toHaveCount(0);
    expect((await call(SUP.thangalla, 'GET', `/orders/${card.order_id}`)).data.status).toBe('VOIDED');
  });

  test('WQ-26 "Keep" backs out of voiding; a paid card offers no void', async ({ page }) => {
    const card = await jobCard();
    await openCard(page, card.order_number, 'Awaiting Payment');
    await dialog(page).getByRole('button', { name: 'Void job card' }).click();
    await dialog(page).getByRole('button', { name: 'Keep' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Void job card' })).toBeVisible();
    const paid = await jobCard({ paid: true });
    await openCard(page, paid.order_number, 'In Queue');
    await expect(dialog(page).getByRole('button', { name: 'Void job card' })).toHaveCount(0);
  });

  test('WQ-27 the queue refreshes by itself when another user changes a card (live updates)', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE] });
    await page.goto('/workshop-queue');
    await page.getByPlaceholder('Search work order, customer name, or phone...').fill(card.order_number);
    await expect(row(page, card.order_number)).toContainText(/In Queue|Pending/);
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    const l = card.lines[0];
    await call(SUP.thangalla, 'POST', `/order-lines/${l.line_id}/start`, { version: l.version });
    // No reload: the SSE nudge refetches the list
    await expect(row(page, card.order_number)).toContainText('In Progress', { timeout: 20_000 });
  });
});

test.describe('veyangoda (no stock override)', () => {
  test.use({ user: SUP.veyangoda });
  test('WQ-28 short stock on Submit explains that override is off; there is no override button', async ({ page }) => {
    const m = await material('veyangoda', 1);
    await fillShortCard(page, m, m.quantity + 4);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    const ov = page.getByRole('dialog').filter({ hasText: 'Not enough stock' });
    await expect(ov.getByText('Stock override is turned off for this branch.')).toBeVisible();
    await expect(ov.getByRole('button', { name: 'Override and save' })).toHaveCount(0);
  });

});

test.describe('chief while the supervisor is active (BR21)', () => {
  test.use({ user: 'chief_thangalla' });
  test('WQ-29 the chief sees the coordination message instead of starting the supervisor\'s card', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE] }); // created by the supervisor, who is signed in
    await openCard(page, card.order_number, 'In Queue');
    await dialog(page).getByRole('button', { name: 'Start' }).click();
    await expect(dialog(page).getByText('A Supervisor is active. Coordinate with them to modify this record.')).toBeVisible();
  });
});

test.describe('super admin', () => {
  test.use({ user: SA, branch: 'thangalla' });
  test('WQ-30 view only: no Edit in the list, no Start, Complete, Void or Edit in the card', async ({ page }) => {
    const draft = await jobCard();
    const paid = await jobCard({ lines: [ROLLING_LINE, CUSTOM_LINE], paid: true });
    await page.goto('/workshop-queue');
    await tab(page, 'Awaiting Payment').click();
    await expect(row(page, draft.order_number)).toBeVisible();
    await expect(row(page, draft.order_number).getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await row(page, draft.order_number).click();
    await expect(dialog(page).getByRole('button', { name: /Void job card|Edit|Start/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await tab(page, 'In Queue').click();
    await row(page, paid.order_number).click();
    await expect(dialog(page).getByRole('button', { name: /Start|Complete/ })).toHaveCount(0);
  });
});
