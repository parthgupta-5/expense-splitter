import { expect, test } from '@playwright/test';

// Guest mode (no Supabase): sharing needs an account, so a guest can neither send nor receive invitations, and keeps
// full control of the groups on their device.

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

test('guests cannot send or receive invitations, and still manage their own groups', async ({ page }) => {
  await page.goto('/groups');
  await expect(page.getByRole('heading', { level: 1, name: 'Your groups' })).toBeVisible();
  await expect(page.getByText(/Invitations for you/)).toHaveCount(0);

  await page.goto('/groups/my-first-group');
  await page.getByRole('button', { name: /share/i }).click();
  const share = page.getByRole('dialog');
  await expect(share.getByText(/Sign in to share this group/)).toBeVisible();
  await expect(share.getByLabel(/their username/i)).toHaveCount(0);
  await expect(share.getByPlaceholder(/example\.com/)).toHaveCount(0);
  await share.getByRole('button', { name: /close/i }).click();

  await page.getByRole('button', { name: /group settings/i }).click();
  const settings = page.getByRole('dialog');
  await expect(settings.getByLabel(/group name/i)).toBeVisible();
  await expect(settings.getByRole('button', { name: /save changes/i })).toBeVisible();
});
