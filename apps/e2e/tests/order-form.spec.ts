import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { CASHIER, SUP, call, coil, gatePass, newPhone, roofingOrder } from '../support/api';
import { expect, test } from '../support/fixtures';
import { choose, escape, field, navLink } from '../support/ui';

/**
 * RO: Create Order (roofing) (Docs/testing/role-capabilities.md). The supervisor submits the
 * order to the Cashier Queue (Pricing only); the cashier places it with the payment.
 */

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
    // The next item keeps the coil; Flashing customized needs only the size and a photo
    await page.getByRole('button', { name: 'Flashing', exact: true }).click();
    await page.getByRole('button', { name: 'Customized', exact: true }).click();
    await field(page, 'Length (ft)').fill('8');
    await field(page, 'No. of Pieces').fill('2');
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

test.describe('supervisor submits to the cashier', () => {
  test('RO-25 no date to pick; Pricing has no discount or payment; Submit sends it to the Cashier Queue', async ({ page }) => {
    await page.goto('/orders/new');
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    const name = `Submitted In Browser ${Date.now() % 1_000_000}`;
    await customer(page, name);
    await sheet(page);
    await addToOrder(page).click();
    await expect(page.getByText('Pricing', { exact: true })).toBeVisible();
    await expect(page.getByText('Advance to collect at the cashier')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full', exact: true })).toHaveCount(0);
    await expect(page.locator('input[placeholder="0"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Place Order' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit Order' }).click();
    await expect(page.getByText(/Order WO-FORM-\d+ created and sent to the Cashier Queue/)).toBeVisible();
    await page.getByRole('button', { name: 'Open Order' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Awaiting Payment' })).toBeVisible();
    const [o] = (await call(CASHIER.thangalla, 'GET', '/cashier-queue')).data.filter((r: any) => r.customer_name === name);
    expect([o.column, o.order_type]).toEqual(['AWAITING_PAYMENT', 'ROOFING_ORDER']);
  });

  test('RO-27 each item shows its advance like a sub-job: fixed on a standard item, typed on a customized one; the total advance follows', async ({ page }) => {
    await page.goto('/orders/new');
    await customer(page);
    await sheet(page);
    await addToOrder(page).click();
    // Standard: a fixed amount, no input
    await expect(page.getByText('Standard item')).toBeVisible();
    await expect(page.getByLabel('Advance for this item')).toHaveCount(0);
    // The next item keeps the coil; Flashing customized needs only the size and a photo
    await page.getByRole('button', { name: 'Flashing', exact: true }).click();
    await page.getByRole('button', { name: 'Customized', exact: true }).click();
    await field(page, 'Length (ft)').fill('8');
    await field(page, 'No. of Pieces').fill('2');
    await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
    await expect(page.getByAltText('Design')).toBeVisible();
    await addToOrder(page).click();
    const input = page.getByLabel('Advance for this item');
    await expect(input).toHaveCount(1);
    await input.fill('99999999');
    await expect(page.getByText("More than this item's total.")).toBeVisible();
    await input.fill('100');
    await expect(page.getByRole('button', { name: 'Use suggested' })).toBeVisible();
    await expect(page.getByText('Advance to collect at the cashier')).toBeVisible();
  });

  test('RO-26 an unpaid order is edited from the Order History tab', async ({ page }) => {
    const o = await roofingOrder({ unpaid: true });
    await page.goto('/orders/new?tab=history');
    await page.getByPlaceholder('Order no., customer name or phone').fill(o.order_number);
    await page.locator('tbody tr').filter({ hasText: o.order_number }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${o.order_id}/edit`));
    await page.locator('button[title="Duplicate"]').first().click();
    await page.getByRole('button', { name: 'Update Order' }).click();
    await expect(page).toHaveURL(/\/orders\/new\?.*tab=history/);
    await expect(page.getByText(`Order ${o.order_number} updated.`)).toBeVisible();
  });
});

test.describe('cashier places the order with the payment', () => {
  test.use({ user: CASHIER.thangalla });

  test('RO-30 place with the minimum payment: banner with the order number, then on to the Order Queue', async ({ page }) => {
    await page.goto('/orders/new');
    const name = `Placed In Browser ${Date.now() % 1_000_000}`;
    await customer(page, name);
    await choose(page, 'Select worker');
    await sheet(page);
    await addToOrder(page).click();
    await page.getByRole('button', { name: 'Advance', exact: true }).click();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.getByText(/Order WO-FORM-\d+ placed/)).toBeVisible();
    await expect(page.getByText(/Balance Rs/)).toBeVisible();
    await page.getByRole('button', { name: 'Open Order' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: name })).toBeVisible();
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
    await page.getByRole('button', { name: 'Advance', exact: true }).click();
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
});

test.describe('customer material and coils', () => {
  test("RO-35 an item on the customer's material takes a gate pass item; what is left drops (Docs/decisions/0007)", async ({ page }) => {
    const gp = await gatePass(SUP.thangalla, [{ material_type: 'Zinc Coated', thickness: '1.5', quantity: 5 }]);
    // From the gate pass: customer filled in, the editor on the customer's material with the item picked
    await page.goto(`/orders/new?gatePass=${gp.gate_pass_id}`);
    await expect(field(page, 'Customer Name')).toHaveValue(gp.name);
    await expect(page.getByText('5 of 5 left')).toBeVisible();
    await page.getByRole('button', { name: 'Gutter', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(escape(gp.pass_number)) }).first()).toBeVisible();
    await field(page, 'Length (ft)').fill('10');
    await field(page, 'No. of Pieces').fill('2');
    await field(page, 'Pieces Used').fill('3');
    await addToOrder(page).click();
    await expect(page.getByText('2 of 5 left')).toBeVisible();
    await expect(page.getByText(new RegExp(`${escape(gp.pass_number)} · Zinc Coated.*× 3`))).toBeVisible();
    // No coil for the customer's material; the next item can't take more than is left
    await page.getByRole('button', { name: 'Gutter', exact: true }).click();
    await choose(page, 'Search gate pass material…');
    await field(page, 'Length (ft)').fill('10');
    await field(page, 'No. of Pieces').fill('1');
    await field(page, 'Pieces Used').fill('3');
    await expect(page.getByText(/Still needed: .*only 2 pieces left on that gate pass item/)).toBeVisible();
    await expect(addToOrder(page)).toBeDisabled();
  });

  test('RO-35b pieces used are suggested from the item size and the gate pass piece length', async ({ page }) => {
    const gp = await gatePass(SUP.thangalla, [{ material_type: 'Zinc Coated', thickness: '0.47', length: 20, length_unit: 'FT', quantity: 6 }]);
    await page.goto(`/orders/new?gatePass=${gp.gate_pass_id}`);
    await page.getByRole('button', { name: 'Gutter', exact: true }).click();
    await field(page, 'Length (ft)').fill('6');
    await field(page, 'No. of Pieces').fill('10');
    // 10 pcs × 6 ft = 60 ft from 20 ft pieces → 3
    await expect(field(page, 'Pieces Used')).toHaveValue('3');
    await expect(page.getByText('Filled in 3: 10 pcs × 6 ft = 60 ft from 20 ft pieces.')).toBeVisible();
    await field(page, 'Pieces Used').fill('4');
    await expect(page.getByText(/^Suggested 3:/)).toBeVisible();
  });

  test('RO-35c a customer item without a gate pass says what is missing', async ({ page }) => {
    await page.goto('/orders/new');
    await customer(page);
    await expect(page.getByText('No gate pass material for this customer.')).toBeVisible();
    await page.getByRole('button', { name: 'Gutter', exact: true }).click();
    await page.getByRole('button', { name: "Customer's Material" }).click();
    await expect(page.getByText('This customer has no gate pass material left. Record a gate pass first.')).toBeVisible();
    await expect(page.getByText(/Still needed: .*gate pass material/)).toBeVisible();
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
  // The cashier: the kept draft includes the payment
  test.use({ user: CASHIER.thangalla });

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
    await page.getByRole('button', { name: 'Advance', exact: true }).click();
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

test.describe('history tab', () => {
  test('RO-60 the Order History tab lists the branch\'s orders by date; a placed row opens the order without actions; the form is kept', async ({ page }) => {
    const o = await roofingOrder();
    await page.goto('/orders/new');
    await customer(page, 'Kept While On History');
    await page.getByRole('tab', { name: 'Order History' }).click();
    await expect(page).toHaveURL(/tab=history/);
    await page.getByPlaceholder('Order no., customer name or phone').fill(o.order_number);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Placed');
    await page.locator('tbody tr').first().click();
    const d = page.getByRole('dialog').filter({ hasText: o.order_number }).last();
    await expect(d.locator('h4', { hasText: /^Items$/ }).locator('..')).toContainText('1');
    await expect(d.getByRole('button', { name: /Start|Edit/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Create Order' }).click();
    await expect(field(page, 'Customer Name')).toHaveValue('Kept While On History');
  });
});
