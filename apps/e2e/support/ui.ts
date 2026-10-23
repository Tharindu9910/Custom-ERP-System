import { expect, type Locator, type Page } from '@playwright/test';

/** Small UI helpers shared by the specs. Selectors use roles, labels and visible text. */

export const sidebar = (page: Page) => page.locator('aside nav');

/** A sidebar link by its label (the label may be followed by a "Not built yet" mark). */
export const navLink = (page: Page, label: string) => sidebar(page).getByRole('link', { name: new RegExp(`^${escape(label)}( |$)`) });

export async function menuLabels(page: Page): Promise<string[]> {
  await expect(sidebar(page).getByRole('link').first()).toBeVisible();
  // Wait for branch-gated items to settle (they appear once the branch context loads)
  await page.waitForLoadState('networkidle');
  return (await sidebar(page).locator('a, [aria-disabled="true"]').allInnerTexts()).map((t) => t.replace(/Coming soon/i, '').trim()).filter(Boolean);
}

export const scopeSelect = (page: Page) => page.locator('#scope-branch');

/** Super Admin's top-bar branch picker; matches "★ Naiwala · Main" too. */
export async function pickBranch(page: Page, name: string | 'All branches'): Promise<void> {
  const select = scopeSelect(page);
  const option = select.locator('option').filter({ hasText: name });
  await select.selectOption({ value: (await option.first().getAttribute('value')) ?? '' });
}

/** A table row containing a text. */
export const row = (scope: Page | Locator, text: string | RegExp) => scope.locator('tr').filter({ hasText: text });

export const dialog = (page: Page) => page.getByRole('dialog');

export function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Expect a button with this name to be absent (not rendered or hidden). */
export async function expectNoButton(scope: Page | Locator, name: string | RegExp): Promise<void> {
  await expect(scope.getByRole('button', { name })).toHaveCount(0);
}

/**
 * The input/select/textarea under a visible label. Most forms use `<label class="field-label">`
 * beside the control without htmlFor, so getByLabel can't find them.
 */
export function field(scope: Page | Locator, label: string | RegExp): Locator {
  const text = typeof label === 'string' ? new RegExp(`^\\s*${escape(label)}`, 'i') : label;
  return scope.locator('label').filter({ hasText: text }).first().locator('xpath=..').locator('input, select, textarea').first();
}

/** Pick an option in a SearchableSelect (opened by its button showing the placeholder or current value). */
export async function choose(scope: Page | Locator, opener: string | RegExp, option?: string | RegExp): Promise<void> {
  await scope.getByRole('button', { name: opener }).first().click();
  const items = scope.locator('ul li[class*="cursor-pointer"]');
  await (option ? items.filter({ hasText: option }).first() : items.first()).click();
}
