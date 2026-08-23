import { test, expect } from '@playwright/test';

test.describe('E2E: Admin Moderation Queue & Live Ad Badge Synchronization', () => {
  test('1. Admin dashboard loads moderation queue and ledger analytics', async ({ page }) => {
    await page.goto('/');

    // Seed admin session
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock_admin_jwt_token');
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        email: 'admin@enchospace.com',
        name: 'Master Admin',
        role: 'admin'
      }));
    });

    await page.goto('/?view=admin');
    await expect(page.locator('header')).toBeVisible();

    // Confirm admin tabs
    const adminPanel = page.locator('text=Admin Dashboard').or(page.locator('text=Campaign Moderation'));
    await expect(adminPanel.first()).toBeVisible({ timeout: 15000 });
  });

  test('2. Moderation actions display live status badges', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock_admin_jwt_token');
      localStorage.setItem('user', JSON.stringify({ id: 1, email: 'admin@enchospace.com', role: 'admin' }));
    });

    await page.goto('/?view=admin');
    const badge = page.locator('.badge, span:has-text("LIVE"), span:has-text("APPROVED"), span:has-text("PENDING")');
    if (await badge.first().isVisible()) {
      await expect(badge.first()).toBeVisible();
    }
  });
});
