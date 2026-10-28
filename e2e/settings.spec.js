import { expect, test } from '@playwright/test';

// Guest mode (no Supabase), on desktop and a phone: the Settings layout (section menu, divider-separated sections),
// keyboard use, the theme control, no sideways scrolling and no console errors.
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

const noSidewaysScroll = async (page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
};

test('Settings has a section menu that moves to Account, Preferences and Data, and fits the screen', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(menu.getByRole('link')).toHaveText(['Account', 'Preferences', 'Data']);
  await expect(menu.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'true');
  await noSidewaysScroll(page);

  // The menu works from the keyboard and moves focus to the chosen section's heading.
  await menu.getByRole('link', { name: 'Data' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Data' })).toBeFocused();
  await expect(menu.getByRole('link', { name: 'Data' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: /download backup/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /import backup/i })).toBeVisible();

  // Guests are offered an account; there is nothing to delete.
  await expect(page.locator('#account').getByRole('button', { name: 'Sign in or create account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delete account' })).toHaveCount(0);
  await noSidewaysScroll(page);
});

test('the theme is chosen in Preferences and kept after a reload', async ({ page }) => {
  await page.goto('/settings');
  const theme = page.locator('#preferences').getByRole('radiogroup', { name: 'Theme' });
  await theme.getByText('Dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#preferences').getByRole('radiogroup', { name: 'Theme' }).getByText('Light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
