import { SUP } from '../support/api';
import { expect, test } from '../support/fixtures';

/** AUTH: sign in, sign out, landing pages (Docs/testing/role-capabilities.md). */
test.describe('signed out', () => {
  test.use({ user: null });

  test('AUTH-10 any page sends a signed-out visitor to /login', async ({ page }) => {
    await page.goto('/workshop-queue');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });

  test('AUTH-11 empty form shows required messages', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Username required')).toBeVisible();
    await expect(page.getByText('Password required')).toBeVisible();
  });

  test('AUTH-12 wrong password shows the server message and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(SUP.thangalla);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(/Invalid username or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-13 a supervisor signs in and lands on Gate Pass', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(SUP.thangalla);
    await page.getByLabel('Password').fill('Dev@1234');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/gate-pass$/);
    await expect(page.locator('aside')).toContainText('SUPERVISOR');
    await expect(page.locator('aside')).toContainText('Thangalla · Roofing + Workshop');
  });

  test('AUTH-14 super admin signs in and lands on the dashboard placeholder', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('superadmin');
    await page.getByLabel('Password').fill('Super@123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Dashboard — coming soon')).toBeVisible();
    await expect(page.locator('aside')).toContainText('Head office · all branches');
  });
});

test.describe('signed in', () => {
  test('AUTH-15 logout returns to /login and protected pages stay closed', async ({ page }) => {
    await page.goto('/gate-pass');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/gate-pass');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-16 a signed-in user visiting /login is sent home', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/gate-pass$/);
  });
});
