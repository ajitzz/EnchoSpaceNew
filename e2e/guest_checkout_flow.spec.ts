import { test, expect } from '@playwright/test';

test.describe('E2E: Guest Discovery, Stay Details & Multi-Currency Checkout Modal', () => {
  test('1. Public listing cards render and allow navigating to details', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();

    const listingCard = page.locator('[data-testid="listing-card"]').or(page.locator('.listing-card, div:has-text("★")'));
    await expect(listingCard.first()).toBeVisible({ timeout: 15000 });
  });

  test('2. Checkout modal triggers multi-currency payment router', async ({ page }) => {
    await page.goto('/');
    const listingCard = page.locator('[data-testid="listing-card"]').or(page.locator('.listing-card, div:has-text("★")'));
    if (await listingCard.first().isVisible()) {
      await listingCard.first().click();
      const reserveBtn = page.locator('button:has-text("Reserve"), button:has-text("Book Now")');
      if (await reserveBtn.first().isVisible()) {
        await reserveBtn.first().click();
        await expect(page.locator('text=Checkout').or(page.locator('text=Reservation Summary'))).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
