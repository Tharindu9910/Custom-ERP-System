import type { Page } from '@playwright/test';
import { SUP, call, gatePass, jobCard, newPhone, passwordFor, ROLLING_LINE, CUSTOM_LINE } from '../support/api';
import { expect, test } from '../support/fixtures';
import { field, navLink, row } from '../support/ui';

/** JC: Create / Edit Job Card (Docs/testing/role-capabilities.md). */

async function header(page: Page, phone = newPhone(), name = `Job Card Browser ${Date.now() % 1_000_000}`) {
  await field(page, 'Phone Number').fill(phone);
  await field(page, 'Customer Name').fill(name);
  return { phone, name };
}
async function pickWorker(page: Page, index = 0) {
  await page.getByPlaceholder('Select worker(s)').click();
  await page.locator('ul li button').nth(index).click();
}
async function addRolling(page: Page, qty = '2') {
  await page.getByRole('button', { name: 'Rolling', exact: true }).click();
  for (const l of ['Rolling Type', 'Sub Type', 'Size']) await field(page, l).selectOption({ index: 1 });
  await field(page, 'Material Quantity').fill(qty);
  await page.getByRole('button', { name: 'Add Sub-Job' }).click();
}
async function addCustomerCut(page: Page) {
  await page.getByRole('button', { name: 'Cut / Bend', exact: true }).click();
  await page.getByRole('button', { name: 'Customer Supplied' }).last().click();
  await field(page, 'Cut Description').fill('Cut customer sheet');
  await field(page, 'Cut Rate').fill('50');
  await field(page, 'Cut Quantity').fill('4');
  await page.getByRole('button', { name: 'Add Sub-Job' }).click();
}
const subJobs = (page: Page) => page.locator('button[title="Delete"]');

test.describe('create', () => {
  test('JC-20 Add Sub-Job stays disabled and says what is still needed', async ({ page }) => {
    await page.goto('/job-cards/new');
    await page.getByRole('button', { name: 'Rolling', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Sub-Job' })).toBeDisabled();
    await expect(page.getByText(/Still needed: .*Size is required/)).toBeVisible();
    for (const l of ['Rolling Type', 'Sub Type', 'Size']) await field(page, l).selectOption({ index: 1 });
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
    await addCustomerCut(page);
    await expect(subJobs(page)).toHaveCount(2);
    await expect(page.getByText(/Total Rs/)).toBeVisible();
    const before = await page.getByText(/Total Rs/).innerText();
    await page.locator('button[title="Edit"]').first().click();
    await expect(page.getByRole('heading', { name: 'Edit Sub-Job' })).toBeVisible();
    await field(page, 'Material Quantity').fill('5');
    await page.getByRole('button', { name: 'Update Sub-Job' }).click();
    await expect(page.getByText(/Qty: 5/)).toBeVisible();
    await expect(page.getByText(/Total Rs/)).not.toHaveText(before);
    await subJobs(page).last().click();
    await expect(subJobs(page)).toHaveCount(1);
  });

  test('JC-23 a customer-supplied card is created as awaiting payment with its minimum advance', async ({ page }) => {
    await page.goto('/job-cards/new');
    const { name } = await header(page);
    await pickWorker(page);
    await addCustomerCut(page);
    await expect(page.getByText(/Advance to collect at the cashier Rs/)).toBeVisible();
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText(/Job card JC-\d+ created and sent to the Cashier Queue. Minimum advance: Rs/)).toBeVisible();
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
    await field(page, 'Material Type').selectOption('Stainless Steel (SS)');
    await field(page, 'Thickness').selectOption('6mm');
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
    await expect(field(page, 'Phone Number')).toHaveValue('');
  });
});

test.describe('customer material and gate passes', () => {
  test('JC-30 Customer Supplied shows the gate pass panel; allocate from the customer\'s pass, then unassign', async ({ page }) => {
    const gp = await gatePass();
    await page.goto('/job-cards/new');
    await header(page, gp.phone, gp.name);
    await page.getByRole('button', { name: 'Customer Supplied' }).first().click();
    await expect(page.getByText('Available Gate Passes for Customer')).toBeVisible();
    await page.getByRole('button', { name: 'Allocate Materials' }).first().click();
    await expect(page.getByText('Allocate Customer Materials')).toBeVisible();
    await page.locator('input[type="number"][max]').first().fill('4');
    await page.getByRole('button', { name: 'Confirm Allocation' }).click();
    await expect(page.getByText('Assigned Gate Pass')).toBeVisible();
    await expect(page.getByText('Allocated: 4')).toBeVisible();
    await page.getByRole('button', { name: 'Unassign' }).click();
    await expect(page.getByText('Assigned Gate Pass')).toHaveCount(0);
  });

  test('JC-31 the allocation cannot exceed what the pass has left', async ({ page }) => {
    const gp = await gatePass();
    await page.goto(`/job-cards/new?gatePass=${gp.gate_pass_id}`);
    // Coming from the gate pass, the allocation opens straight away with the customer filled in
    await expect(page.getByText('Allocate Customer Materials')).toBeVisible();
    const qty = page.locator('input[type="number"][max]').first();
    await qty.fill('99');
    await expect(qty).toHaveValue('10');
    await page.getByRole('button', { name: 'Confirm Allocation' }).click();
    await expect(field(page, 'Customer Name')).toHaveValue(gp.name);
  });

  test('JC-32 a card using the pass commits the material (Partially Assigned)', async ({ page }) => {
    const gp = await gatePass();
    await page.goto(`/job-cards/new?gatePass=${gp.gate_pass_id}`);
    await page.locator('input[type="number"][max]').first().fill('4');
    await page.getByRole('button', { name: 'Confirm Allocation' }).click();
    await pickWorker(page);
    await addCustomerCut(page);
    await page.getByRole('button', { name: 'Submit Job Card' }).click();
    await expect(page.getByText(/Job card JC-\d+ created/)).toBeVisible();
    const after = await call(SUP.thangalla, 'GET', `/gate-passes/${gp.gate_pass_id}`);
    expect(after.data.summary.status).toBe('PARTIALLY_ASSIGNED');
  });

  test('JC-33 "Create New Gate Pass" round trip keeps the half-filled card', async ({ page }) => {
    await page.goto('/job-cards/new');
    const tripName = `Round Trip ${Date.now() % 1_000_000}`;
    const { phone } = await header(page, newPhone(), tripName);
    await addCustomerCut(page);
    await page.getByRole('button', { name: 'Create New Gate Pass' }).click();
    await expect(page).toHaveURL(/\/gate-pass\?.*return_to=job-card/);
    await expect(field(page, 'Customer Phone Number')).toHaveValue(phone);
    await field(page, 'Material Type').fill('MS Plain Sheet');
    await field(page, 'Quantity').fill('3');
    await page.getByRole('button', { name: 'Add Material' }).click();
    await page.getByRole('button', { name: 'Generate Gate Pass' }).click();
    await expect(page).toHaveURL(/\/job-cards\/new\?gatePass=/);
    await expect(page.getByText('Allocate Customer Materials')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Allocation' })).toBeDisabled();
    await page.locator('input[type="number"][max]').first().fill('3');
    await page.getByRole('button', { name: 'Confirm Allocation' }).click();
    await expect(field(page, 'Customer Name')).toHaveValue(tripName);
    await expect(subJobs(page)).toHaveCount(1);
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
    await addCustomerCut(page);
    // Start the next sub-job but don't add it
    await field(page, 'Inches').fill('7');
    await awayAndBack(page);

    await expect(page.getByText('Your unfinished job card was kept while you were away.')).toBeVisible();
    await expect(field(page, 'Phone Number')).toHaveValue(phone);
    await expect(field(page, 'Customer Name')).toHaveValue(name);
    await expect(subJobs(page)).toHaveCount(1);
    await expect(field(page, 'Inches')).toHaveValue('7');
    await expect(page.getByText(/Advance to collect at the cashier Rs/)).toBeVisible();

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
    await addCustomerCut(page);
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
    await addCustomerCut(page);
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
    await addCustomerCut(page);
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
