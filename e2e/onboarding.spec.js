import { expect, test } from '@playwright/test';

// Guest mode (no Supabase), on desktop and a phone: the first-time welcome, the "Add people" dialog, empty states and
// the public policy pages, with keyboard use, no sideways scrolling and no console errors.

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

test('a first visit is welcomed once, with guest-appropriate steps, and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  const welcome = page.locator('.welcome-panel');
  await expect(welcome.getByRole('heading', { name: 'Welcome to Expense Splitter' })).toBeVisible();
  await expect(welcome).toContainText('saved on this device only');
  await expect(welcome).not.toContainText('@username');
  await noSidewaysScroll(page);
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'My first group' })).toBeVisible();
  await expect(page.locator('.welcome-panel')).toHaveCount(0);
});

test('"Add people" offers exactly two choices, works with the keyboard and fits a phone screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No one here yet. Add the people who share costs')).toBeVisible();
  const add = page.getByRole('button', { name: /add people/i });
  await add.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Add people' });
  await expect(dialog.locator('.ant-segmented-item-label')).toHaveText(['Add by username', 'Add guest']);
  await expect(dialog.getByLabel('Guest name')).toBeFocused();
  await noSidewaysScroll(page);
  await page.keyboard.type('Asha');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Asha added as a guest')).toBeVisible();
  await page.keyboard.type('asha');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Not added, already in the list: asha')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.people-rows .person-row')).toHaveCount(1);
  await expect(page.getByText(/No expenses yet\. Record the first one/)).toBeVisible();
  await page.getByRole('button', { name: 'Add an expense' }).click();
  await expect(page.getByLabel(/what was it for/i)).toBeFocused();
  await noSidewaysScroll(page);
});

test('the policies are public, linked from every page and from Settings, and readable on a phone', async ({ page }) => {
  await page.goto('/groups');
  const footer = page.getByRole('navigation', { name: 'Policies' });
  await footer.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByText('A plain-language policy for a project app, not legal advice.')).toBeVisible();
  await expect(page.locator('#deletion')).toContainText('Former member');
  await noSidewaysScroll(page);

  await page.goto('/settings');
  await page.locator('.setting-card', { hasText: 'Privacy and terms' }).getByRole('link', { name: 'Terms of Service' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await expect(page.locator('#service')).toContainText('does not move money');
  await noSidewaysScroll(page);

  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
});

test('empty history explains what will appear and leads back to the groups', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByText(/No history yet\. Expenses, payments/)).toBeVisible();
  await page.getByRole('button', { name: 'Go to your groups' }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await noSidewaysScroll(page);
});
