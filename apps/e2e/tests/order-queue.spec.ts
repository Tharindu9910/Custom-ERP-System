import type { Page } from '@playwright/test';
import { OVERRIDE_PASSWORD, SA, SUP, call, coil, newPhone, payBalance, readyRoofingOrder, reserved, roofingOrder, sheetLine, sql, stock, withGrant } from '../support/api';
import { expect, test } from '../support/fixtures';
import { choose, dialog, field, row } from '../support/ui';

/** OQ: Order Queue for supervisors (Docs/testing/role-capabilities.md). */

const tab = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^${label}\\s*\\d*$`) }).last(); // KPI tiles come first

async function find(page: Page, orderNumber: string, tabLabel = 'All') {
  await page.goto('/order-queue');
  await tab(page, tabLabel).click();
  await page.getByPlaceholder('Search order number, customer name or phone...').fill(orderNumber);
  await expect(row(page, orderNumber)).toBeVisible();
  return row(page, orderNumber);
}

test.describe('supervisor', () => {
  test('OQ-20 each tab count equals the rows it lists', async ({ page }) => {
    await page.goto('/order-queue');
    for (const label of ['Active', 'Placed', 'In Progress', 'Ready', 'Released', 'Cancelled', 'All']) {
      const t = tab(page, label);
      await t.click();
      await page.waitForLoadState('networkidle');
      const n = Number((await t.innerText()).replace(/\D+/g, '') || 0);
      await expect(page.locator('tbody tr').filter({ has: page.locator('td:nth-child(6)') })).toHaveCount(n);
    }
  });

  test('OQ-21 search finds the order; the placed-on date narrows the list and Clear resets it', async ({ page }) => {
    const o = await roofingOrder();
    await find(page, o.order_number);
    await page.locator('input[type="date"]').fill('2000-01-01');
    await expect(row(page, o.order_number)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear', exact: true }).last().click();
    await expect(row(page, o.order_number)).toBeVisible();
  });

  test('OQ-22 Start → Complete → (cashier collects) → Release, with the detail timeline filled in', async ({ page }) => {
    const c = await coil();
    const o = await roofingOrder({ lines: [sheetLine(c.item_id, { length_ft: 10, pieces: 2 })], name: 'Queue Flow' });
    const before = await stock('thangalla', c.sku);
    let r = await find(page, o.order_number, 'Placed');
    // Supervisor never sees cashier actions
    await expect(r.getByRole('button', { name: /Collect|Cancel order|Edit order/ })).toHaveCount(0);
    await expect(r.locator('[title="Edit order"], [title="Cancel order"]')).toHaveCount(0);
    await r.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText(`Order ${o.order_number} started.`)).toBeVisible();
    expect(await stock('thangalla', c.sku)).toBe(before - 20);

    r = await find(page, o.order_number, 'In Progress');
    await r.getByRole('button', { name: 'Complete' }).click();
    await expect(page.getByText(`Order ${o.order_number} is ready for release.`)).toBeVisible();

    r = await find(page, o.order_number, 'Ready');
    // Balance still due: Release is a locked chip, not a button
    await expect(r.getByRole('button', { name: 'Release' })).toHaveCount(0);
    await expect(r.locator('[title*="collect it at the cashier first"]')).toBeVisible();

    const detail = (await call(SUP.thangalla, 'GET', `/orders/${o.order_id}`)).data;
    await payBalance(detail);
    r = await find(page, o.order_number, 'Ready');
    await r.getByRole('button', { name: 'Release' }).click();
    const rel = dialog(page).filter({ hasText: `Release Order ${o.order_number}` });
    const handedTo = rel.getByPlaceholder('Name of the person collecting');
    await expect(handedTo).toHaveValue('Queue Flow');
    await handedTo.fill('');
    await rel.getByRole('button', { name: 'Release to Customer' }).click();
    await expect(rel.getByText('Enter who collected the order.')).toBeVisible();
    await handedTo.fill('Queue Flow Driver');
    await rel.getByPlaceholder('Vehicle no., delivery note… (optional)').fill('CAB-1234');
    await rel.getByRole('button', { name: 'Release to Customer' }).click();
    await expect(rel).toHaveCount(0);
    await expect(page.getByText(`Order ${o.order_number} released to Queue Flow Driver.`)).toBeVisible();

    r = await find(page, o.order_number, 'Released');
    await r.click();
    const d = dialog(page);
    for (const step of ['Placed', 'Started', 'Completed', 'Released']) await expect(d.getByText(step, { exact: true }).first()).toBeVisible();
    await expect(d).toContainText('Queue Flow Driver');
  });

  test('OQ-23 detail modal shows items and payments; actions are offered there too', async ({ page }) => {
    const o = await roofingOrder();
    const r = await find(page, o.order_number, 'Placed');
    await r.locator('td').first().click();
    const d = dialog(page);
    await expect(d.getByText(/Items \(1\)/)).toBeVisible();
    await expect(d.getByText(/Payments \(1\)/)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('OQ-24 short coil on Place Order: override dialog; wrong password refused; right password places; Start then asks nothing', async ({ page }) => {
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
      await page.getByRole('button', { name: /% advance/ }).click();
      await page.getByRole('button', { name: 'Place Order' }).click();

      const ov = page.getByRole('dialog').filter({ hasText: 'Not enough stock' });
      await ov.locator('input[type="password"]').fill('wrong');
      await ov.getByPlaceholder('e.g. Sheets received today, not yet entered').fill('Urgent roof');
      await ov.getByRole('button', { name: 'Override and save' }).click();
      await expect(ov.getByText('The stock override password is incorrect')).toBeVisible();
      await ov.locator('input[type="password"]').fill(OVERRIDE_PASSWORD);
      await ov.getByRole('button', { name: 'Override and save' }).click();
      await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toBeVisible();

      const [o] = await sql(`SELECT o.order_number FROM "order" o JOIN customer c ON c.customer_id = o.customer_id WHERE c.name = $1`, [name]);
      const r = await find(page, o.order_number, 'Placed');
      await r.getByRole('button', { name: 'Start' }).click();
      await expect(page.getByText(`Order ${o.order_number} started.`)).toBeVisible();
      // All free coil is used; other open orders' holds stay for them
      expect(await stock('thangalla', low.sku)).toBe(await reserved('thangalla', low.sku));
    });
  });

  test('OQ-25 a fully paid ready order releases straight away', async ({ page }) => {
    const o = await readyRoofingOrder({ payFull: true });
    const r = await find(page, o.order_number, 'Ready');
    await r.getByRole('button', { name: 'Release' }).click();
    await dialog(page).getByRole('button', { name: 'Release to Customer' }).click();
    await expect(page.getByText(new RegExp(`Order ${o.order_number} released to `))).toBeVisible();
  });
});

test.describe('chief (BR21)', () => {
  test.use({ user: 'chief_thangalla' });
  test('OQ-26 the chief sees the coordination message on a supervisor\'s order; and has no Release', async ({ page }) => {
    const o = await roofingOrder();
    const r = await find(page, o.order_number, 'Placed');
    await r.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('A Supervisor is active. Coordinate with them to modify this record.')).toBeVisible();
    const ready = await readyRoofingOrder({ payFull: true });
    const rr = await find(page, ready.order_number, 'Ready');
    await expect(rr.getByRole('button', { name: 'Release' })).toHaveCount(0);
  });
});

test.describe('super admin', () => {
  test.use({ user: SA, branch: 'thangalla' });
  test('OQ-27 view only: rows offer just View; the detail has no actions', async ({ page }) => {
    const o = await roofingOrder();
    const r = await find(page, o.order_number, 'Placed');
    await expect(r.getByRole('button', { name: /Start|Complete|Release|Collect/ })).toHaveCount(0);
    await r.getByRole('button', { name: 'View' }).click();
    await expect(dialog(page).getByText(/Items \(1\)/)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: /Start|Complete|Release|Collect/ })).toHaveCount(0);
  });
});
