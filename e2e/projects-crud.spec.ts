import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || 'jimmy@dwp.co.id';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

test.describe.serial('Projects CRUD', () => {
  const baseName = `e2e-project-${Date.now()}`;
  const updatedSuffix = '-updated';
  let projectName = baseName;
  let updatedName = baseName + updatedSuffix;

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');
  });

  test('create project', async ({ page }) => {
    await page.goto('/projects');
    // Expect the New project control to be visible; if the backend is unavailable this will fail the test.
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'New project' }).click();

    // Find a name input by common selectors
    let nameLocator = null as any;
    if (await page.getByLabel('Name').count()) nameLocator = page.getByLabel('Name');
    else if (await page.getByPlaceholder('Project name').count()) nameLocator = page.getByPlaceholder('Project name');
    else nameLocator = page.locator('input').first();

    await nameLocator.fill(projectName);

    // Try clicking Save/Create buttons in common variants
    if (await page.getByRole('button', { name: 'Save' }).count()) {
      await page.getByRole('button', { name: 'Save' }).click();
    } else if (await page.getByRole('button', { name: 'Create' }).count()) {
      await page.getByRole('button', { name: 'Create' }).click();
    } else {
      // fallback: press Enter
      await nameLocator.press('Enter');
    }

    // Assert the new project appears in the projects table
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 5000 });
  });

  test('edit project', async ({ page }) => {
    // assume previous test created the project; search for the row and click its Edit button
    await page.goto('/projects');
    const row = page.locator('tr').filter({ has: page.getByText(projectName) }).first();
    // Require the project row to be visible; if the backend didn't create it, the test will fail.
    await expect(row).toBeVisible({ timeout: 5000 });

    const editBtn = row.getByRole('button', { name: 'Edit' });
    await editBtn.click();

    // find name input inside edit form
    let nameLocator = null as any;
    if (await page.getByLabel('Name').count()) nameLocator = page.getByLabel('Name');
    else nameLocator = page.locator('input').first();

    await nameLocator.fill(updatedName);
    if (await page.getByRole('button', { name: 'Save' }).count()) {
      await page.getByRole('button', { name: 'Save' }).click();
    } else {
      await nameLocator.press('Enter');
    }

    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5000 });
    // update stored name for delete test
    projectName = updatedName;
  });

  test('delete project', async ({ page }) => {
    await page.goto('/projects');
    const row = page.locator('tr').filter({ has: page.getByText(projectName) }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    const deleteBtn = row.getByRole('button', { name: 'Delete' });
    await deleteBtn.click();

    // Confirm modal: look for common confirm buttons
    if (await page.getByRole('button', { name: 'Confirm' }).count()) {
      await page.getByRole('button', { name: 'Confirm' }).click();
    } else if (await page.getByRole('button', { name: 'Delete' }).count()) {
      // modal Delete
      await page.getByRole('button', { name: 'Delete' }).click();
    } else if (await page.getByRole('button', { name: 'Yes' }).count()) {
      await page.getByRole('button', { name: 'Yes' }).click();
    }

    // Assert the project no longer appears
    await expect(page.getByText(projectName)).not.toBeVisible({ timeout: 5000 });
  });

  // Ensure cleanup via API: attempt to remove any project created by this spec even if tests skipped/failed
  // Uses the Playwright `request` fixture to call backend endpoints directly.
  test.afterAll(async ({ request }) => {
  const base = process.env.BASE_URL || 'http://fe:3001';
  const email = process.env.TEST_EMAIL || TEST_EMAIL;
  const password = process.env.TEST_PASSWORD || TEST_PASSWORD;
    try {
      // Login to obtain token
      const loginRes = await request.post(`${base}/auth/login`, { data: { email, password } });
      if (loginRes.ok()) {
        const body = await loginRes.json();
        const token = body?.token;
        if (!token) return;

        // List projects
        const projectsRes = await request.get(`${base}/projects`, { headers: { Authorization: `Bearer ${token}` } });
        if (!projectsRes.ok()) return;
        const projects = await projectsRes.json();
        if (!Array.isArray(projects)) return;

        for (const p of projects) {
          if (p?.name && typeof p.name === 'string' && p.name.startsWith(baseName)) {
            const id = p.id;
            if (!id) continue;
            await request.delete(`${base}/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          }
        }
      }
    } catch (err) {
      try {
        console.warn('projects-crud.spec.ts API cleanup error:', String(err));
      } catch {}
    }
  });
});
