import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { SUP, coil, gatePass, newPhone, roofingOrder } from '../support/api';
import { expect, test } from '../support/fixtures';
import { choose, field, navLink } from '../support/ui';

/** RO: Create Order (roofing) for supervisors (Docs/testing/role-capabilities.md). */

const PHOTO = resolve(__dirname, '../fixtures/design.png');

async function customer(page: Page, name = 'Roof Browser') {
  await field(page, 'Customer Phone').fill(newPhone());
  await field(page, 'Customer Name').fill(name);
}
async function sheet(page: Page, opts: { category?: string; length?: string; pieces?: string; coilSku?: string } = {}) {
  await page.getByRole('button', { name: opts.category ?? 'Roofing', exact: true }).click();
  await choose(page, /Search coil no\./, opts.coilSku);
  if (await page.getByRole('button', { name: 'Search pattern…' }).count()) await choose(page, 'Search pattern…');
  await field(page, 'Length (ft)').fill(opts.length ?? '10');
  await field(page, 'No. of Pieces').fill(opts.pieces ?? '2');
}
const addToOrder = (page: Page) => page.getByRole('button', { name: /^Add to Order|^Add \d+ Items to Order/ });
const itemRows = (page: Page) => page.locator('button[title="Remove"]');
const amount = (page: Page) => page.locator('input[type="number"][step="0.01"]').last();

test.describe('build the order', () => {
  test('RO-20 a sheet item needs a coil, pattern, length and pieces; running feet are shown', async ({ page }) => {
    await page.goto('/orders/new');
    await page.getByRole('button', { name: 'Roofing', exact: true }).click();
    await expect(addToOrder(page)).toBeDisabled();
    await expect(page.getByText(/Still needed: .*coil/)).toBeVisible();
    await sheet(page, { length: '12', pieces: '3' });
    await expect(page.getByText('Total: 12 ft × 3 pcs = 36 running ft')).toBeVisible();
    await expect(addToOrder(page)).toBeEnabled();
  });

  test('RO-21 items can be duplicated, edited and removed; the list is grouped by category', async ({ page }) => {
    await page.goto('/orders/new');
    await sheet(page);
    await addToOrder(page).click();
    await expect(page.getByText('Roofing (1)')).toBeVisible();
    await page.locator('button[title="Duplicate"]').first().click();
    await expect(page.getByText('Roofing (2)')).toBeVisible();
    await page.locator('button[title="Edit"]').first().click();
    await field(page, 'No. of Pieces').fill('7');
    await page.getByRole('button', { name: 'Update Item' }).click();
    await expect(page.getByText(/7 pcs|× 7/).first()).toBeVisible();
    await itemRows(page).first().click();
    await expect(page.getByText('Roofing (1)')).toBeVisible();
  });

  test('RO-22 a customized item needs a design photo; uploading it shows a preview', async ({ page }) => {
    await page.goto('/orders/new');
    await sheet(page, { category: 'Flashing' });
    await page.getByRole('button', { name: 'Customized', exact: true }).click();
    await expect(page.getByText(/Still needed: .*design photo/)).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
    await expect(page.getByAltText('Design')).toBeVisible();
    await expect(addToOrder(page)).toBeEnabled();
  });

  test('RO-23 an accessory item takes a type and quantity', async ({ page }) => {
    await page.goto('/orders/new');
    await page.getByRole('button', { name: 'Gutter Accessories', exact: true }).click();
    await choose(page, 'Search accessory…', 'Bracket (Aluminium)');
    await field(page, 'Quantity').fill('6');
    await addToOrder(page).click();
    await expect(page.getByText('Gutter Accessories (1)')).toBeVisible();
  });
});

test.describe('place the order', () => {
  test('RO-30 place with the minimum payment: banner with the order number, then on to the Order Queue', async ({ page }) => {
    await page.goto('/orders/new');
    const name = `Placed In Browser ${Date.now() % 1_000_000}`;
    await customer(page, name);
    await choose(page, 'Select worker');
    await sheet(page);
    await addToOrder(page).click();
    await page.getByRole('button', { name: /% advance/ }).click();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toBeVisible();
    await expect(page.getByText(/Balance Rs/)).toBeVisible();
    await page.getByRole('button', { name: /Go to Order Queue/ }).click();
    await expect(page).toHaveURL(/\/order-queue/);
    await expect(page.getByRole('table').getByText(name)).toBeVisible();
  });

  test('RO-31 "New Order" clears the banner for the next order', async ({ page }) => {
    await page.goto('/orders/new');
    await customer(page);
    await sheet(page);
    await addToOrder(page).click();
    await page.getByRole('button', { name: 'Full', exact: true }).click();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toBeVisible();
    await page.getByRole('button', { name: 'New Order' }).click();
    await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toHaveCount(0);
    await expect(itemRows(page)).toHaveCount(0);
  });

  test('RO-32 the form explains what is missing: customer, items, payment below minimum, above total, card reference', async ({ page }) => {
    await page.goto('/orders/new');
    const place = page.getByRole('button', { name: 'Place Order' });
    await customer(page);
    await place.click();
    await expect(page.getByText('Please add at least one item.')).toBeVisible();
    await sheet(page);
    await addToOrder(page).click();
    await amount(page).fill('1');
    await place.click();
    await expect(page.getByText(/At least Rs .* must be paid\./)).toBeVisible();
    await amount(page).fill('99999999');
    await place.click();
    await expect(page.getByText(/Amount is more than the balance/)).toBeVisible();
    await page.getByRole('button', { name: /% advance/ }).click();
    await page.getByRole('button', { name: 'Card', exact: true }).click();
    await place.click();
    await expect(page.getByText('Enter the card or bank reference.')).toBeVisible();
  });

  test('RO-33 a discount above the branch limit is refused', async ({ page }) => {
    await page.goto('/orders/new');
    await customer(page);
    await sheet(page);
    await addToOrder(page).click();
    await page.locator('input[placeholder="0"]').first().fill('9999999');
    await page.getByRole('button', { name: 'Full', exact: true }).click();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.getByText(/The discount can't be more than \d+%/)).toBeVisible();
  });

  test('RO-34 offline: payments are blocked and the order cannot be placed (BR18)', async ({ page, context }) => {
    await page.goto('/orders/new');
    await customer(page);
    await sheet(page);
    await addToOrder(page).click();
    await page.getByRole('button', { name: 'Full', exact: true }).click();
    await context.setOffline(true);
    await expect(page.getByText("Payments can't be taken offline (BR18). Reconnect to place the order.").first()).toBeVisible();
    await page.getByRole('button', { name: 'Place Order' }).click();
    // The refusal is shown twice (banner over the payment box + form error); nothing is placed
    await expect(page.getByText("Payments can't be taken offline (BR18). Reconnect to place the order.")).toHaveCount(2);
    await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toHaveCount(0);
    await context.setOffline(false);
  });

  test('RO-35 customer-supplied material from the customer\'s gate pass', async ({ page }) => {
    const gp = await gatePass(SUP.thangalla, [{ material_type: 'Zinc Coated', thickness: '1.5', quantity: 5 }]);
    await page.goto(`/orders/new?gatePass=${gp.gate_pass_id}`);
    await expect(page.getByText('Allocate Customer Materials')).toBeVisible();
    await page.locator('input[type="number"][max]').first().fill('3');
    await page.getByRole('button', { name: 'Confirm Allocation' }).click();
    await expect(page.getByText('Allocated: 3')).toBeVisible();
    await expect(field(page, 'Customer Name')).toHaveValue(gp.name);
  });

  test('RO-36 the coil list shows our stock for each coil', async ({ page }) => {
    const c = await coil();
    await page.goto('/orders/new');
    await page.getByRole('button', { name: 'Roofing', exact: true }).click();
    await page.getByRole('button', { name: /Search coil no\./ }).first().click();
    await expect(page.locator('ul li').filter({ hasText: c.sku }).first()).toBeVisible();
  });
});

test.describe('unfinished order is kept (sessionStorage draft)', () => {
  const awayAndBack = async (page: Page) => {
    await navLink(page, 'Order Queue').click();
    await expect(page).toHaveURL(/\/order-queue/);
    await navLink(page, 'Create Order').click();
    await expect(page).toHaveURL(/\/orders\/new/);
  };

  test('RO-50 leaving Create Order and coming back keeps the customer, items, the half-filled item and the payment', async ({ page }) => {
    await page.goto('/orders/new');
    await customer(page, 'Kept Order Customer');
    await sheet(page);
    await addToOrder(page).click();
    await expect(itemRows(page)).toHaveCount(1);
    // The editor keeps the category and coil: start the next item but don't add it
    await field(page, 'Length (ft)').fill('7');
    await field(page, 'No. of Pieces').fill('3');
    await page.getByRole('button', { name: /% advance/ }).click();
    const paid = await amount(page).inputValue();
    await awayAndBack(page);

    await expect(page.getByText('Your unfinished order was kept while you were away.')).toBeVisible();
    await expect(field(page, 'Customer Name')).toHaveValue('Kept Order Customer');
    await expect(itemRows(page)).toHaveCount(1);
    await expect(field(page, 'Length (ft)')).toHaveValue('7');
    await expect(field(page, 'No. of Pieces')).toHaveValue('3');
    await expect(amount(page)).toHaveValue(paid);
  });

  test('RO-51 Clear all asks first, then empties the form and the kept draft', async ({ page }) => {
    await page.goto('/orders/new');
    const clear = page.getByRole('button', { name: 'Clear all' });
    await expect(clear).toBeDisabled();
    await customer(page);
    await sheet(page);
    await addToOrder(page).click();
    await clear.click();
    await page.getByRole('dialog').filter({ hasText: 'Clear everything on this form?' }).getByRole('button', { name: 'Clear all' }).click();
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(itemRows(page)).toHaveCount(0);
    await awayAndBack(page);
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(itemRows(page)).toHaveCount(0);
  });

  test('RO-52 after an order is placed, coming back shows an empty form', async ({ page }) => {
    await page.goto('/orders/new');
    await customer(page);
    await sheet(page);
    await addToOrder(page).click();
    await page.getByRole('button', { name: 'Full', exact: true }).click();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toBeVisible();
    await awayAndBack(page);
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(itemRows(page)).toHaveCount(0);
  });
});

test.describe('history popup', () => {
  test('RO-60 History lists the branch\'s orders by date; a row opens the order without actions', async ({ page }) => {
    const o = await roofingOrder();
    await page.goto('/orders/new');
    await page.getByRole('button', { name: 'History' }).click();
    const h = page.getByRole('dialog').filter({ hasText: 'Order History' });
    await h.getByPlaceholder('Order no., customer name or phone').fill(o.order_number);
    await expect(h.locator('tbody tr')).toHaveCount(1);
    await expect(h.locator('tbody tr')).toContainText('Placed');
    await h.locator('tbody tr').first().click();
    const d = page.getByRole('dialog').filter({ hasText: o.order_number }).last();
    await expect(d.getByText(/Items \(1\)/)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Start' })).toHaveCount(0);
  });
});
