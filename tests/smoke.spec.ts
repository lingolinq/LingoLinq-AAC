import { test, expect } from '@playwright/test';

/**
 * Public-page smoke tests for LingoLinq.
 * Safe against staging/prod: no auth mutation, no account creation.
 */

test.describe('public smoke', () => {
  test('home page loads with LingoLinq branding', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/LingoLinq/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page shows username and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/LingoLinq/i);

    const username = page.locator('#identification');
    const password = page.locator('#password');
    await expect(username).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('about page renders hero heading', async ({ page }) => {
    await page.goto('/about');
    await expect(
      page.getByRole('heading', { name: /every voice should be heard/i })
    ).toBeVisible();
  });

  test('pricing page shows Communicator plan', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /pricing/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /communicator/i })).toBeVisible();
  });

  test('contact page is reachable', async ({ page }) => {
    await page.goto('/contact');
    await expect(page).toHaveTitle(/LingoLinq/i);
    await expect(page.getByRole('main')).toBeVisible();
  });
});
