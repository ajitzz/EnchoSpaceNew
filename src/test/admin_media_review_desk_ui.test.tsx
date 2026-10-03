import React from 'react';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://encho.test/admin'
});

(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).MutationObserver = dom.window.MutationObserver;

vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
vi.stubGlobal('navigator', dom.window.navigator);
vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
vi.stubGlobal('localStorage', dom.window.localStorage);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const mockAddToast = vi.fn();

// Mock contexts and heavy dependencies
vi.mock('../../components/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Admin', role: 'admin' }, token: 'mock-admin-token', logout: vi.fn() })
}));
vi.mock('../../components/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast })
}));
vi.mock('../../components/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (n: number) => `₹${n}` })
}));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null
}));

const { cleanup, fireEvent, render, screen, waitFor, within, act } = await import('@testing-library/react');
const { default: AdminDashboard } = await import('../../components/AdminDashboard.js');

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const mockListings = [
  {
    id: 42,
    title: 'Wayanad Sanctuary Estate',
    description: 'A serene mountain estate',
    price: 15000,
    type: 'Villa',
    address: '123 Forest Road',
    city: 'Wayanad',
    publication_status: 'draft',
    rooms: [],
    photos: []
  },
  {
    id: 99,
    title: 'Goa Coastal Villa',
    description: 'Beachside retreat',
    price: 25000,
    type: 'Villa',
    address: '456 Beach Road',
    city: 'Goa',
    publication_status: 'draft',
    rooms: [],
    photos: []
  }
];

const mockDeskData42 = {
  listingId: 42,
  listingTitle: 'Wayanad Sanctuary Estate',
  publicationStatus: 'draft',
  roomTypes: [
    { id: 101, name: 'Panoramic Villa', type: 'villa', base_price: 15000, max_occupancy: 4 }
  ],
  mediaAssets: [
    {
      id: 1,
      entity_type: 'listing',
      entity_id: 42,
      url: 'https://images.unsplash.com/photo-safe-1.jpg',
      tier: 'villa',
      category: 'bedroom',
      title: 'Master Bedroom',
      description: 'Spacious room',
      specs: null,
      is_hero: true,
      order_index: 0,
      is_sleeping_area: true,
      room_type_id: 101,
      moderation_status: 'pending_review'
    },
    {
      id: 2,
      entity_type: 'listing',
      entity_id: 42,
      url: 'http://169.254.169.254/latest/meta-data/',
      tier: 'villa',
      category: 'exterior',
      title: 'Unsafe Cloud Metadata Probe',
      description: 'SSRF probe URL',
      specs: null,
      is_hero: false,
      order_index: 1,
      is_sleeping_area: false,
      room_type_id: 101,
      moderation_status: 'pending_review'
    },
    {
      id: 3,
      entity_type: 'listing',
      entity_id: 42,
      url: 'https://images.unsplash.com/photo-safe-broken.jpg',
      tier: 'common',
      category: 'other',
      title: 'Broken Safe Asset',
      description: 'Fails to load',
      specs: null,
      is_hero: false,
      order_index: 2,
      is_sleeping_area: false,
      room_type_id: null,
      moderation_status: 'pending_review'
    }
  ],
  validation: {
    valid: false,
    errors: ['Room Panoramic Villa requires at least 3 approved photos (currently 0 approved).'],
    roomSummaries: [
      {
        roomId: 101,
        roomName: 'Panoramic Villa',
        roomType: 'villa',
        approvedPhotosCount: 0,
        sleepingAreaPhotosCount: 0,
        isCompliant: false
      }
    ]
  }
};

const mockDeskData99 = {
  listingId: 99,
  listingTitle: 'Goa Coastal Villa',
  publicationStatus: 'draft',
  roomTypes: [],
  mediaAssets: [],
  validation: {
    valid: false,
    errors: ['No room types defined.'],
    roomSummaries: []
  }
};

describe('Admin Media Review Desk UI mounted component verification', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/listings/42/media-assets')) {
        return reply(mockDeskData42);
      }
      if (url.includes('/api/admin/listings/99/media-assets')) {
        return reply(mockDeskData99);
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('1. verifies modal semantics, accessibility attributes, and scroll locking', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    expect(document.body.style.overflow).not.toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    expect(deskTriggers.length).toBeGreaterThan(0);
    fireEvent.click(deskTriggers[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('media-review-desk-title');
    expect(document.getElementById('media-review-desk-title')).toBeTruthy();

    expect(document.body.style.overflow).toBe('hidden');

    const closeBtn = within(dialog).getByRole('button', { name: 'Close Media Review Desk' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('2. verifies Escape key closes modal and restores focus to trigger button', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    const trigger = deskTriggers[0];
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('3. verifies keyboard Tab and Shift+Tab focus containment inside modal', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    fireEvent.click(deskTriggers[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    const focusableSelectors = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
    expect(focusables.length).toBeGreaterThan(1);

    const firstElement = focusables[0];
    const lastElement = focusables[focusables.length - 1];

    lastElement.focus();
    expect(document.activeElement).toBe(lastElement);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(firstElement);

    firstElement.focus();
    expect(document.activeElement).toBe(firstElement);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastElement);
  });

  it('4. verifies truthful unsafe-image fallback and referrerPolicy on media assets', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    fireEvent.click(deskTriggers[0]);

    const dialog = await screen.findByRole('dialog');
    const withinDialog = within(dialog);

    // Unsafe cloud metadata IP must NOT mount <img> and must show role="alert"
    const blockedAlert = withinDialog.getByRole('alert', { name: 'Blocked unsafe image URL' });
    expect(blockedAlert).toBeTruthy();
    expect(blockedAlert.textContent).toContain('Blocked Unsafe URL');

    const allImages = Array.from(dialog.querySelectorAll('img'));
    const unsafeImg = allImages.find(img => img.src.includes('169.254.169.254'));
    expect(unsafeImg).toBeUndefined();

    // Safe URL must have referrerPolicy="no-referrer"
    const safeImg = allImages.find(img => img.src.includes('photo-safe-1.jpg'));
    expect(safeImg).toBeDefined();
    expect(safeImg?.getAttribute('referrerpolicy')).toBe('no-referrer');

    // Simulate broken image load
    const brokenImg = allImages.find(img => img.src.includes('photo-safe-broken.jpg'));
    expect(brokenImg).toBeDefined();

    fireEvent.error(brokenImg!);

    await waitFor(() => {
      const failedAlert = withinDialog.getByRole('alert', { name: 'Image failed to load' });
      expect(failedAlert).toBeTruthy();
      expect(failedAlert.textContent).toContain('Image Failed to Load');
    });
  });

  it('5. verifies strict host data isolation across sequential listing reviews', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    expect(deskTriggers.length).toBe(2);

    // Open first listing (Wayanad Sanctuary Estate #42)
    fireEvent.click(deskTriggers[0]);
    const dialog1 = await screen.findByRole('dialog');
    const within1 = within(dialog1);
    await within1.findByText('ID: #1');
    expect(within1.getAllByText('Panoramic Villa').length).toBeGreaterThan(0);

    // Close first listing desk
    fireEvent.click(within1.getByRole('button', { name: 'Close Media Review Desk' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Open second listing (Goa Coastal Villa #99)
    const updatedTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    fireEvent.click(updatedTriggers[1]);
    const dialog2 = await screen.findByRole('dialog');
    const within2 = within(dialog2);
    await within2.findByText(/No room types defined for this property yet/);

    // Data from listing #42 must NOT be present in dialog 2
    expect(within2.queryByText(/Wayanad Sanctuary Estate/)).toBeNull();
    expect(within2.queryByText('ID: #1')).toBeNull();
    expect(within2.queryByText('Panoramic Villa')).toBeNull();
  });

  it('6. verifies responsive CSS layout classes intended for narrow viewports (does not assert real 360px rendering or mobile acceptance)', async () => {
    // Note: Checking Tailwind utility classes in JSDOM verifies styling intent, but cannot substitute for layout engine viewport rendering. Mobile acceptance is not claimed.
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    fireEvent.click(deskTriggers[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    expect(dialog.className).toContain('p-2');
    expect(dialog.className).toContain('sm:p-4');

    const headerTitle = dialog.querySelector('#media-review-desk-title');
    expect(headerTitle?.className).toContain('truncate');

    const closeBtn = within(dialog).getByRole('button', { name: 'Close Media Review Desk' });
    expect(closeBtn.closest('div')?.className).toContain('flex-shrink-0');
  });

  it('7. proves late-arriving deferred response for listing #42 cannot overwrite listing #99 data (request fencing)', async () => {
    let resolve42Deferred!: (res: Response) => void;
    const pending42Promise = new Promise<Response>((resolve) => {
      resolve42Deferred = resolve;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/listings/42/media-assets')) {
        return pending42Promise; // Deferred, held unresolved
      }
      if (url.includes('/api/admin/listings/99/media-assets')) {
        return reply(mockDeskData99); // Resolves immediately
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');

    // 1. Open listing #42: fetch #42 is triggered and stays pending
    fireEvent.click(deskTriggers[0]);
    await screen.findByRole('dialog');
    expect(screen.getByText('Loading relational media assets and validation status...')).toBeTruthy();

    // 2. While #42 is still pending, admin opens listing #99
    fireEvent.click(deskTriggers[1]);
    const dialog = await screen.findByRole('dialog');
    const withinDialog = within(dialog);

    // Listing #99 resolves immediately
    await withinDialog.findByText(/Goa Coastal Villa/);
    await withinDialog.findByText(/No room types defined for this property yet/);

    // 3. Now, the slow deferred response for listing #42 finally arrives
    await act(async () => {
      resolve42Deferred(reply(mockDeskData42));
      await new Promise(r => setTimeout(r, 20));
    });

    // 4. Verify fence held: Listing #99 data is STILL shown; listing #42 data NEVER leaked in
    expect(withinDialog.getByText(/Goa Coastal Villa/)).toBeTruthy();
    expect(withinDialog.queryByText(/Wayanad Sanctuary Estate/)).toBeNull();
    expect(withinDialog.queryByText('Panoramic Villa')).toBeNull();
    expect(withinDialog.queryByText('ID: #1')).toBeNull();
  });

  it('8. proves stale refresh response cannot overwrite newer refresh response (sequence fencing)', async () => {
    let resolveRefresh1!: (res: Response) => void;
    let callCount = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/listings/42/media-assets')) {
        callCount++;
        if (callCount === 1) {
          // Initial load: returns initial draft data
          return reply(mockDeskData42);
        }
        if (callCount === 2) {
          // Refresh 1: held deferred
          return new Promise<Response>((resolve) => {
            resolveRefresh1 = resolve;
          });
        }
        if (callCount === 3) {
          // Refresh 2: resolves immediately with published status
          return reply({
            ...mockDeskData42,
            listingTitle: 'Wayanad Sanctuary Estate - Published Version',
            publicationStatus: 'published',
            validation: { valid: true, errors: [], roomSummaries: [] }
          });
        }
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    fireEvent.click(deskTriggers[0]);

    const dialog = await screen.findByRole('dialog');
    const withinDialog = within(dialog);
    await withinDialog.findByText('ID: #1');

    const refreshBtn = withinDialog.getByRole('button', { name: 'Refresh media and compliance status' });

    // Trigger Refresh 1 (held deferred)
    fireEvent.click(refreshBtn);

    // Trigger Refresh 2 (resolves immediately)
    fireEvent.click(refreshBtn);

    // Verify Refresh 2 data is rendered
    await withinDialog.findByText(/Published Version/);
    expect(withinDialog.getByText('Room-photo minimum met')).toBeTruthy();
    expect(withinDialog.queryByRole('button', { name: /Publish Property Now/i })).toBeNull();

    // Now Refresh 1 finally resolves with old stale data
    await act(async () => {
      resolveRefresh1(reply({
        ...mockDeskData42,
        listingTitle: 'Wayanad Sanctuary Estate - Stale Version'
      }));
      await new Promise(r => setTimeout(r, 20));
    });

    // Verify fence held: Refresh 2 data remains, stale Refresh 1 data is discarded
    expect(withinDialog.getByText(/Published Version/)).toBeTruthy();
    expect(withinDialog.queryByText(/Stale Version/)).toBeNull();
  });

  it('9. proves superseded or closed request failure does not emit stale error toast', async () => {
    let reject42!: (err: Error) => void;
    const pendingPromise = new Promise<Response>((_resolve, reject) => {
      reject42 = reject;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/listings/42/media-assets')) {
        return pendingPromise;
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');

    // Open listing #42 desk (fetch #42 is pending)
    fireEvent.click(deskTriggers[0]);
    const dialog = await screen.findByRole('dialog');

    // Admin closes desk before response arrives
    const closeBtn = within(dialog).getByRole('button', { name: 'Close Media Review Desk' });
    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Now pending fetch rejects
    await act(async () => {
      reject42(new Error('Network failure on superseded fetch'));
      await new Promise(r => setTimeout(r, 20));
    });

    // Assert: addToast was NEVER called with an error for the closed request
    expect(mockAddToast).not.toHaveBeenCalledWith('Network Error', expect.any(String), 'error');
  });

  it('10. approval requires a loaded image; unsafe or failed previews cannot be approved from the desk', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const deskTriggers = await screen.findAllByTitle('Media Review Desk (Relational Assets & Publication Compliance)');
    fireEvent.click(deskTriggers[0]);

    const dialog = await screen.findByRole('dialog');
    const desk = within(dialog);
    const safeApprove = await desk.findByRole('button', { name: 'Approve asset #1' });
    const blockedApprove = desk.getByRole('button', { name: 'Approve asset #2' });
    const failedApprove = desk.getByRole('button', { name: 'Approve asset #3' });

    expect(safeApprove).toBeDisabled();
    expect(blockedApprove).toBeDisabled();
    expect(failedApprove).toBeDisabled();

    fireEvent.load(desk.getByAltText('Master Bedroom'));
    await waitFor(() => expect(safeApprove).not.toBeDisabled());
    expect(blockedApprove).toBeDisabled();

    fireEvent.error(desk.getByAltText('Broken Safe Asset'));
    expect(failedApprove).toBeDisabled();
    expect(desk.getAllByText('Approval waits until this image loads for review.')).toHaveLength(2);
  });
});
