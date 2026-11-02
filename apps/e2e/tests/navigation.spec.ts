import { CASHIER, SA, SUP, jobCard, roofingOrder, setFeature } from '../support/api';
import { expect, test } from '../support/fixtures';
import { menuLabels, navLink, pickBranch, scopeSelect, sidebar } from '../support/ui';

/** NAV: what each role sees in the menu, and what happens on a URL they may not use. */

const ROOFING = ['Create Order', 'Order Queue'];
const WORKSHOP = ['Create Job Card', 'Workshop Queue'];
const COMMON = ['Gate Pass', 'Stock Levels', 'Restock', 'Stock Requests', 'Create Chief Profile', 'Hardware Store'];
const NEVER_FOR_SUPERVISOR = ['Dashboard', 'Cashier Queue', 'Hardware Queue', 'Customers', 'Finance', 'Audit Log', 'Branch Config', 'Price List', 'Users', 'Workers', 'Role Permissions'];

for (const [branch, has, hasNot] of [
  ['thangalla', [...ROOFING, ...WORKSHOP], []],
  ['naiwala', ROOFING, WORKSHOP],
  ['veyangoda', WORKSHOP, ROOFING],
] as const) {
  test.describe(`supervisor at ${branch}`, () => {
    test.use({ user: SUP[branch] });

    test(`NAV-01 ${branch}: menu shows the screens the branch runs, and nothing else`, async ({ page }) => {
      await page.goto('/gate-pass');
      const labels = await menuLabels(page);
      for (const l of [...COMMON, ...has]) expect(labels).toContain(l);
      for (const l of [...hasNot, ...NEVER_FOR_SUPERVISOR]) expect(labels).not.toContain(l);
      await expect(page.locator('aside')).not.toContainText('Super Admin');
    });
  });
}

test.describe('supervisor URL guards', () => {
  for (const url of ['/cashier-queue', '/hardware-queue', '/customers', '/workers', '/settings/branch-config', '/settings/price-list', '/settings/users', '/settings/workers', '/settings/permissions']) {
    test(`NAV-02 ${url} redirects a supervisor away`, async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveURL(/\/gate-pass$/);
    });
  }

  test('NAV-03 a supervisor opens an order edit page, but a paid order in the Order Queue is locked to the cashier', async ({ page }) => {
    // Unpaid orders at the cashier are the supervisor's to edit (from Create Order → Order History)
    const o = await roofingOrder();
    await page.goto(`/orders/${o.order_id}/edit`);
    await expect(page.getByText('A payment has been taken on this order, so only the cashier can edit it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Order' })).toBeDisabled();
  });

  test('NAV-04 the root URL goes to the first screen (Gate Pass)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/gate-pass$/);
  });

  test('NAV-05 the Change password link is in the user area (G4)', async ({ page }) => {
    await page.goto('/gate-pass');
    await page.getByRole('link', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('button', { name: 'Change Password' })).toBeVisible();
  });
});

test.describe('wrong-section screens', () => {
  test.use({ user: SUP.veyangoda });
  test('NAV-06 a workshop-only branch is told the roofing screens are not used there (G7)', async ({ page }) => {
    for (const [url, label] of [['/orders/new', 'Create Order'], ['/order-queue', 'Order Queue']]) {
      await page.goto(url);
      await expect(page.getByText(`${label} isn't used at Veyangoda`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Place Order' })).toHaveCount(0);
    }
  });
});

test.describe('super admin', () => {
  test.use({ user: SA });

  test('NAV-10 menu: branch screens to view, settings, and the Super Admin section', async ({ page }) => {
    await page.goto('/');
    const labels = await menuLabels(page);
    for (const l of ['Dashboard', 'Cashier Queue', 'Gate Pass', 'Order Queue', 'Workshop Queue', 'Stock Levels', 'Restock', 'Stock Requests', 'Customers', 'Finance', 'Audit Log', 'Branch Config', 'Price List', 'Users', 'Workers', 'Role Permissions']) {
      expect(labels).toContain(l);
    }
    // Create forms are branch work
    for (const l of ['Create Order', 'Create Job Card', 'Create Chief Profile']) expect(labels).not.toContain(l);
  });

  test('NAV-11 Finance and Audit Log are disabled "coming soon" entries, not links (G3)', async ({ page }) => {
    await page.goto('/');
    for (const l of ['Finance', 'Audit Log']) {
      await expect(navLink(page, l)).toHaveCount(0);
      await expect(sidebar(page).locator('[aria-disabled="true"]').filter({ hasText: l })).toBeVisible();
    }
  });

  test('NAV-12 global pages show the Global chip and no picker', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.getByText('Global · applies to all branches')).toBeVisible();
    await expect(scopeSelect(page)).toHaveCount(0);
  });

  test('NAV-13 branch pages ask for a branch, then show it View only', async ({ page }) => {
    await page.goto('/gate-pass');
    await expect(page.getByText('Choose a branch to view')).toBeVisible();
    await expect(page.getByText('View only')).toBeVisible();
    await pickBranch(page, 'Thangalla');
    await expect(page.getByText('Choose a branch to view')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gate Pass Queue' })).toBeVisible();
  });

  test('NAV-14 the picker lists only branches that run the page', async ({ page }) => {
    await page.goto('/order-queue');
    const options = await scopeSelect(page).locator('option').allInnerTexts();
    expect(options.join('|')).toContain('Naiwala');
    expect(options.join('|')).toContain('Thangalla');
    expect(options.join('|')).not.toContain('Veyangoda');
    await page.goto('/workshop-queue');
    const ws = (await scopeSelect(page).locator('option').allInnerTexts()).join('|');
    expect(ws).toContain('Veyangoda');
    expect(ws).not.toContain('Naiwala');
  });

  test('NAV-15 a picked branch that does not run the page says so', async ({ page }) => {
    await page.goto('/gate-pass');
    await pickBranch(page, 'Naiwala');
    await page.goto('/workshop-queue');
    await expect(page.getByText("Workshop Queue isn't used at Naiwala")).toBeVisible();
  });

  test('NAV-16 the picked branch survives a reload', async ({ page }) => {
    await page.goto('/gate-pass');
    await pickBranch(page, 'Veyangoda');
    await page.reload();
    await expect(scopeSelect(page).locator('option:checked')).toHaveText('Veyangoda');
  });

  test('NAV-17 network pages default to All branches', async ({ page }) => {
    await page.goto('/inventory');
    await expect(scopeSelect(page).locator('option:checked')).toHaveText('All branches');
  });

  for (const url of ['/orders/new', '/job-cards/new', '/chiefs/new']) {
    test(`NAV-18 ${url} is for branch staff`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByText('This page is for branch staff')).toBeVisible();
    });
  }
});

test.describe('feature switches (Branch Config → supervisor menu)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ user: SUP.thangalla });

  for (const [feature, label, url] of [
    ['gatePass', 'Gate Pass', '/gate-pass'],
    ['inventory', 'Stock Levels', '/inventory'],
    ['stockAlerts', 'Restock', '/stock-alerts'],
    ['stockRequest', 'Stock Requests', '/stock-requests'],
    ['chiefProfiles', 'Create Chief Profile', '/chiefs/new'],
    ['hardwareStore', 'Hardware Store', '/hardware-store'],
  ] as const) {
    test(`NAV-20 ${feature} off hides "${label}" and blocks its URL; on brings it back`, async ({ page }) => {
      try {
        await setFeature('thangalla', feature, false);
        await page.goto('/workshop-queue');
        await expect(navLink(page, 'Workshop Queue')).toBeVisible();
        await expect(navLink(page, label)).toHaveCount(0);
        await page.goto(url);
        await expect(page.getByText(`${label} isn't used at Thangalla`)).toBeVisible();
      } finally {
        await setFeature('thangalla', feature, true);
      }
      await page.goto('/workshop-queue');
      await expect(navLink(page, label)).toBeVisible();
    });
  }
});

for (const user of ['admin', 'auditor1']) {
  test.describe(`head office (${user})`, () => {
    test.use({ user });

    test(`NAV-21 ${user}: Workshop Queue and Stock Requests open from the menu instead of bouncing back`, async ({ page }) => {
      await page.goto('/inventory');
      const labels = await menuLabels(page);
      expect(labels).toContain('Workshop Queue');
      expect(labels).toContain('Stock Requests');
      for (const path of ['/workshop-queue', '/stock-requests']) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path}`));
      }
    });
  });
}

/** NAV-22/23: the menu item stays highlighted on its own tabs, open checkouts and edit forms. */
test.describe('active menu item (supervisor)', () => {
  test.use({ user: SUP.thangalla });

  test('NAV-22 tabs, query strings and edit forms keep the right item highlighted', async ({ page }) => {
    const card = await jobCard();
    for (const [url, label] of [
      ['/gate-pass?tab=queue', 'Gate Pass'],
      ['/stock-requests?tab=ours', 'Stock Requests'],
      ['/job-cards/new?tab=history', 'Create Job Card'],
      ['/workshop-queue?notice=Saved', 'Workshop Queue'],
      [`/job-cards/${card.order_id}/edit`, 'Workshop Queue'],
    ] as const) {
      await page.goto(url);
      await expect(navLink(page, label)).toHaveAttribute('aria-current', 'page');
      await expect(sidebar(page).locator('[aria-current="page"]')).toHaveCount(1);
    }
  });
});

test.describe('active menu item (cashier)', () => {
  test.use({ user: CASHIER.thangalla });

  test('NAV-23 Cashier Queue stays highlighted on the checkout, and its link goes back to the board', async ({ page }) => {
    const card = await jobCard();
    await page.goto(`/cashier-queue?checkout=${card.order_id}`);
    await expect(page.getByRole('heading', { name: 'Check Items' })).toBeVisible();
    await expect(navLink(page, 'Cashier Queue')).toHaveAttribute('aria-current', 'page');
    await navLink(page, 'Cashier Queue').click();
    await expect(page).toHaveURL(/\/cashier-queue$/);
    await expect(navLink(page, 'Cashier Queue')).toHaveAttribute('aria-current', 'page');
  });
});
