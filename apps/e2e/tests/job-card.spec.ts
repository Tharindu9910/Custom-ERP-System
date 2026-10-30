import type { Page } from '@playwright/test';
import { SUP, call, gatePass, jobCard, newPhone, passwordFor, ROLLING_LINE, CUSTOM_LINE } from '../support/api';
import { expect, test } from '../support/fixtures';
import { escape, field, navLink, pick, row } from '../support/ui';

/** JC: Create / Edit Job Card (Docs/testing/role-capabilities.md). */

async function header(page: Page, phone = newPhone(), name = `Job Card Browser ${Date.now() % 1_000_000}`) {
  await field(page, 'Customer Phone').fill(phone);
  await field(page, 'Customer Name').fill(name);
  return { phone, name };
}
async function pickWorker(page: Page, index = 0) {
  await page.getByPlaceholder('Select worker(s)').click();
  await page.locator('ul li button').nth(index).click();
}
async function addRolling(page: Page, qty = '2') {
  await page.getByRole('button', { name: 'Rolling', exact: true }).click();
  for (const l of ['Rolling Type', 'Sub Type', 'Size']) await pick(page, l);
  await field(page, 'Material Quantity').fill(qty);
  await page.getByRole('button', { name: 'Add Sub-Job' }).click();
}
async function cutCharge(page: Page, description: string) {
  await field(page, 'Cut Description').fill(description);
  await field(page, 'Cut Rate').fill('50');
  await field(page, 'Cut Quantity').fill('4');
}
/** Branch Cut / Bend priced by hand (Custom with a reason), so the card needs an advance. */
async function addCustomCut(page: Page) {
  await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await pick(page, 'Reason for custom pricing');
  await cutCharge(page, 'Cut sheet to design');
  await page.getByRole('button', { name: 'Add Sub-Job' }).click();
}
/** Cut / Bend on the customer's own material: a gate pass item (Docs/decisions/0007). */
async function addCustomerCut(page: Page, pieces = '2', item?: string | RegExp) {
  await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
  await page.getByRole('button', { name: "Customer's Material" }).click();
  await pick(page, 'Gate Pass Item', item);
  await field(page, 'Pieces Used').fill(pieces);
  await cutCharge(page, 'Cut customer sheet');
  await page.getByRole('button', { name: 'Add Sub-Job' }).click();
}
const subJobs = (page: Page) => page.locator('button[title="Delete"]');
/** The Total row of the Pricing section (label and amount). */
const total = (page: Page) => page.getByText(/^Total \(/).locator('xpath=..');

test.describe('create', () => {
  test('JC-20 Add Sub-Job stays disabled and says what is still needed', async ({ page }) => {
    await page.goto('/job-cards/new');
    await page.getByRole('button', { name: 'Rolling', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Sub-Job' })).toBeDisabled();
    await expect(page.getByText(/Still needed: .*Size is required/)).toBeVisible();
    for (const l of ['Rolling Type', 'Sub Type', 'Size']) await pick(page, l);
    await field(page, 'Material Quantity').fill('1');
    await expect(page.getByRole('button', { name: 'Add Sub-Job' })).toBeEnabled();
  });

  test('JC-21 submit refuses a card with no sub-job, then with no worker', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText('Please add at least one sub-job before submitting.')).toBeVisible();
    await addRolling(page);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText('Assign at least one worker.')).toBeVisible();
  });

  test('JC-22 sub-jobs can be edited and deleted before submitting; the total follows', async ({ page }) => {
    await page.goto('/job-cards/new');
    await addRolling(page, '2');
    await addCustomCut(page);
    await expect(subJobs(page)).toHaveCount(2);
    await expect(total(page)).toContainText('Rs');
    const before = await total(page).innerText();
    await page.locator('button[title="Edit"]').first().click();
    await expect(page.getByRole('heading', { name: 'Edit Sub-Job' })).toBeVisible();
    await field(page, 'Material Quantity').fill('5');
    await page.getByRole('button', { name: 'Update Sub-Job' }).click();
    await expect(page.getByText(/Qty: 5/)).toBeVisible();
    await expect(total(page)).not.toHaveText(before);
    await subJobs(page).last().click();
    await expect(subJobs(page)).toHaveCount(1);
  });

  test('JC-23 a customer-supplied card is created as awaiting payment with its minimum advance', async ({ page }) => {
    const gp = await gatePass();
    await page.goto('/job-cards/new');
    const { name } = await header(page, gp.phone, gp.name);
    await pickWorker(page);
    await addCustomerCut(page);
    await expect(page.getByText('Advance to collect at the cashier')).toBeVisible();
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText(/Job card JC-\d+ created and sent to the Cashier Queue/)).toBeVisible();
    await expect(page.getByText(/Minimum advance Rs/)).toBeVisible();
    // The form is cleared for the next card
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await page.goto('/workshop-queue');
    await page.getByRole('button', { name: /Awaiting payment/i }).first().click();
    await expect(row(page, name)).toBeVisible();
  });

  test('JC-24 a material with no standard rate is flagged and blocks submit until priced as custom', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await pickWorker(page);
    await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
    await pick(page, 'Material Type', 'Stainless Steel (SS)');
    await pick(page, 'Thickness', '6mm');
    await field(page, 'Material Qty').fill('1');
    await field(page, 'Total Cut Count').fill('1');
    await page.getByRole('button', { name: 'Add Sub-Job' }).click();
    await expect(page.getByText(/No standard rate/)).toBeVisible();
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText('Some sub-jobs have no standard rate. Mark them Custom and enter a price.')).toBeVisible();
  });

  test('JC-25 Cancel clears the form', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await addRolling(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(subJobs(page)).toHaveCount(0);
    await expect(field(page, 'Customer Phone')).toHaveValue('');
  });
});

test.describe('customer material and gate passes', () => {
  test("JC-30 the customer's gate pass items are listed; a sub-job takes one and what is left drops", async ({ page }) => {
    const gp = await gatePass();
    await page.goto('/job-cards/new');
    await header(page, gp.phone, gp.name);
    await expect(page.getByText("Customer's material (gate passes)")).toBeVisible();
    await expect(page.getByText('10 of 10 left')).toBeVisible();
    await addCustomerCut(page, '4');
    await expect(page.getByText('6 of 10 left')).toBeVisible();
    await expect(page.getByText(new RegExp(`${escape(gp.pass_number)} · MS Plain Sheet.*× 4`))).toBeVisible();
    // The next sub-job can take the rest, but no more
    await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
    await page.getByRole('button', { name: "Customer's Material" }).click();
    await pick(page, 'Gate Pass Item');
    await field(page, 'Pieces Used').fill('7');
    await expect(page.getByText(/Still needed: .*Only 6 left of that gate pass item/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Sub-Job' })).toBeDisabled();
  });

  test('JC-31 a customer sub-job needs a gate pass item; with no pass the editor says so', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await expect(page.getByText('No gate pass material for this customer.')).toBeVisible();
    await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
    await page.getByRole('button', { name: "Customer's Material" }).click();
    await expect(page.getByText('This customer has no gate pass material left. Record a gate pass first.')).toBeVisible();
    await expect(page.getByText(/Still needed: .*Pick the customer's material from a gate pass/)).toBeVisible();
  });

  test('JC-32 a mixed card (gate pass item + branch stock) commits the material (Partially Assigned)', async ({ page }) => {
    const gp = await gatePass();
    // From the gate pass: customer filled in, the editor on the customer's material with the item picked
    await page.goto(`/job-cards/new?gatePass=${gp.gate_pass_id}`);
    await expect(field(page, 'Customer Name')).toHaveValue(gp.name);
    await expect(page.getByRole('button', { name: new RegExp(escape(gp.pass_number)) }).first()).toBeVisible();
    await pickWorker(page);
    await field(page, 'Pieces Used').fill('4');
    await cutCharge(page, 'Cut customer sheet');
    await page.getByRole('button', { name: 'Add Sub-Job' }).click();
    await page.getByRole('button', { name: 'Branch Stock' }).click();
    await addRolling(page);
    await expect(subJobs(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText(/Job card JC-\d+ created/)).toBeVisible();
    const after = await call(SUP.thangalla, 'GET', `/gate-passes/${gp.gate_pass_id}`);
    expect([after.data.summary.status, after.data.summary.total_available]).toEqual(['PARTIALLY_ASSIGNED', 6]);
  });

  test('JC-33 "Create New Gate Pass" round trip keeps the half-filled card and picks the new item', async ({ page }) => {
    await page.goto('/job-cards/new');
    const tripName = `Round Trip ${Date.now() % 1_000_000}`;
    const { phone } = await header(page, newPhone(), tripName);
    await addCustomCut(page);
    await page.getByRole('button', { name: 'Create New Gate Pass' }).first().click();
    await expect(page).toHaveURL(/\/gate-pass\?.*return_to=job-card/);
    await expect(field(page, 'Customer Phone Number')).toHaveValue(phone);
    await field(page, 'Material Type').fill('MS Plain Sheet');
    await field(page, 'Quantity').fill('3');
    await page.getByRole('button', { name: 'Add Material' }).click();
    await page.getByRole('button', { name: 'Generate Gate Pass' }).click();
    await expect(page).toHaveURL(/\/job-cards\/new\?gatePass=/);
    await expect(field(page, 'Customer Name')).toHaveValue(tripName);
    await expect(subJobs(page)).toHaveCount(1);
    await expect(page.getByText('3 of 3 left')).toBeVisible();
    await expect(page.getByRole('button', { name: /MS Plain Sheet/ }).first()).toBeVisible();
  });
});

test.describe('edit', () => {
  test('JC-40 edit from the Workshop Queue: add a sub-job, update, back to the queue with a notice', async ({ page }) => {
    const name = `Edit Me ${Date.now() % 1_000_000}`;
    const card = await jobCard({ lines: [ROLLING_LINE, CUSTOM_LINE], name });
    await page.goto('/workshop-queue');
    await page.getByRole('button', { name: /Awaiting payment/i }).first().click();
    await row(page, name).getByRole('button', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/job-cards/${card.order_id}/edit`));
    await expect(page.getByRole('heading', { name: `Edit Job Card ${card.order_number}` })).toBeVisible();
    await expect(subJobs(page)).toHaveCount(2);
    await addRolling(page, '4');
    await page.getByRole('button', { name: 'Update Job Card' }).click();
    await expect(page).toHaveURL(/\/workshop-queue/);
    await expect(page.getByText(new RegExp(`${card.order_number} updated`))).toBeVisible();
  });

  test('JC-41 a card with work started opens locked', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE, CUSTOM_LINE], paid: true });
    const l = card.lines[0];
    await call(SUP.thangalla, 'POST', `/order-lines/${l.line_id}/start`, { version: l.version });
    await page.goto(`/job-cards/${card.order_id}/edit`);
    await expect(page.getByText('Work has started on this job card, so it can no longer be edited.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Job Card' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add Sub-Job' })).toHaveCount(0);
  });

  test('JC-42 Cancel on the edit page returns to the queue without saving', async ({ page }) => {
    const card = await jobCard();
    await page.goto(`/job-cards/${card.order_id}/edit`);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/\/workshop-queue/);
  });
});

test.describe('workshop-only branch', () => {
  test.use({ user: SUP.veyangoda });
  test('JC-43 Veyangoda creates job cards too', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await pickWorker(page);
    await addRolling(page);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText(/Job card JC-\d+ created/)).toBeVisible();
  });
});

test.describe('unfinished card is kept (sessionStorage draft)', () => {
  const awayAndBack = async (page: Page) => {
    await navLink(page, 'Workshop Queue').click();
    await expect(page).toHaveURL(/\/workshop-queue/);
    await navLink(page, 'Create Job Card').click();
    await expect(page).toHaveURL(/\/job-cards\/new/);
  };

  test('JC-50 leaving Create Job Card and coming back keeps the customer, workers, sub-jobs and the half-filled panel; a refresh too', async ({ page }) => {
    await page.goto('/job-cards/new');
    const { phone, name } = await header(page);
    await pickWorker(page);
    await addCustomCut(page);
    // Start the next sub-job but don't add it
    await field(page, 'Inches').fill('7');
    await awayAndBack(page);

    await expect(page.getByText('Your unfinished job card was kept while you were away.')).toBeVisible();
    await expect(field(page, 'Customer Phone')).toHaveValue(phone);
    await expect(field(page, 'Customer Name')).toHaveValue(name);
    await expect(subJobs(page)).toHaveCount(1);
    await expect(field(page, 'Inches')).toHaveValue('7');
    await expect(page.getByText('Advance to collect at the cashier')).toBeVisible();

    await page.reload();
    await expect(field(page, 'Customer Name')).toHaveValue(name);
    await expect(subJobs(page)).toHaveCount(1);
  });

  test('JC-51 Clear all asks first, then empties the form and the kept draft', async ({ page }) => {
    await page.goto('/job-cards/new');
    const clear = page.getByRole('button', { name: 'Clear all' });
    await expect(clear).toBeDisabled();
    await header(page);
    await pickWorker(page);
    await addCustomCut(page);
    await clear.click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Clear everything on this form?' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(subJobs(page)).toHaveCount(1);
    await clear.click();
    await confirm.getByRole('button', { name: 'Clear all' }).click();
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(subJobs(page)).toHaveCount(0);
    await expect(clear).toBeDisabled();
    await awayAndBack(page);
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(page.getByText('Your unfinished job card was kept')).toHaveCount(0);
  });

  test('JC-52 after a card is submitted, coming back shows an empty form', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await pickWorker(page);
    await addCustomCut(page);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText(/Job card JC-\d+ created/)).toBeVisible();
    await awayAndBack(page);
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(subJobs(page)).toHaveCount(0);
  });

  test('JC-53 the draft is not kept across a logout, and an edit page never uses it', async ({ page }) => {
    await page.goto('/job-cards/new');
    await header(page);
    await pickWorker(page);
    await addCustomCut(page);
    const card = await jobCard({ lines: [ROLLING_LINE] });
    await page.goto(`/job-cards/${card.order_id}/edit`);
    await expect(field(page, 'Customer Name')).toHaveValue(card.customer.name);
    await expect(page.getByText('Your unfinished job card was kept')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear all' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Username').fill(SUP.thangalla);
    await page.getByLabel('Password').fill(passwordFor(SUP.thangalla));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto('/job-cards/new');
    await expect(field(page, 'Customer Name')).toHaveValue('');
    await expect(subJobs(page)).toHaveCount(0);
  });
});

test.describe('history popup', () => {
  test('JC-60 History lists the branch\'s job cards by date; search waits for typing to stop; a row opens the card read-only', async ({ page }) => {
    const card = await jobCard({ lines: [ROLLING_LINE] });
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/job-cards/history')) calls.push(r.url());
    });
    await page.goto('/job-cards/new');
    expect(calls).toHaveLength(0); // nothing loads until the popup is opened
    await page.getByRole('button', { name: 'History' }).click();
    const h = page.getByRole('dialog').filter({ hasText: 'Job Card History' });
    await expect(h.getByRole('button', { name: 'Last 7 days' })).toBeVisible();
    await expect(h.locator('tbody tr').first()).toBeVisible();
    await expect.poll(() => calls.length).toBe(1);

    await h.getByPlaceholder('Job card no., customer name or phone').pressSequentially(card.order_number, { delay: 30 });
    await expect(h.locator('tbody tr')).toHaveCount(1);
    await expect(h.locator('tbody tr')).toContainText(card.order_number);
    expect(calls).toHaveLength(2); // one request for the whole search, not one per key

    await h.getByRole('button', { name: 'Today' }).click();
    await expect(h.locator('tbody tr')).toContainText(card.order_number);
    await h.locator('input[type="date"]').first().fill('2000-01-01');
    await h.locator('input[type="date"]').last().fill('2000-01-02');
    await expect(h.getByText(/No job cards in this period/)).toBeVisible();
    await h.getByRole('button', { name: 'Today' }).click();

    await h.locator('tbody tr').first().click();
    const d = page.getByRole('dialog').filter({ hasText: `Main Job Card: ${card.order_number}` });
    await expect(d).toBeVisible();
    await expect(d.getByRole('button', { name: 'Start' })).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Back on the history with the same filters, without asking the server again
    const before = calls.length;
    await expect(h.locator('tbody tr')).toContainText(card.order_number);
    expect(calls.length).toBe(before);
  });
});
