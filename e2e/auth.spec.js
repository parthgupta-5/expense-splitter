import { expect, test } from '@playwright/test';

// The production build without Supabase (as in guest.spec.js): no account is used and nothing leaves the browser.
// These check what a real browser does with auth redirects: codes and tokens never stay in the address bar.

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

test('a sign-in code in the callback address is removed at once', async ({ page }) => {
  await page.goto('/auth/callback?code=secret-code-123&sb_flow_id=flow-9');
  await expect(page.getByText('Accounts are not set up on this copy of the app.')).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/callback$/);
  expect(page.url()).not.toContain('secret-code-123');
});

test('tokens in the address-bar fragment are dropped without being used', async ({ page }) => {
  await page.goto('/#access_token=secret-token&refresh_token=secret-refresh&type=recovery');
  await expect(page.getByRole('heading', { level: 1, name: 'My first group' })).toBeVisible();
  expect(page.url()).not.toMatch(/secret|access_token/);
});

test('a cancelled Google sign-in sent to the home page is explained, and the address is cleaned', async ({ page }) => {
  await page.goto('/?error=access_denied&error_description=The+user+denied+the+request');
  await expect(page.getByText('Google sign-in was cancelled. Nothing was changed.')).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await expect(page).toHaveURL(/\/groups\/[\w-]+$/);
});

test('sign-up offers Google and explains the password rules as you type', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
  const rules = dialog.getByRole('list', { name: 'Password requirements' });
  await expect(rules.locator('li.is-met')).toHaveCount(0);
  await dialog.getByLabel(/^password\*?$/i).fill('Correct-Horse-9');
  await expect(rules.locator('li.is-met')).toHaveCount(5);
  await dialog.getByRole('button', { name: /Continue with Google/ }).click();
  await expect(page.getByText(/Accounts are not set up on this copy of the app/)).toBeVisible();
});
