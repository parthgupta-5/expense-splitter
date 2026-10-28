import { expect, test } from '@playwright/test';

// Guest mode (no Supabase): the activity bell is for signed-in users only, so guests never see it, and their own
// history stays on the History page, read from this device.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.errors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'no errors in the browser console').toEqual([]);
});

test('guests see no activity bell, and the top bar still fits the screen', async ({ page }) => {
  await page.goto('/groups');
  await expect(page.getByRole('heading', { level: 1, name: 'Your groups' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
  await expect(page.locator('.activity-bell')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.goto('/history');
  await expect(page.getByRole('heading', { level: 1, name: 'Activity history' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
});
