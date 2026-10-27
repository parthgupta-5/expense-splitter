import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep tests independent of the network: web fonts are answered locally with an empty response.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.errors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'no errors in the browser console').toEqual([]);
});

test('a guest can split a bill, settle up and keep the data after a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/groups\/[\w-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My first group' })).toBeVisible();

  await page.getByLabel('Add participant name').fill('Asha, Ben, Chitra');
  await page.getByLabel('Add participant name').press('Enter');
  await expect(page.locator('.people-list')).toContainText('Chitra');

  await page.getByLabel(/what was it for/i).fill('Dinner');
  await page.getByLabel(/who paid/i).click();
  await page.getByTitle('Asha', { exact: true }).last().click();
  await page.getByLabel(/total amount/i).fill('900');
  await page.getByRole('button', { name: /add expense/i }).click();
  await expect(page.getByRole('cell', { name: /Dinner/ })).toBeVisible();

  await page.getByRole('tab', { name: /balances/i }).click();
  const settle = page.locator('.settlement-box');
  await expect(settle).toContainText('Ben');
  await expect(settle).toContainText('Chitra');
  await expect(settle.getByText('₹300.00')).toHaveCount(2);

  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('cell', { name: /Dinner/ })).toBeVisible();
});

test('groups have their own currency and every page has a working URL', async ({ page }) => {
  await page.goto('/groups');
  await expect(page.getByRole('heading', { level: 1, name: 'Your groups' })).toBeVisible();
  await page.getByRole('button', { name: 'New group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a group' });
  await dialog.getByLabel('Group name').fill('New York trip');
  await dialog.getByLabel('Currency').click();
  await page.getByTitle('US Dollar (USD)').click();
  await dialog.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New York trip' })).toBeVisible();
  await expect(page.locator('.page-intro-extra')).toContainText('USD');

  for (const [path, heading] of [['/history', 'Activity history'], ['/people', 'Saved people'], ['/settings', 'Settings'], ['/profile', 'Your account']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  await page.goto('/this/does/not/exist');
  await expect(page.getByText('Page not found')).toBeVisible();
});

test('money fields take at most two decimals, use a decimal keypad and have no stepper', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Add participant name').fill('Asha, Ben');
  await page.getByLabel('Add participant name').press('Enter');

  const method = page.locator('.ant-form-item').filter({ has: page.locator('#split-method') });
  await expect(method).toContainText('Equal');
  await expect(method).toContainText('default');
  await expect(method.locator('label')).toHaveClass(/ant-form-item-required/);

  const amount = page.getByLabel(/total amount/i);
  await expect(amount).toHaveAttribute('inputmode', 'decimal');
  await expect(page.getByLabel('Payment amount')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await amount.fill('10.5');
  await amount.press('ArrowUp');
  await expect(amount).toHaveValue('10.5');

  await page.getByLabel(/what was it for/i).fill('Taxi');
  await page.getByLabel(/who paid/i).click();
  await page.getByTitle('Asha', { exact: true }).last().click();
  await amount.fill('10.555');
  await expect(page.getByText('Use at most 2 decimal places')).toBeVisible();
  await page.getByRole('button', { name: /add expense/i }).click();
  await expect(page.getByRole('cell', { name: /Taxi/ })).toHaveCount(0);

  await amount.fill('10.55');
  await page.getByRole('button', { name: /add expense/i }).click();
  await expect(page.getByRole('cell', { name: /Taxi/ })).toBeVisible();
  await page.getByRole('tab', { name: /balances/i }).click();
  await expect(page.locator('.settlement-box')).toContainText('₹5.27');

  // CSV amounts stay plain numbers, as before the switch to cents, so spreadsheets can add them up.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toMatch(/"Taxi","Asha",10\.55,"Asha: ₹5\.28; Ben: ₹5\.27"/);
  expect(csv).toMatch(/^"Ben","pays","Asha",5\.27$/m);
});

test('guest data saved by the previous version opens with the same amounts and its By shares split', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('expenseSplitterStateV3') || localStorage.getItem('expenseSplitterStateV2')) return;
    localStorage.setItem('expenseSplitterStateV2', JSON.stringify({
      groups: [{
        id: 'legacy-trip', name: 'Old trip', currencyCode: 'INR', people: ['Asha', 'Ben'],
        expenses: [{
          id: 'e1', description: 'Hotel', amount: 100.5, payer: 'Asha', category: 'Stay', splitType: 'shares',
          splitDetails: { Asha: 67, Ben: 33.5 }, participants: ['Asha', 'Ben'], splitValues: { Asha: 2, Ben: 1 },
          createdAt: '2026-10-01T10:00:00.000Z',
        }],
        payments: [{ id: 'p1', payer: 'Ben', payee: 'Asha', amount: 10.25, createdAt: '2026-10-02T10:00:00.000Z' }],
        savedSplits: [],
      }],
    }));
  });
  await page.goto('/groups/legacy-trip');
  await expect(page.getByRole('heading', { level: 1, name: 'Old trip' })).toBeVisible();
  await expect(page.locator('.activity-card')).toContainText('₹100.50');
  await page.getByRole('tab', { name: /balances/i }).click();
  await expect(page.locator('.settlement-box')).toContainText('₹23.25');

  await page.getByRole('tab', { name: /expenses/i }).click();
  await page.getByRole('button', { name: 'Edit expense' }).click();
  await expect(page.getByText('Set shares for each person')).toBeVisible();
  await expect(page.getByLabel(/total amount/i)).toHaveValue('100.50');
  await expect(page.locator('.split-editor').getByLabel('Asha')).toHaveValue(/^2(\.0+)?$/);

  await page.reload();
  await expect(page.locator('.activity-card')).toContainText('₹100.50');
  expect(await page.evaluate(() => localStorage.getItem('expenseSplitterStateV2'))).not.toBeNull();
});

test('the layout fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
