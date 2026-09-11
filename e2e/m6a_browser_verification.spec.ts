import { test, expect } from '@playwright/test';

const mockListing = {
  id: 'fixture-m6a',
  title: 'The Mirrored Mountain Pavilion',
  description: 'A 10/10 luxury sanctuary.',
  type: 'resort',
  address: 'Hidden in public',
  city: 'Wayanad',
  price: 28000,
  host_id: '1',
  rooms: [
    { id: '1', name: 'Cliff Nest', type: 'deluxe', price: 28000, capacity: 2, icon: '🦅', tag: '' },
    { id: '2', name: 'Forest Pavilion', type: 'executive', price: 42000, capacity: 4, icon: '🌿', tag: '' }
  ],
  photos: [
    { id: 'p1', url: 'https://images.unsplash.com/photo-1542314831-c6a4d14faaf2', tier: 'common', category: 'other' },
    { id: 'p2', url: 'https://images.unsplash.com/photo-1618773928120-2210850c99f1', tier: 'deluxe', category: 'bedroom' }
  ],
  imageUrl: 'https://images.unsplash.com/photo-1542314831-c6a4d14faaf2',
  imageUrls: ['https://images.unsplash.com/photo-1542314831-c6a4d14faaf2'],
  currency: 'INR',
  imageCount: 2,
  isVerified: true,
  verification_method: 'government_id',
  verified_at: new Date().toISOString(),
  location: { approximateLatitude: 11.6, approximateLongitude: 76.1 }
};

// We intercept the network to serve this fixture to the app
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v2/stays/*', async route => {
    await route.fulfill({ json: { rows: [mockListing] } });
  });
});

test('M6A: Visual Baseline & Interaction Proof', async ({ page, isMobile }) => {
  await page.goto('/#stay/fixture-m6a');

  // 1. Wait for render
  const heroImage = page.locator('img[alt*="The Mirrored Mountain Pavilion"]');
  await expect(heroImage.first()).toBeVisible();

  // 2. Exact selected photograph (Gallery routing)
  // Click a room card photo
  const roomCardPhoto = page.locator('img[src*="1618773928120"]').first();
  await roomCardPhoto.click();

  // Lightbox should open
  const lightbox = page.locator('.fixed.inset-0.z-\\[150\\]'); // SanctuaryGalleryModal wrapper
  await expect(lightbox).toBeVisible();

  // Lightbox active category should be deluxe
  const deluxeTab = page.getByRole('button', { name: /Cliff Nest/i });
  await expect(deluxeTab).toHaveAttribute('aria-selected', 'true');

  // Escape to bento, Escape to close
  await page.keyboard.press('Escape');
  // Might still be open if it just exited cinematic. Press again.
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();

  // 3. Neighborhood Radar
  const mapContainer = page.locator('div.absolute.inset-0.opacity-50.grayscale');
  await expect(mapContainer).toBeVisible();
  
  // Hover color restore
  await mapContainer.hover();
  await expect(mapContainer).toHaveClass(/group-hover:grayscale-0/);

  // 4. Missing Rooms Fallback
  await page.route('**/api/v2/stays/*', async route => {
    await route.fulfill({ json: { rows: [{ ...mockListing, rooms: [] }] } });
  });
  await page.goto('/#stay/fixture-m6a');
  await expect(page.getByText('Room details are being prepared.')).toBeVisible();
});
