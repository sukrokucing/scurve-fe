import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || 'jimmy@dwp.co.id';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

test.describe('Auth smoke', () => {
  test('sign out and protected routes', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Sign out
    await page.getByRole('button', { name: 'Sign out' }).click();
    // Some deployments redirect to /login; others may return an unauthorized payload when accessing protected endpoints.
    // Assert at least that the user is no longer signed-in (Sign in button visible on /login) OR that accessing a protected page shows an unauthorized message
    // Try redirect expectation first with small timeout
    try {
      await expect(page).toHaveURL(/\/login/, { timeout: 2000 });
    } catch (e) {
      // fallback: navigate to /projects and expect an unauthorized response/body
      await page.goto('/projects');
      await expect(page.locator('body')).toContainText(/unauthorized|Authorization header missing|login/i);
    }
  });
});
