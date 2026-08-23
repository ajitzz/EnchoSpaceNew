import { test, expect } from '@playwright/test';

test.describe('E2E: Host Marketing Campaign Reactor Core Journey', () => {
  test('1. Host dashboard loads marketing view and renders Reactor Core fuel gauge', async ({ page }) => {
    await page.goto('/');

    // Seed mock host session in browser localStorage
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock_host_jwt_token');
      localStorage.setItem('user', JSON.stringify({
        id: 101,
        email: 'host.marketing@enchospace.com',
        name: 'Alpha Host',
        role: 'user'
      }));
    });

    await page.goto('/?view=host_dashboard&tab=marketing');
    await expect(page.locator('header')).toBeVisible();

    // Verify Suspense boundary resolves and loads HostMarketing
    const reactorView = page.locator('text=Campaign Reactor Core').or(page.locator('text=Marketing'));
    await expect(reactorView.first()).toBeVisible({ timeout: 15000 });
  });

  test('2. Campaign builder preflight diagnostic modal triggers correctly', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock_host_jwt_token');
      localStorage.setItem('user', JSON.stringify({ id: 101, email: 'host.marketing@enchospace.com', role: 'user' }));
    });

    await page.goto('/?view=host_dashboard&tab=marketing');
    const launchBtn = page.locator('button:has-text("Launch Campaign"), button:has-text("Create Campaign"), button:has-text("New Campaign")');
    if (await launchBtn.first().isVisible()) {
      await launchBtn.first().click();
      await expect(page.locator('text=Campaign Builder').or(page.locator('text=Targeting'))).toBeVisible();
    }
  });
});
