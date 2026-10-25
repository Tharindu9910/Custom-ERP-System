import { ROLLING_LINE, SUP, call } from '../support/api';
import { expect, test } from '../support/fixtures';

/** PL: Settings → Price List — one list for every branch (Docs/decisions/0004). */

const MGR = 'manager_thangalla';
const GI_PIPE = `Pipe Bend · GI Pipe · ${ROLLING_LINE.size}`;

async function giPipeRate() {
  const r = await call(MGR, 'GET', '/price-list/rates?line_type=ROLLING');
  return r.data.find((x: any) => x.sub_type === 'PIPE_BEND' && x.work_type === 'GI Pipe' && x.thickness_or_size === ROLLING_LINE.size);
}

test.describe('manager', () => {
  test.use({ user: MGR });

  test('PL-01 edits a work rate inline; a supervisor at another branch is quoted the new price', async ({ page }) => {
    const rate = await giPipeRate();
    const next = rate.rate + 5000;
    try {
      await page.goto('/settings/price-list');
      await page.getByRole('button', { name: 'Rolling', exact: true }).click();
      await page.getByTitle(`Edit rate for ${GI_PIPE}`).click();
      const input = page.getByLabel(`rate for ${GI_PIPE}`);
      await input.fill(String(next / 100));
      await input.press('Enter');
      await expect(page.getByTitle(`Edit rate for ${GI_PIPE}`)).toContainText(`Rs ${(next / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`);

      const q = await call(SUP.veyangoda, 'POST', '/job-cards/quote', { lines: [ROLLING_LINE] });
      expect(q.data.subtotal).toBe(next * ROLLING_LINE.quantity);
    } finally {
      await call(MGR, 'PATCH', `/price-list/rates/${rate.rate_id}`, { rate: rate.rate });
    }
  });

  test('PL-02 shows both tabs and the Add Rate action', async ({ page }) => {
    await page.goto('/settings/price-list');
    await expect(page.getByRole('button', { name: 'Add Rate' })).toBeVisible();
    await page.getByRole('button', { name: 'Item prices' }).click();
    await expect(page.getByPlaceholder('Search by name, SKU or category')).toBeVisible();
  });
});

test.describe('auditor', () => {
  test.use({ user: 'auditor1' });

  test('PL-03 sees the price list read-only', async ({ page }) => {
    await page.goto('/settings/price-list');
    await page.getByRole('button', { name: 'Rolling', exact: true }).click();
    await expect(page.getByText(GI_PIPE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Rate' })).toHaveCount(0);
    await expect(page.getByTitle(`Edit rate for ${GI_PIPE}`)).toHaveCount(0);
  });
});
