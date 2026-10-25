import type { Page } from '@playwright/test';
import { BRANCH, SA, SUP, call, employee, login, sql } from '../support/api';
import { expect, signIn, test } from '../support/fixtures';

/** CHF / PWD: Create Chief Profile and passwords (Docs/testing/role-capabilities.md). */

let seq = 0;
const email = (who: string) => `${who}.${Date.now()}${++seq}@example.com`;
const pwd = (page: Page, label: string) => page.locator('label').filter({ hasText: label }).locator('xpath=..').locator('input');

async function createChiefInUi(page: Page, name: string, mail: string) {
  await page.goto('/chiefs/new');
  await page.getByPlaceholder('Enter Employee ID or Name...').fill(name);
  await page.locator('li').filter({ hasText: name }).click();
  await page.getByPlaceholder('chief@example.com').fill(mail);
  await page.getByRole('button', { name: 'Create Chief Profile' }).click();
  await expect(page.getByText(`Chief profile created for ${name}`)).toBeVisible();
  return (await page.locator('p.font-mono').nth(1).innerText()).trim();
}

/** A fresh branch user made by head office, so password tests never touch the seeded logins. */
async function freshUser(role = 'SUPERVISOR') {
  const username = `e2e_pwd_${Date.now()}${++seq}`;
  const r = await call(SA, 'POST', '/users', { username, password: 'Dev@1234', full_name: 'Password Tester', role, branch_id: BRANCH.thangalla });
  expect(r.status).toBe(201);
  return username;
}

test.describe('create chief profile (supervisor)', () => {
  test('CHF-10 only our own active employees without a login are listed', async ({ page }) => {
    const mine = await employee('thangalla', `Thangalla Emp ${Date.now() % 100000}`);
    const theirs = await employee('veyangoda', `Veyangoda Emp ${Date.now() % 100000}`);
    await page.goto('/chiefs/new');
    const list = page.locator('main li');
    await expect(list.filter({ hasText: mine.full_name })).toBeVisible();
    await expect(list.filter({ hasText: theirs.full_name })).toHaveCount(0);
    // Employees who already have a login (the supervisor) are not offered
    await expect(list.filter({ hasText: 'Supervisor' })).toHaveCount(0);
    await page.getByPlaceholder('Enter Employee ID or Name...').fill('no-such-person-xyz');
    await expect(page.getByText('No employees found without a profile.')).toBeVisible();
  });

  test('CHF-11 picking an employee shows their details; an invalid email is refused', async ({ page }) => {
    const e = await employee('thangalla', `Detail Emp ${Date.now() % 100000}`);
    await page.goto('/chiefs/new');
    await expect(page.getByText('Select an employee from the list')).toBeVisible();
    await page.locator('li').filter({ hasText: e.full_name }).click();
    await expect(page.getByText('Employee Details')).toBeVisible();
    await page.getByPlaceholder('chief@example.com').fill('not-an-email');
    await page.getByRole('button', { name: 'Create Chief Profile' }).click();
    await expect(page.getByText(/email/i).last()).toBeVisible();
    await expect(page.getByText(/Chief profile created/)).toHaveCount(0);
  });

  test('CHF-12 creates the login and shows the temporary password once; the employee leaves the list', async ({ page }) => {
    const e = await employee('thangalla', `Chief To Be ${Date.now() % 100000}`);
    const mail = email('chief');
    const temp = await createChiefInUi(page, e.full_name, mail);
    expect(temp).toMatch(/^[A-Za-z0-9]{10}$/);
    await expect(page.getByText(mail)).toBeVisible();
    await expect(page.getByText(/shown only once/)).toBeVisible();
    await expect(page.locator('li').filter({ hasText: e.full_name })).toHaveCount(0);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText(temp)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(temp)).toHaveCount(0);
  });

  test('CHF-13 an email already in use is refused', async ({ page }) => {
    const a = await employee('thangalla', `Dup A ${Date.now() % 100000}`);
    const b = await employee('thangalla', `Dup B ${Date.now() % 100000}`);
    const mail = email('dup');
    await createChiefInUi(page, a.full_name, mail);
    await page.getByPlaceholder('Enter Employee ID or Name...').fill(b.full_name);
    await page.locator('li').filter({ hasText: b.full_name }).click();
    await page.getByPlaceholder('chief@example.com').fill(mail);
    await page.getByRole('button', { name: 'Create Chief Profile' }).click();
    await expect(page.getByText('A user with this email already exists')).toBeVisible();
  });
});

test.describe('first login with a temporary password', () => {
  test.use({ user: null });

  test('PWD-10 forced to change it; other pages bounce back; rules are checked; then the chief gets in', async ({ page }) => {
    const e = await employee('thangalla', `First Login ${Date.now() % 100000}`);
    const mail = email('first');
    const temp = (await call(SUP.thangalla, 'POST', '/users/chief', { employee_id: e.employee_id, email: mail })).data.temporary_password;

    await page.goto('/login');
    await page.getByLabel('Username').fill(mail);
    await page.getByLabel('Password').fill(temp);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByText('You signed in with a temporary password. Choose your own to continue.')).toBeVisible();
    await page.goto('/workshop-queue');
    await expect(page).toHaveURL(/\/change-password$/);

    const submit = page.getByRole('button', { name: 'Change Password' });
    await pwd(page, 'Temporary Password').fill(temp);
    await pwd(page, 'New Password').fill('NewChief123');
    await pwd(page, 'Re-enter Password').fill('Different123');
    await submit.click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    for (const weak of ['short1A', 'alllowercase1', 'NoDigitsHere']) {
      await pwd(page, 'New Password').fill(weak);
      await pwd(page, 'Re-enter Password').fill(weak);
      await submit.click();
      await expect(page.locator('.bg-red-50')).toBeVisible();
    }
    await pwd(page, 'Temporary Password').fill('Wrong1234');
    await pwd(page, 'New Password').fill('NewChief123');
    await pwd(page, 'Re-enter Password').fill('NewChief123');
    await submit.click();
    await expect(page.getByText('Current password is incorrect')).toBeVisible();
    await pwd(page, 'Temporary Password').fill(temp);
    await submit.click();
    await expect(page).not.toHaveURL(/change-password/);
    await expect(page.locator('aside')).toContainText('CHIEF');
  });

  test('PWD-11 "Sign out" on the change page returns to the login', async ({ page }) => {
    const e = await employee('thangalla', `Sign Out ${Date.now() % 100000}`);
    const mail = email('signout');
    const temp = (await call(SUP.thangalla, 'POST', '/users/chief', { employee_id: e.employee_id, email: mail })).data.temporary_password;
    await page.goto('/login');
    await page.getByLabel('Username').fill(mail);
    await page.getByLabel('Password').fill(temp);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('PWD-12 an expired temporary password cannot sign in', async ({ page }) => {
    const e = await employee('thangalla', `Expired ${Date.now() % 100000}`);
    const mail = email('expired');
    const temp = (await call(SUP.thangalla, 'POST', '/users/chief', { employee_id: e.employee_id, email: mail })).data.temporary_password;
    await sql(`UPDATE "user" SET temp_password_expires_at = now() - interval '1 hour' WHERE username = $1`, [mail]);
    await page.goto('/login');
    await page.getByLabel('Username').fill(mail);
    await page.getByLabel('Password').fill(temp);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(/temporary password has expired/)).toBeVisible();
  });
});

test.describe('voluntary change from the user area (G4)', () => {
  test.use({ user: null });

  for (const role of ['SUPERVISOR'] as const) {
    test(`PWD-20 a ${role.toLowerCase()} changes their password; the old one stops working`, async ({ page }) => {
      const username = await freshUser(role);
      await signIn(page, username);
      await page.goto('/gate-pass');
      await page.getByRole('link', { name: 'Change password' }).click();
      await expect(page.getByText('You signed in with a temporary password')).toHaveCount(0);
      await pwd(page, 'Current Password').fill('Dev@1234');
      await pwd(page, 'New Password').fill('Changed123');
      await pwd(page, 'Re-enter Password').fill('Changed123');
      await page.getByRole('button', { name: 'Change Password' }).click();
      await expect(page).toHaveURL(/\/gate-pass$/);
      await expect(login(username, 'Dev@1234')).rejects.toThrow(/401/);
      await expect(login(username, 'Changed123')).resolves.toBeTruthy();
    });
  }

  test('PWD-21 super admin sees the same link and page', async ({ page }) => {
    await signIn(page, SA);
    await page.goto('/');
    await page.getByRole('link', { name: 'Change password' }).click();
    await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'Current Password' })).toBeVisible();
  });
});
