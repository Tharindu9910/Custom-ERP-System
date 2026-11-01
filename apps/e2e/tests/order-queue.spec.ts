import type { Page } from '@playwright/test';
import { OVERRIDE_PASSWORD, SA, SUP, call, coil, newPhone, payAdvance, payBalance, readyRoofingOrder, reserved, roofingOrder, sheetLine, sql, stock, withGrant } from '../support/api';
import { expect, test } from '../support/fixtures';
import { choose, dialog, field, navLink, row } from '../support/ui';

/** OQ: Order Queue board for supervisors (Docs/testing/role-capabilities.md, Docs/decisions/0005). */

const STATUS_CARDS = ['In Queue', 'Ongoing', 'Finished', 'Ready for Release'] as const;
type Card = (typeof STATUS_CARDS)[number];
/** A status card on the board ("In Queue 3"). */
const card = (page: Page, label: Card) => page.getByRole('button', { name: new RegExp(`^${label}\\b`) }).first();

async function find(page: Page, orderNumber: string, cardLabel: Card) {
  await page.goto('/order-queue');
  await card(page, cardLabel).click();
  await page.getByPlaceholder('Search order number, customer name or phone...').fill(orderNumber);
  await expect(row(page, orderNumber)).toBeVisible();
  return row(page, orderNumber);
}

/** Check & Release in the page (?release=): tick every item, name who received them. */
async function checkAndRelease(page: Page, r: ReturnType<typeof row>, receivedBy?: string, note?: string) {
  await r.getByRole('button', { name: 'Check & Release' }).click();
  await expect(page).toHaveURL(/release=/);
  const next = page.getByRole('button', { name: 'Next: Release' });
  await expect(next).toBeDisabled();
  for (const box of await page.locator('ul input[type="checkbox"]').all()) await box.check();
  await next.click();
  const received = page.getByPlaceholder('Name of the person collecting');
  if (receivedBy !== undefined) await received.fill(receivedBy);
  if (note) await page.locator('textarea').fill(note);
  await page.getByRole('button', { name: 'Release to Customer' }).click();
}

/** Press a row's move button and confirm it. */
async function move(page: Page, r: ReturnType<typeof row>, label: 'Start Job' | 'Mark Finished') {
  await r.getByRole('button', { name: label }).click();
  await dialog(page).filter({ hasText: label }).getByRole('button', { name: label }).click();
}

test.describe('supervisor', () => {
  test('OQ-20 each status card count equals the rows it lists; there are no tabs or date filter', async ({ page }) => {
    await page.goto('/order-queue');
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    for (const label of STATUS_CARDS) {
      const c = card(page, label);
      await c.click();
      await page.waitForLoadState('networkidle');
      const n = Number((await c.innerText()).replace(/unpaid/i, '').match(/(\d+)\s*$/)?.[1] ?? 0);
      await expect(page.locator('tbody tr').filter({ has: page.locator('td:nth-child(5)') })).toHaveCount(n);
    }
  });

  test('OQ-21 search covers the picked status only by card; History lists released orders', async ({ page }) => {
    const o = await roofingOrder();
    await find(page, o.order_number, 'In Queue');
    await card(page, 'Ongoing').click();
    await expect(row(page, o.order_number)).toHaveCount(0);
    const released = await readyRoofingOrder({ payFull: true });
    await call(SUP.thangalla, 'POST', `/roofing-orders/${released.order_id}/release`, { version: released.version, released_to: 'History Check' });
    await page.getByRole('button', { name: 'History' }).click();
    const h = dialog(page).filter({ hasText: 'Order History' });
    await expect(h.locator('tbody tr').filter({ hasText: released.order_number })).toBeVisible();
  });

  test('OQ-22 Start → Complete → (cashier collects) → Release, with the detail timeline filled in', async ({ page }) => {
    const c = await coil();
    const o = await roofingOrder({ lines: [sheetLine(c.item_id, { length_ft: 10, pieces: 2 })], name: 'Queue Flow' });
    const before = await stock('thangalla', c.sku);
    let r = await find(page, o.order_number, 'In Queue');
    // Supervisor never sees cashier actions
    await expect(r.getByRole('button', { name: /Collect|Cancel order|Edit order/ })).toHaveCount(0);
    await expect(r.locator('[title="Edit order"], [title="Cancel order"]')).toHaveCount(0);
    await move(page, r, 'Start Job');
    await expect(page.getByText(`Order ${o.order_number} started.`)).toBeVisible();
    expect(await stock('thangalla', c.sku)).toBe(before - 20);

    r = await find(page, o.order_number, 'Ongoing');
    await move(page, r, 'Mark Finished');
    await expect(page.getByText(`Order ${o.order_number} is finished.`)).toBeVisible();

    // Balance still due: under Finished, read-only, the cashier collects it on the Cashier Queue
    r = await find(page, o.order_number, 'Finished');
    await expect(r.getByRole('button')).toHaveCount(0);
    await expect(r.getByText(/Waiting for cashier · Rs .* due/)).toBeVisible();

    const detail = (await call(SUP.thangalla, 'GET', `/orders/${o.order_id}`)).data;
    await payBalance(detail);
    r = await find(page, o.order_number, 'Ready for Release');
    await r.getByRole('button', { name: 'Check & Release' }).click();
    await expect(navLink(page, 'Order Queue')).toHaveAttribute('aria-current', 'page');
    for (const box of await page.locator('ul input[type="checkbox"]').all()) await box.check();
    await page.getByRole('button', { name: 'Next: Release' }).click();
    const handedTo = page.getByPlaceholder('Name of the person collecting');
    await expect(handedTo).toHaveValue('Queue Flow');
    await handedTo.fill('');
    await expect(page.getByRole('button', { name: 'Release to Customer' })).toBeDisabled();
    await handedTo.fill('Queue Flow Driver');
    await page.locator('textarea').fill('CAB-1234');
    await page.getByRole('button', { name: 'Release to Customer' }).click();
    await expect(page.getByText(`Order ${o.order_number} released to Queue Flow Driver.`)).toBeVisible();

    // Released orders leave the board and open from History
    await expect(row(page, o.order_number)).toHaveCount(0);
    await page.getByRole('button', { name: 'History' }).click();
    await dialog(page).filter({ hasText: 'Order History' }).locator('tbody tr').filter({ hasText: o.order_number }).click();
    const d = dialog(page).filter({ hasText: 'Queue Flow Driver' });
    for (const step of ['Placed', 'Started', 'Finished', 'Released']) await expect(d.getByText(step, { exact: true }).first()).toBeVisible();
    await expect(d).toContainText('Queue Flow Driver');
  });

  test('OQ-23 detail modal shows items and payments; actions are offered there too', async ({ page }) => {
    const o = await roofingOrder();
    const r = await find(page, o.order_number, 'In Queue');
    await r.locator('td').first().click();
    const d = dialog(page);
    await expect(d.locator('h4', { hasText: /^Items$/ }).locator('..')).toContainText('1');
    await expect(d.locator('h4', { hasText: /^Payments$/ }).locator('..')).toContainText('1');
    await expect(d.getByRole('button', { name: 'Start Job' })).toBeVisible();
  });

  test('OQ-24 short coil on Submit Order: override dialog; wrong password refused; right password saves; Start then asks nothing', async ({ page }) => {
    // override:stock is MANAGER-only by default; the Super Admin lets supervisors use it here
    await withGrant('SUPERVISOR', 'override:stock', async () => {
      const coils = (await call(SUP.thangalla, 'GET', '/items/coils')).data;
      const low = coils.find((c: any) => c.stock_ft > 0 && c.stock_ft < 1000);
      const name = `Short Coil ${Date.now() % 1_000_000}`;
      await page.goto('/orders/new');
      await field(page, 'Customer Phone').fill(newPhone());
      await field(page, 'Customer Name').fill(name);
      await choose(page, 'Select worker');
      await page.getByRole('button', { name: 'Roofing', exact: true }).click();
      await choose(page, /Search coil no\./, low.sku);
      if (await page.getByRole('button', { name: 'Search pattern…' }).count()) await choose(page, 'Search pattern…');
      await field(page, 'Length (ft)').fill(String(low.stock_ft + 50));
      await field(page, 'No. of Pieces').fill('1');
      await page.getByRole('button', { name: /^Add to Order|^Add \d+ Items to Order/ }).click();
      await page.getByRole('button', { name: 'Submit Order' }).click();

      const ov = page.getByRole('dialog').filter({ hasText: 'Not enough stock' });
      await ov.locator('input[type="password"]').fill('wrong');
      await ov.getByPlaceholder('e.g. Sheets received today, not yet entered').fill('Urgent roof');
      await ov.getByRole('button', { name: 'Override and save' }).click();
      await expect(ov.getByText('The stock override password is incorrect')).toBeVisible();
      await ov.locator('input[type="password"]').fill(OVERRIDE_PASSWORD);
      await ov.getByRole('button', { name: 'Override and save' }).click();
      await expect(page.getByText(/Order WO-FORM-\d+ created and sent to the Cashier Queue/)).toBeVisible();

      // The cashier takes the minimum; the order then enters the Order Queue
      const [o] = await sql(`SELECT o.order_id, o.order_number FROM "order" o JOIN customer c ON c.customer_id = o.customer_id WHERE c.name = $1`, [name]);
      await payAdvance(o);
      const r = await find(page, o.order_number, 'In Queue');
      await move(page, r, 'Start Job');
      await expect(page.getByText(`Order ${o.order_number} started.`)).toBeVisible();
      // All free coil is used; other open orders' holds stay for them
      expect(await stock('thangalla', low.sku)).toBe(await reserved('thangalla', low.sku));
    });
  });

  test('OQ-25 a fully paid ready order releases straight away', async ({ page }) => {
    const o = await readyRoofingOrder({ payFull: true });
    const r = await find(page, o.order_number, 'Ready for Release');
    await checkAndRelease(page, r);
    await expect(page.getByText(new RegExp(`Order ${o.order_number} released to `))).toBeVisible();
  });
});

test.describe('chief (BR21)', () => {
  test.use({ user: 'chief_thangalla' });
  test('OQ-26 the chief sees the coordination message on a supervisor\'s order; and has no Release', async ({ page }) => {
    const o = await roofingOrder({ bySupervisor: true });
    const r = await find(page, o.order_number, 'In Queue');
    await move(page, r, 'Start Job');
    await expect(page.getByText('A Supervisor is active. Coordinate with them to modify this record.')).toBeVisible();
    const ready = await readyRoofingOrder({ payFull: true });
    const rr = await find(page, ready.order_number, 'Ready for Release');
    await expect(rr.getByRole('button', { name: 'Check & Release' })).toHaveCount(0);
    await expect(rr).toContainText('Waiting for supervisor to release');
  });
});

test.describe('super admin', () => {
  test.use({ user: SA, branch: 'thangalla' });
  test('OQ-27 view only: rows have no buttons; the detail has no actions', async ({ page }) => {
    const o = await roofingOrder();
    const r = await find(page, o.order_number, 'In Queue');
    await expect(r.getByRole('button')).toHaveCount(0);
    await r.locator('td').first().click();
    await expect(dialog(page).locator('h4', { hasText: /^Items$/ }).locator('..')).toContainText('1');
    await expect(dialog(page).getByRole('button', { name: /Start|Finished|Release|Collect|Edit|Cancel/ })).toHaveCount(0);
  });
});
