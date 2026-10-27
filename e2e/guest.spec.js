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
  await expect(page.getByText(/Saved on this device/)).toBeVisible();

  await page.getByLabel('Add participant name').fill('Asha, Ben, Chitra');
  await page.getByLabel('Add participant name').press('Enter');
  await expect(page.getByRole('button', { name: /manage people, 3 people/i })).toBeVisible();

  await page.getByRole('button', { name: 'Add expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add an expense' });
  await sheet.getByLabel('Total amount').fill('900');
  await sheet.getByLabel('What was it for?').fill('Dinner');
  await sheet.getByRole('radio', { name: /Asha/ }).click();
  await expect(sheet.getByText('₹300.00 each')).toBeVisible();
  await sheet.getByRole('button', { name: /add expense/i }).click();
  await expect(sheet).toBeHidden();

  const expenses = page.getByRole('list', { name: 'Expenses' });
  await expect(expenses.getByText('Dinner')).toBeVisible();
  const balances = page.getByRole('list', { name: 'Balances' });
  await expect(balances).toContainText('is owed');
  await expect(balances).toContainText('+₹600.00');
  await expect(balances).toContainText('−₹300.00');

  await page.getByRole('button', { name: /^settle up/i }).click();
  const settle = page.getByRole('dialog', { name: 'Settle up' });
  await expect(settle).toContainText('Ben');
  await expect(settle).toContainText('Chitra');
  await expect(settle.getByText('₹300.00')).toHaveCount(2);
  await settle.getByRole('button', { name: /Mark paid: Ben pays Asha/ }).click();
  const payment = page.getByRole('dialog', { name: 'Record a payment' });
  await expect(payment.getByLabel('From')).toHaveValue('Ben');
  await payment.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('dialog', { name: 'Settle up' }).getByText(/Chitra/).first()).toBeVisible();
  await page.getByRole('dialog', { name: 'Settle up' }).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('tab', { name: /payments/i }).click();
  await expect(page.getByRole('list', { name: 'Payments' })).toContainText('Ben');

  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('list', { name: 'Expenses' }).getByText('Dinner')).toBeVisible();
});

test('the add-expense sheet explains what is missing and keeps what was typed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Add participant name').fill('Asha, Ben');
  await page.getByLabel('Add participant name').press('Enter');
  await page.getByRole('button', { name: 'Add expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add an expense' });
  await sheet.getByLabel('What was it for?').fill('Taxi');
  await sheet.getByRole('button', { name: /add expense/i }).click();
  await expect(sheet.getByText('Choose who paid')).toBeVisible();
  await expect(sheet.getByText('Enter the total')).toBeVisible();
  await expect(sheet.getByLabel('What was it for?')).toHaveValue('Taxi');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('the group page follows the device appearance', async ({ browser }) => {
  for (const scheme of ['dark', 'light']) {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'My first group' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    await context.close();
  }
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
  await expect(page.getByText('USD', { exact: true })).toBeVisible();

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
