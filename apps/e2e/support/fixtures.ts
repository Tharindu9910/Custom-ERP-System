import { test as base, expect, type Page } from '@playwright/test';
import { BRANCH, type BranchKey, login } from './api';

/**
 * `test.use({ user: 'supervisor_thangalla' })` signs the page in through the API and seeds
 * the web app's persisted auth (localStorage `erp-auth`) before the first page loads.
 * Super Admin can preselect a branch with `branch`. `user: null` stays signed out.
 */
type Options = { user: string | null; branch: BranchKey | null };

export async function signIn(page: Page, user: string, branch: BranchKey | null = null): Promise<void> {
  const { accessToken, refreshToken, user: me } = await login(user);
  const auth = JSON.stringify({ state: { user: me, accessToken, refreshToken, activeBranchId: me.branch_id ?? (branch ? BRANCH[branch] : null) }, version: 0 });
  // Only seeds an empty store, so reloads keep what the app saved (branch picker, logout)
  await page.addInitScript((value) => {
    if (!window.localStorage.getItem('erp-auth')) window.localStorage.setItem('erp-auth', value);
  }, auth);
}

export const test = base.extend<Options>({
  user: ['supervisor_thangalla', { option: true }],
  branch: [null, { option: true }],
  page: async ({ page, user, branch }, use) => {
    if (user) await signIn(page, user, branch);
    await use(page);
  },
});

export { expect };
