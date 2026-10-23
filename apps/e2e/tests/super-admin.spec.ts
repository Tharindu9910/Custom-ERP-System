import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { BRANCH, OVERRIDE_PASSWORD, SA, SUP, call, colomboToday, jobCard, login, material, newPhone, roofingOrder, workerIds } from '../support/api';
import { expect, signIn, test } from '../support/fixtures';
import { dialog, menuLabels, pickBranch, row } from '../support/ui';

/** SA: Super Admin settings and head-office views (Docs/testing/role-capabilities.md). */
test.use({ user: SA });

const unique = () => `${Date.now() % 1_000_000}`;
const fieldIn = (scope: Page, label: string) => scope.locator('label').filter({ hasText: new RegExp(`^\\s*${label}`) }).first().locator('xpath=..').locator('input, select, textarea').first();

async function openBranch(page: Page, name: string) {
  await page.goto('/settings/branch-config');
  await row(page, name).getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByRole('button', { name: 'All branches' })).toBeVisible();
}
const section = (page: Page, label: string) => page.locator('nav').last().getByRole('button', { name: new RegExp(`^${label}`) });

test.describe('branch config', () => {
  test('SA-10 the branch list: every branch, search and type filter; Add branch is offered', async ({ page }) => {
    await page.goto('/settings/branch-config');
    for (const b of ['Naiwala', 'Veyangoda', 'Thangalla']) await expect(row(page, b)).toBeVisible();
    await page.getByPlaceholder('Search name or code...').fill('Vey');
    await expect(row(page, 'Thangalla')).toHaveCount(0);
    await expect(row(page, 'Veyangoda')).toBeVisible();
    await page.getByPlaceholder('Search name or code...').fill('');
    await page.locator('select').first().selectOption('ROOFING');
    await expect(row(page, 'Naiwala')).toBeVisible();
    await expect(row(page, 'Veyangoda')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add branch' })).toBeVisible();
  });

  test('SA-11 add a branch: a duplicate name is caught in the form; the new branch opens for configuring', async ({ page }) => {
    await page.goto('/settings/branch-config');
    await page.getByRole('button', { name: 'Add branch' }).click();
    const d = dialog(page);
    await d.getByPlaceholder('e.g. Matara').fill('Naiwala');
    await expect(d.getByText('A branch with this name already exists.')).toBeVisible();
    const name = `E2E Branch ${unique()}`;
    await d.getByPlaceholder('e.g. Matara').fill(name);
    await d.getByPlaceholder('e.g. BR-MAT-001').fill(`BR-E2E-${unique()}`);
    await d.getByRole('radio').nth(1).check(); // Workshop
    await d.getByRole('button', { name: 'Create & configure' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'All branches' }).click();
    await expect(row(page, name)).toBeVisible();
  });

  test('SA-12 a feature switch: unsaved → Discard; then Save turns it off for the branch; turn it back on', async ({ page }) => {
    await openBranch(page, 'Thangalla');
    await section(page, 'Features').click();
    const gp = page.getByRole('switch', { name: 'Gate Pass' });
    await expect(gp).toHaveAttribute('aria-checked', 'true');
    await gp.click();
    await expect(page.getByText('You have unsaved changes.')).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(gp).toHaveAttribute('aria-checked', 'true');
    try {
      await gp.click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Saved.')).toBeVisible();
      expect((await call(SA, 'GET', `/branches/${BRANCH.thangalla}/config`)).data.features.gatePass).toBe(false);
      await expect(section(page, 'Features')).toContainText('Customized');
      await page.getByRole('button', { name: 'Reset to defaults' }).click();
      await expect(gp).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Saved.')).toBeVisible();
    } finally {
      await call(SA, 'PATCH', `/branches/${BRANCH.thangalla}/config`, { features: { gatePass: true } });
    }
  });

  test('SA-13 leaving with unsaved changes asks first', async ({ page }) => {
    await openBranch(page, 'Veyangoda');
    await section(page, 'Features').click();
    await page.getByRole('switch', { name: 'Inventory' }).click();
    page.once('dialog', (d) => void d.dismiss());
    await page.getByRole('button', { name: 'All branches' }).click();
    await expect(page.getByText('You have unsaved changes.')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'All branches' }).click();
    await expect(page.getByRole('heading', { name: 'Branch Configuration' })).toBeVisible();
  });

  test('SA-14 make another branch main (confirm), then move it back', async ({ page }) => {
    try {
      await openBranch(page, 'Veyangoda');
      await page.getByRole('button', { name: 'Make main branch' }).click();
      await dialog(page).getByRole('button', { name: 'Make main' }).click();
      await expect(page.getByRole('button', { name: 'Make main branch' })).toHaveCount(0);
      const list = (await call(SA, 'GET', '/branches')).data;
      expect(list.find((b: any) => b.is_main).name).toBe('Veyangoda');
    } finally {
      await call(SA, 'PATCH', `/branches/${BRANCH.naiwala}`, { is_main: true });
    }
  });

  test('SA-15 the override password set here is what supervisors must enter', async ({ page }) => {
    const m = await material('thangalla', 1);
    const body = (override: { password: string; reason: string }) => ({
      client_request_id: randomUUID(),
      customer: { phone: newPhone(), name: 'Override Password Customer' },
      job_date: colomboToday(),
      material_source: 'BRANCH',
      lines: [{ job_type: 'CUT_BEND', material_type: m.material_type, thickness: m.thickness, material_quantity: m.quantity + 5, cut_count: 1 }],
      override,
    });
    const workers = await workerIds(SUP.thangalla);
    await openBranch(page, 'Thangalla');
    await section(page, 'Orders & Payments').click();
    await page.getByPlaceholder('Leave blank to keep the current one').fill('Browser@99');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    try {
      // Saving a short card is where the override is asked for (Docs/decisions/0003)
      const old = await call(SUP.thangalla, 'POST', '/job-cards', { ...body({ password: OVERRIDE_PASSWORD, reason: 'Old password' }), worker_ids: workers });
      expect(old.code).toBe('STK_002');
      const ok = await call(SUP.thangalla, 'POST', '/job-cards', { ...body({ password: 'Browser@99', reason: 'New password' }), worker_ids: workers });
      expect(ok.status).toBe(201);
    } finally {
      await call(SA, 'PATCH', `/branches/${BRANCH.thangalla}/config`, { stock_override_password: OVERRIDE_PASSWORD });
    }
  });

  test('SA-16 deactivating the main branch is refused', async ({ page }) => {
    await openBranch(page, 'Naiwala');
    await section(page, 'Branch Details').click();
    await page.getByRole('switch', { name: 'Branch is active' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    const confirm = dialog(page).getByRole('button', { name: 'Deactivate & save' });
    await confirm.click();
    await expect(page.getByText('The main branch must be active')).toBeVisible();
    expect((await call(SA, 'GET', '/branches')).data.find((b: any) => b.name === 'Naiwala').is_active).toBe(true);
  });

  test('SA-17 another branch can be deactivated (confirm) and it leaves the transfer targets; reactivate it', async ({ page }) => {
    try {
      await openBranch(page, 'Veyangoda');
      await section(page, 'Branch Details').click();
      await page.getByRole('switch', { name: 'Branch is active' }).click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await dialog(page).getByRole('button', { name: 'Deactivate & save' }).click();
      await expect(page.getByText('Saved.')).toBeVisible();
      const names = (await call(SUP.thangalla, 'GET', '/stock-transfers/targets')).data.map((t: any) => t.name);
      expect(names).not.toContain('Veyangoda');
    } finally {
      await call(SA, 'PATCH', `/branches/${BRANCH.veyangoda}`, { is_active: true });
    }
  });
});

test.describe('users', () => {
  test('SA-20 every user is listed, head office as "Head office"', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(row(page, 'superadmin')).toContainText('Head office');
    await expect(row(page, SUP.thangalla)).toContainText('Thangalla');
  });

  test('SA-21 the role list never offers SUPER ADMIN; head-office roles hide the branch', async ({ page }) => {
    await page.goto('/settings/users');
    await page.getByRole('button', { name: 'Add User' }).click();
    const role = fieldIn(page, 'Role');
    const roles = await role.locator('option').allInnerTexts();
    expect(roles.join('|')).not.toMatch(/SUPER[ _]?ADMIN/i);
    await role.selectOption('AUDITOR');
    await expect(page.locator('label').filter({ hasText: /^\s*Branch/ })).toHaveCount(0);
    await role.selectOption('CASHIER');
    await expect(page.locator('label').filter({ hasText: /^\s*Branch/ })).toBeVisible();
  });

  test('SA-22 add a branch user; a duplicate username is refused', async ({ page }) => {
    const username = `e2e_ui_${unique()}`;
    const fill = async () => {
      await page.getByRole('button', { name: 'Add User' }).click();
      await fieldIn(page, 'Full Name').fill('UI Created');
      await fieldIn(page, 'Username').fill(username);
      await fieldIn(page, 'Password').fill('Dev@1234');
      await fieldIn(page, 'Role').selectOption('CASHIER');
      await fieldIn(page, 'Branch').selectOption({ label: 'Thangalla' });
      await page.getByRole('button', { name: 'Create User' }).click();
    };
    await page.goto('/settings/users');
    await fill();
    await expect(row(page, username)).toBeVisible();
    await fill();
    await expect(page.getByText('A user with this username already exists')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect((await login(username, 'Dev@1234')).user.branch_id).toBe(BRANCH.thangalla);
  });

  test('SA-23 deactivate (confirm) blocks sign-in; Activate restores it', async ({ page }) => {
    const username = `e2e_deact_${unique()}`;
    await call(SA, 'POST', '/users', { username, password: 'Dev@1234', full_name: 'Deact Me', role: 'CASHIER', branch_id: BRANCH.thangalla });
    await page.goto('/settings/users');
    await row(page, username).getByRole('button', { name: 'Deactivate' }).click();
    // Confirm in the dialog (its button is the last "Deactivate" on the page)
    await page.getByRole('button', { name: 'Deactivate', exact: true }).last().click();
    await expect(row(page, username).getByRole('button', { name: 'Activate' })).toBeVisible();
    await expect(login(username, 'Dev@1234')).rejects.toThrow(/deactivated|401/);
    await row(page, username).getByRole('button', { name: 'Activate' }).click();
    await expect(row(page, username).getByRole('button', { name: 'Deactivate' })).toBeVisible();
    await expect(login(username, 'Dev@1234')).resolves.toBeTruthy();
  });

  test('SA-24 edit a user\'s name', async ({ page }) => {
    const username = `e2e_edit_${unique()}`;
    await call(SA, 'POST', '/users', { username, password: 'Dev@1234', full_name: 'Before Edit', role: 'CASHIER', branch_id: BRANCH.thangalla });
    await page.goto('/settings/users');
    await row(page, username).getByRole('button', { name: 'Edit' }).click();
    await fieldIn(page, 'Full Name').fill('After Edit');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(row(page, username)).toContainText('After Edit');
  });
});

test.describe('role permissions', () => {
  test('SA-30 the matrix shows every role but SUPER ADMIN', async ({ page }) => {
    await page.goto('/settings/permissions');
    await expect(page.getByText('SUPER_ADMIN always has full access — not shown here.')).toBeVisible();
    const head = await page.locator('thead').innerText();
    for (const r of ['ADMIN', 'AUDITOR', 'SUPERVISOR', 'CHIEF', 'CASHIER', 'MANAGER']) expect(head).toContain(r);
    expect(head).not.toContain('SUPER ADMIN');
  });

  test('SA-31 revoking view:inventory from SUPERVISOR removes Inventory from a supervisor\'s menu; granting it back restores it', async ({ page, browser }) => {
    await page.goto('/settings/permissions');
    const heads = (await page.locator('thead th').allInnerTexts()).map((h) => h.split('\n')[0].trim());
    const col = heads.findIndex((h) => h === 'SUPERVISOR');
    const box = row(page, 'view:inventory').locator('td').nth(col).locator('input');
    const save = page.locator('thead th').nth(col).getByRole('button', { name: 'Save' });
    const sup = await browser.newContext();
    const supPage = await sup.newPage();
    try {
      await box.uncheck();
      await save.click();
      await expect(save).toHaveText('Save');
      await signIn(supPage, SUP.thangalla);
      await supPage.goto('/gate-pass');
      expect(await menuLabels(supPage)).not.toContain('Inventory');
    } finally {
      await box.check();
      await save.click();
      await expect(save).toHaveText('Save');
    }
    await supPage.reload();
    expect(await menuLabels(supPage)).toContain('Inventory');
    await sup.close();
  });
});

test.describe('head-office views of branch screens', () => {
  test('SA-40 cashier queue is readable with no Record payment', async ({ page }) => {
    await jobCard();
    await page.goto('/cashier-queue');
    await pickBranch(page, 'Thangalla');
    await expect(page.getByRole('heading', { name: 'Cashier Queue' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  });

  test('SA-41 workers (branch page): list readable, no Add / Edit / Deactivate', async ({ page }) => {
    await page.goto('/settings/workers');
    await pickBranch(page, 'Thangalla');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Worker|Edit|Deactivate/ })).toHaveCount(0);
  });

  test('SA-42 customers (global page): readable, no Add Customer or Edit (G2)', async ({ page }) => {
    await roofingOrder();
    await page.goto('/customers');
    await expect(page.getByText('Global · applies to all branches')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Customer' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
