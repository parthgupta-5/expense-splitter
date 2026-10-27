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

test('the layout fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
