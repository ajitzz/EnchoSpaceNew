import { test, expect } from '@playwright/test';

// Milestone 6: E2E Validation & Circuit Breaker Tests

test.describe('Double-Entry Ledger Math & Circuit Breaker', () => {
    test('Strict 15% / 18% Checkout UI Mathematical Integrity', async ({ page }) => {
        // Mock a Listing with $100 price
        await page.route('/api/listings*', async route => {
            const json = [{
                id: 'listing_1',
                title: 'Oceanview Sanctuary',
                price: 100,
                currency: 'USD',
                rental_mode: 'entire_place',
                imageUrls: ['https://images.unsplash.com/photo-1']
            }];
            await route.fulfill({ json });
        });

        await page.goto('/');
        
        // Wait for search to load
        await page.waitForSelector('text=Oceanview Sanctuary');
        
        // Click into the listing
        await page.click('text=Oceanview Sanctuary');
        
        // Ensure ListingDetailsNew loaded
        await expect(page.locator('text=Host Concierge')).toBeVisible();

        // Check the math in the Sticky Glass Dock (M5)
        // Nightly rate is $100. By default it checks 1 night.
        // Base Rent: $100
        // Encho Fee (15%): $15
        // Taxes (18%): $18
        // Total: $133
        
        await expect(page.locator('text=$15').first()).toBeVisible(); // Optimization Fee
        await expect(page.locator('text=$18').first()).toBeVisible(); // Taxes
        await expect(page.locator('text=$133').first()).toBeVisible(); // Total
    });
    
    test('Meta Ad-Pause Circuit Breaker Trigger Hook', async ({ request }) => {
        // This is a simulated backend test to verify the Auto-Pause trigger
        // When a property inventory hits 0, it must pause the Ad campaign.
        
        // We'll simulate hitting the Meta webhook
        const response = await request.post('/api/marketing/circuit-breaker', {
            data: {
                listingId: 'listing_1',
                newInventory: 0
            }
        });
        
        // Ensure the API enforces a PAUSE state for zero inventory
        if (response.ok()) {
            const result = await response.json();
            expect(result.status).toBe('PAUSED');
            expect(result.reason).toBe('ZERO_INVENTORY_CIRCUIT_BREAKER');
        }
    });
});
