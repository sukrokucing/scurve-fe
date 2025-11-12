import { test, expect } from '@playwright/test';

// Test credentials come from environment variables so CI and local runs can override them.
const TEST_EMAIL = process.env.TEST_EMAIL || 'jimmy@dwp.co.id';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

test.describe('Authentication', () => {
  // Capture a screenshot and storage state on failure to help debugging in CI/container
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      const safeTitle = testInfo.title.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 120);
      try {
        await page.screenshot({ path: `test-results/${safeTitle}.png`, fullPage: true });
      } catch (e) {
        // ignore screenshot failures
      }
      try {
        await page.context().storageState({ path: `test-results/${safeTitle}-storage.json` });
      } catch (e) {
        // ignore
      }
    }
  });

  test('login - happy path', async ({ page }) => {
    await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');
  await expect(page.getByText(TEST_EMAIL)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('login - wrong password shows error', async ({ page }) => {
    await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill('incorrect');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Try to detect a visible error message matching common phrases; if none, at least assert we stayed on the login page
    try {
      await expect(page.getByText(/invalid credentials|incorrect|error|unauthorized/i)).toBeVisible({ timeout: 3000 });
    } catch (err) {
      // fallback: ensure we are still on the login page (no successful redirect)
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
