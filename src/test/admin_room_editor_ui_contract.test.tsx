import React from 'react';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://encho.test/admin'
});

const mockAddToast = vi.fn();
const mockAlert = vi.fn();

(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).MutationObserver = dom.window.MutationObserver;
(global as any).alert = mockAlert;
(globalThis as any).alert = mockAlert;
dom.window.alert = mockAlert;

vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
vi.stubGlobal('navigator', dom.window.navigator);
vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
vi.stubGlobal('localStorage', dom.window.localStorage);
vi.stubGlobal('alert', mockAlert);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

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

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react');
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
    rooms: [
      { id: 4201, name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2, inventory_count: 1 }
    ],
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
    publication_status: 'published',
    rooms: [
      { id: 9901, name: 'Ocean Chalet', type: 'chalet', price: 25000, capacity: 4, inventory_count: 1 }
    ],
    photos: []
  }
];

describe('Admin Room Type Manager UI interaction & client contract tests', () => {
  let capturedRoomPuts: { url: string; method: string; headers: any; body: any }[] = [];
  let capturedStatusPatches: { url: string; method: string; headers: any; body: any }[] = [];

  beforeEach(() => {
    mockAddToast.mockClear();
    mockAlert.mockClear();
    capturedRoomPuts = [];
    capturedStatusPatches = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/admin/listings/') && url.includes('/status') && init?.method === 'PATCH') {
        const parsedBody = JSON.parse(String(init.body || '{}'));
        capturedStatusPatches.push({ url, method: 'PATCH', headers: init.headers, body: parsedBody });
        return reply({ success: true, publication_status: parsedBody.publication_status });
      }

      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        const parsedBody = JSON.parse(String(init.body || '{}'));
        capturedRoomPuts.push({ url, method: 'PUT', headers: init.headers, body: parsedBody });

        // Contract check: Real route requires positive price (price > 0)
        const hasNonPositivePrice = parsedBody.rooms?.some(
          (r: any) => r.price === undefined || r.price === null || Number(r.price) <= 0 || isNaN(Number(r.price))
        );
        if (hasNonPositivePrice) {
          return reply({ error: 'Invalid price: must be a positive number' }, 400);
        }

        // Return canonical rooms mirroring the real route:
        // Allocate stable integer ID for temporary IDs (e.g. 4202)
        const canonicalRooms = (parsedBody.rooms || []).map((r: any, idx: number) => {
          const idStr = String(r.id);
          if (idStr.startsWith('admin-room-') || idStr.startsWith('room-') || idStr.startsWith('new-') || idStr.startsWith('temp')) {
            return { ...r, id: 4202 + idx };
          }
          return { ...r, id: Number(r.id) || r.id };
        });

        return reply({ success: true, listingId: 42, rooms: canonicalRooms });
      }

      if (url.includes('/api/listings/99/rooms') && init?.method === 'PUT') {
        const parsedBody = JSON.parse(String(init.body || '{}'));
        capturedRoomPuts.push({ url, method: 'PUT', headers: init.headers, body: parsedBody });
        return reply(
          {
            error:
              'Cannot modify rooms on a published listing: modification would alter verified room authority. Unpublish listing first or submit a draft successor review.'
          },
          422
        );
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

  it('1. client-side validation blocks dispatch when a newly added room has price 0 or empty name, displaying inline error without sending false green HTTP requests', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    // Navigate to Properties tab
    const propertiesTab = screen.getByRole('button', { name: /properties/i });
    fireEvent.click(propertiesTab);

    // Find and click "Manage Room Types" button on draft listing 42
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    expect(manageButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(manageButtons[0]);

    // Modal opens
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();
    expect(screen.getAllByText(/Wayanad Sanctuary Estate/).length).toBeGreaterThanOrEqual(1);

    // Verify truthful draft footer copy emphasizing positive pricing and publication review
    expect(
      screen.getByText(
        'Edits save to draft authority with positive room pricing. Verified changes require publication review before appearing on the live guest booking page.'
      )
    ).toBeTruthy();

    // Click "+ Add Room Type" button
    const addRoomBtn = screen.getByRole('button', { name: /\+ Add Room Type/i });
    fireEvent.click(addRoomBtn);

    // In the newly expanded room editor, attempt to save while name is empty and price is 0
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    // Client-side validation halts dispatch: missing name error is shown inline
    expect(
      await screen.findByText(/Room #2 is missing a name. Every room type must have a name./)
    ).toBeTruthy();
    expect(capturedRoomPuts.length).toBe(0);

    // Now fill in the room name, but leave price at default 0
    const nameInput = screen.getByPlaceholderText('e.g. Ocean Bungalow Suite');
    fireEvent.change(nameInput, { target: { value: 'Hilltop Glass Villa' } });

    // Click save again
    fireEvent.click(saveBtn);

    // Client-side validation halts dispatch: zero price is rejected inline (positive price required)
    expect(
      await screen.findByText(/Room "Hilltop Glass Villa" must have a positive nightly price \(greater than ₹0\)\./)
    ).toBeTruthy();
    expect(capturedRoomPuts.length).toBe(0);
  });

  it('2. allows saving when newly added room has valid name and positive price, dispatching compliant PUT payload with temporary admin-room-* ID', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    // Navigate to Properties tab
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    // Open room editor for draft listing 42
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Add a new room
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Room Type/i }));

    // Fill in room name
    const nameInput = screen.getByPlaceholderText('e.g. Ocean Bungalow Suite');
    fireEvent.change(nameInput, { target: { value: 'Hilltop Glass Villa' } });

    // Fill in positive price (₹18,000)
    const priceLabel = screen.getByText('Nightly Price (₹)');
    const priceInput = priceLabel.parentElement?.querySelector('input') as HTMLInputElement;
    expect(priceInput).toBeTruthy();
    fireEvent.change(priceInput, { target: { value: '18000' } });
    expect(priceInput.value).toBe('18000');

    // Click "Save Room Types"
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    // HTTP PUT dispatched with positive price and temporary admin-room-* ID
    await waitFor(() => {
      expect(capturedRoomPuts.length).toBe(1);
    });

    const putCall = capturedRoomPuts[0];
    expect(putCall.url).toBe('/api/listings/42/rooms');
    expect(putCall.method).toBe('PUT');
    expect(putCall.body.rooms.length).toBe(2);

    // Existing room
    expect(putCall.body.rooms[0].name).toBe('Heritage Suite');
    expect(putCall.body.rooms[0].price).toBe(15000);

    // New room
    const newRoom = putCall.body.rooms[1];
    expect(newRoom.id).toMatch(/^admin-room-\d+$/);
    expect(newRoom.name).toBe('Hilltop Glass Villa');
    expect(newRoom.price).toBe(18000);
    expect(newRoom.capacity).toBe(2);
    expect(newRoom.inventory_count).toBe(1);

    // Modal closes upon successful save
    await waitFor(() => {
      expect(screen.queryByText('Room Type Manager')).toBeNull();
    });
  });

  it('3. displays server error inline and via alert when server returns an HTTP error, keeping modal open', async () => {
    // Override fetch to simulate a 400 bad request from server
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        return reply({ error: 'Server validation failed: invalid room attributes' }, 400);
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Click Save on existing valid room
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    // Server error is displayed inline in alert banner and via alert
    expect(
      await screen.findByText('Server validation failed: invalid room attributes')
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith('Server validation failed: invalid room attributes');

    // Modal remains open so admin does not lose data
    expect(screen.getByText('Room Type Manager')).toBeTruthy();
  });

  it('4. hides direct edit controls on a published property and explains reviewed successor authority', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    expect(await screen.findAllByText('Direct edits are locked. A reviewed successor is required.')).toHaveLength(1);
    expect(screen.getAllByTitle('Manage Room Types')).toHaveLength(1);
    expect(screen.queryByTitle('Edit Price')).toBeNull();
    expect(screen.queryByTitle('Edit Capacity')).toBeNull();
    expect(screen.queryByTitle('Edit Type')).toBeNull();
    expect(screen.queryByTitle('Edit Amenities')).toBeNull();
    expect(screen.queryByTitle('Edit Rental Mode')).toBeNull();
    expect(screen.queryByTitle('Edit Coordinates')).toBeNull();
    expect(screen.queryByTitle('Edit Video URL')).toBeNull();
    expect(screen.queryByTitle('Delete')).toBeNull();
    expect(screen.getAllByText('Base nightly price').length).toBeGreaterThan(0);
    expect(screen.queryByText('Price/Mo')).toBeNull();
    const directoryMetric = screen.getByText('Properties shown in directory').parentElement;
    expect(directoryMetric?.textContent).toContain('2');
    expect(capturedRoomPuts).toHaveLength(0);
  });

  it('5. double-save idempotency: consumes returned canonical rooms and second save dispatches allocated integer ID instead of temporary ID', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    // Navigate to Properties tab
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    // Open room editor for draft listing 42
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // 1. Add new room
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Room Type/i }));

    const nameInput = screen.getByPlaceholderText('e.g. Ocean Bungalow Suite');
    fireEvent.change(nameInput, { target: { value: 'Glass Villa Suite' } });

    const priceLabel = screen.getByText('Nightly Price (₹)');
    const priceInput = priceLabel.parentElement?.querySelector('input') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '22000' } });

    // First Save
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    // Wait for first PUT and modal close
    await waitFor(() => {
      expect(capturedRoomPuts.length).toBe(1);
      expect(screen.queryByText('Room Type Manager')).toBeNull();
    });

    const firstPut = capturedRoomPuts[0];
    expect(firstPut.body.rooms.length).toBe(2);
    expect(firstPut.body.rooms[1].id).toMatch(/^admin-room-\d+$/);

    // 2. Re-open room editor for listing 42:
    // It should now reflect the updated listing state containing the returned canonical room with assigned integer ID
    const manageButtonsAgain = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtonsAgain[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Verify room 2 is present with name "Glass Villa Suite"
    const roomHeader = await screen.findByText('Glass Villa Suite');
    expect(roomHeader).toBeTruthy();

    // Click room header to expand its editor
    fireEvent.click(roomHeader);
    expect(screen.getByDisplayValue('Glass Villa Suite')).toBeTruthy();

    // Second Save dispatches second PUT
    const saveBtnSecond = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtnSecond);

    await waitFor(() => {
      expect(capturedRoomPuts.length).toBe(2);
    });

    const secondPut = capturedRoomPuts[1];
    expect(secondPut.body.rooms.length).toBe(2);
    // Crucial idempotency check: Room 2 has the allocated integer ID, NOT the temporary admin-room-* ID!
    expect(String(secondPut.body.rooms[1].id)).not.toMatch(/^admin-room-/);
    expect(typeof secondPut.body.rooms[1].id === 'number' || /^\d+$/.test(String(secondPut.body.rooms[1].id))).toBe(true);
    expect(Number(secondPut.body.rooms[1].id)).toBe(4203);
  });

  it('6. response-shape regression: fails closed when server returns 200 OK but response is missing canonical rooms array, locking save until reload', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        // Return 200 OK but omitting canonical rooms array
        return reply({ success: true, listingId: 42 });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    // Assert fail-closed behavior:
    expect(
      await screen.findByText(/Outcome Unknown: Server response omitted rooms array/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('Outcome Unknown: Server response omitted rooms array')
    );

    // Modal remains open; Save button is locked/disabled
    expect(screen.getByText('Room Type Manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reload From Server/i })).toBeTruthy();
  });

  it('7. response-shape regression: fails closed when server returns 200 OK but canonical rooms array contains unassigned temporary IDs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        return reply({
          success: true,
          listingId: 42,
          rooms: [
            { id: 'admin-room-9999', name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2 }
          ]
        });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(/unassigned temporary ID "admin-room-9999"/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('unassigned temporary ID "admin-room-9999"')
    );

    expect(screen.getByText('Room Type Manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('8. response-shape regression: fails closed when server returns arbitrary non-integer or malformed ID (e.g. "abc", float, overflow)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        return reply({
          success: true,
          listingId: 42,
          rooms: [
            { id: 'abc', name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2 }
          ]
        });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(/returned invalid ID "abc"/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('returned invalid ID "abc"')
    );

    expect(screen.getByText('Room Type Manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('9. response-shape regression: fails closed when server returns truncated rooms array (submitted 2, returned 1)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        // Return only 1 room when client submitted 2 rooms
        return reply({
          success: true,
          listingId: 42,
          rooms: [
            { id: 4201, name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2 }
          ]
        });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Add second room so editingRoomsData has 2 rooms
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Room Type/i }));
    const nameInput = screen.getByPlaceholderText('e.g. Ocean Bungalow Suite');
    fireEvent.change(nameInput, { target: { value: 'Glass Villa Suite' } });
    const priceLabel = screen.getByText('Nightly Price (₹)');
    const priceInput = priceLabel.parentElement?.querySelector('input') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '22000' } });

    // Save with 2 rooms
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(/Server returned 1 room\(s\), but 2 room\(s\) were submitted/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('Server returned 1 room(s), but 2 room(s) were submitted')
    );

    expect(screen.getByText('Room Type Manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('10. response-shape regression: fails closed when server returns duplicate room IDs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        return reply({
          success: true,
          listingId: 42,
          rooms: [
            { id: 4201, name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2 },
            { id: 4201, name: 'Glass Villa Suite', type: 'suite', price: 22000, capacity: 4 }
          ]
        });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Room Type/i }));
    const nameInput = screen.getByPlaceholderText('e.g. Ocean Bungalow Suite');
    fireEvent.change(nameInput, { target: { value: 'Glass Villa Suite' } });
    const priceLabel = screen.getByText('Nightly Price (₹)');
    const priceInput = priceLabel.parentElement?.querySelector('input') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '22000' } });

    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(/Duplicate room ID 4201 detected in server response/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate room ID 4201 detected in server response')
    );

    expect(screen.getByText('Room Type Manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('11. response-shape regression: fails closed when server returns mismatched listingId', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        return reply({
          success: true,
          listingId: 999, // Mismatched listing ID
          rooms: [
            { id: 4201, name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2 }
          ]
        });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(/Server returned listingId \(999\) which does not match requested listing \(42\)/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('Server returned listingId (999) which does not match requested listing (42)')
    );

    expect(screen.getByText('Room Type Manager')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('12. lost response & network exception: treats outcome as unknown after dispatch, warns of potential COMMIT, locks save against blind retry, and enables reload', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        // Simulate dropped connection / network partition after dispatch
        throw new TypeError('Failed to fetch: Connection lost after dispatch');
      }
      if (url.includes('/api/listings/42/rooms') && (!init?.method || init.method === 'GET')) {
        // For reload from canonical room endpoint
        return reply({
          success: true,
          listingId: 42,
          rooms: [
            { id: 4201, name: 'Heritage Suite', type: 'suite', price: 15000, capacity: 2 },
            { id: 4202, name: 'Glass Villa Suite', type: 'suite', price: 22000, capacity: 4 }
          ]
        });
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Click save
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    // Verify network error guidance informing user of potential server COMMIT
    expect(
      await screen.findByText(/A network exception occurred during or after dispatch\. The database transaction may have already committed on the server/)
    ).toBeTruthy();
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining('A network exception occurred during or after dispatch. The database transaction may have already committed on the server')
    );

    // Save button is locked to prevent blind retry
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
    expect(screen.getByText('Room Type Manager')).toBeTruthy();

    // Test recovery via "Reload From Server" button:
    const reloadBtn = screen.getByRole('button', { name: /Reload From Server/i });
    expect(reloadBtn).toBeTruthy();
    fireEvent.click(reloadBtn);

    // After reload, modal remains open with fresh canonical rooms, error is cleared, Save button is unlocked
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeNull();
      expect(screen.getByRole('button', { name: /Save Room Types/i })).not.toBeDisabled();
    });
    expect(mockAddToast).toHaveBeenCalledWith('Rooms Reloaded', 'Canonical rooms reloaded from server.', 'info');
  });

  it('13. persistent unknown-outcome lock: closing and reopening the modal strictly preserves lock and disabled save', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        throw new TypeError('Network timeout: no response packet received');
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Click save -> network drop triggers lock
    const saveBtn = screen.getByRole('button', { name: /Save Room Types/i });
    fireEvent.click(saveBtn);

    expect(await screen.findByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();

    // Close the modal via Cancel button
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('Room Type Manager')).toBeNull();

    // Reopen the modal for the same listing
    const manageButtonsAgain = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtonsAgain[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Proves that reopening the modal NEVER resets or clears the unknown-outcome lock!
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
    expect(screen.getByText(/The database transaction may have already committed on the server/)).toBeTruthy();
  });

  it('14. reload fails closed with 409 Conflict on legacy-only unreconciled rooms, keeping save locked', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        throw new TypeError('Connection reset after dispatch');
      }
      if (url.includes('/api/listings/42/rooms') && (!init?.method || init.method === 'GET')) {
        // Server returns 409 Conflict: legacy rooms exist but room_types is 0
        return reply({
          error: 'Legacy room inventory not yet reconciled to relational room_types. Canonical reconciliation required.',
          code: 'ROOMS_UNRECONCILED',
          listingId: 42
        }, 409);
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);

    // Dispatch save -> network error triggers lock
    fireEvent.click(screen.getByRole('button', { name: /Save Room Types/i }));
    expect(await screen.findByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();

    // Attempt reload -> server responds with 409
    const reloadBtn = screen.getByRole('button', { name: /Reload From Server/i });
    fireEvent.click(reloadBtn);

    // Save must remain locked and actionable error shown
    expect(
      await screen.findByText(/Legacy room inventory not yet reconciled to relational room_types/)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('15. reload validates listingId and room IDs; fails closed on temporary ID, duplicate ID, non-integer or mismatched listingId', async () => {
    let reloadPayload: any = {
      success: true,
      listingId: 999, // Mismatched listingId
      rooms: [{ id: 4201, name: 'Deluxe Room', price: 5000 }]
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/listings/42/rooms') && init?.method === 'PUT') {
        throw new TypeError('Dropped connection');
      }
      if (url.includes('/api/listings/42/rooms') && (!init?.method || init.method === 'GET')) {
        return reply(reloadPayload);
      }
      if (url.includes('/api/listings')) {
        return reply(mockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);

    // Save -> lock
    fireEvent.click(screen.getByRole('button', { name: /Save Room Types/i }));
    expect(await screen.findByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();

    // 1. Reload with mismatched listingId -> fails closed
    const reloadBtn = screen.getByRole('button', { name: /Reload From Server/i });
    fireEvent.click(reloadBtn);
    expect(await screen.findByText(/does not match requested listing/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();

    // 2. Reload with temporary ID -> fails closed
    reloadPayload = {
      success: true,
      listingId: 42,
      rooms: [{ id: 'admin-room-999', name: 'Temporary Room', price: 5000 }]
    };
    fireEvent.click(reloadBtn);
    expect(await screen.findByText(/returned unassigned temporary ID/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();

    // 3. Reload with non-integer "abc" -> fails closed
    reloadPayload = {
      success: true,
      listingId: 42,
      rooms: [{ id: 'abc', name: 'Invalid Room', price: 5000 }]
    };
    fireEvent.click(reloadBtn);
    expect(await screen.findByText(/returned invalid ID/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();

    // 4. Reload with duplicate ID -> fails closed
    reloadPayload = {
      success: true,
      listingId: 42,
      rooms: [
        { id: 4201, name: 'Room 1', price: 5000 },
        { id: 4201, name: 'Room 2', price: 7000 }
      ]
    };
    fireEvent.click(reloadBtn);
    expect(await screen.findByText(/Duplicate room ID 4201 in server response/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Locked \(Reload Required\)/i })).toBeDisabled();
  });

  it('16. persisted-room deletion safety: disables delete button on persisted rooms with truthful notice (omission in PUT is not deletion)', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Room 0 (Heritage Suite, id 4201) is expanded by default
    // Verify truthful disabled control
    const disabledBtn = await screen.findByRole('button', { name: /Delete Disabled \(Persisted\)/i });
    expect(disabledBtn).toBeDisabled();
    expect(disabledBtn.getAttribute('title')).toMatch(/dedicated room retirement command is required/i);
    expect(
      screen.getByText(/Persisted rooms cannot be deleted by omission; retirement command required\./i)
    ).toBeTruthy();

    // Clicking disabled button does not remove the room
    fireEvent.click(disabledBtn);
    expect(screen.getByText('Heritage Suite')).toBeTruthy();
  });

  it('17. allows removing unsaved draft rooms before save without network dispatch', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Add a new room
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Room Type/i }));

    // Unsaved temporary room displays "Remove Unsaved Room" button
    const removeBtn = screen.getByRole('button', { name: /Remove Unsaved Room/i });
    expect(removeBtn).not.toBeDisabled();

    // Clicking "Remove Unsaved Room" removes it from the list
    fireEvent.click(removeBtn);

    // Only the original 1 room remains, no network calls made
    expect(screen.queryByRole('button', { name: /Remove Unsaved Room/i })).toBeNull();
    expect(screen.getByText('Heritage Suite')).toBeTruthy();
    expect(capturedRoomPuts.length).toBe(0);
  });

  it('18. ambiguous legacy room deletion safety: disables delete button on legacy rooms lacking ID with reconciliation guidance', async () => {
    // Override fetch to return a legacy listing whose rooms array has an element without an id
    const legacyMockListings = [
      {
        id: 77,
        title: 'Legacy Forest Haven',
        description: 'Older retreat',
        price: 12000,
        type: 'Resort',
        publication_status: 'draft',
        rooms: [
          { name: 'Unreconciled Suite', type: 'suite', price: 12000, capacity: 2, inventory_count: 1 }
        ],
        photos: []
      }
    ];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/listings')) {
        return reply(legacyMockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const manageButtons = await screen.findAllByTitle('Manage Room Types');
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByText('Room Type Manager')).toBeTruthy();

    // Verify disabled unreconciled control
    const disabledBtn = await screen.findByRole('button', { name: /Delete Disabled \(Unreconciled\)/i });
    expect(disabledBtn).toBeDisabled();
    expect(disabledBtn.getAttribute('title')).toMatch(/canonical room reconciliation first/i);
    expect(
      screen.getByText(/Legacy room missing ID; canonical reconciliation required before deletion\./i)
    ).toBeTruthy();

    // Clicking disabled button does not remove the room
    fireEvent.click(disabledBtn);
    expect(screen.getByText('Unreconciled Suite')).toBeTruthy();
  });

  it('19. publication status toggle: unlisting a published listing dispatches publication_status "unlisted" (never "draft") and updates badge to Unlisted', async () => {
    const publishedOnlyMockListings = [
      {
        id: 99,
        title: 'Goa Coastal Villa',
        description: 'Beachside retreat',
        price: 25000,
        type: 'Villa',
        address: '456 Beach Road',
        city: 'Goa',
        publication_status: 'published',
        rooms: [
          { id: 9901, name: 'Ocean Chalet', type: 'chalet', price: 25000, capacity: 4, inventory_count: 1 }
        ],
        photos: []
      }
    ];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/admin/listings/') && url.includes('/status') && init?.method === 'PATCH') {
        const parsedBody = JSON.parse(String(init.body || '{}'));
        capturedStatusPatches.push({ url, method: 'PATCH', headers: init.headers, body: parsedBody });
        return reply({ success: true, publication_status: parsedBody.publication_status });
      }
      if (url.includes('/api/listings')) {
        return reply(publishedOnlyMockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    // Listing 99 is published
    const publishedBtn = await screen.findByTitle('Unlist property. This moves Published to Unlisted, preserving accepted facts.');
    expect(publishedBtn).toBeTruthy();
    expect(publishedBtn.textContent).toMatch(/Published/i);

    fireEvent.click(publishedBtn);

    // Verify dispatched payload to status route
    await waitFor(() => {
      expect(capturedStatusPatches.length).toBe(1);
    });
    expect(capturedStatusPatches[0].url).toContain('/api/admin/listings/99/status');
    expect(capturedStatusPatches[0].body).toEqual({ publication_status: 'unlisted' });
    expect(capturedStatusPatches[0].body.publication_status).not.toBe('draft');

    // UI state updates: button now reflects Unlisted state with publish title
    await waitFor(() => {
      const updatedBtn = screen.getByTitle('Publish property after checking its facts and rights. The server checks the approved room-photo minimum.');
      expect(updatedBtn).toBeTruthy();
      expect(updatedBtn.textContent).toMatch(/Unlisted/i);
    });
    expect(mockAddToast).toHaveBeenCalledWith('Status Updated', 'Listing marked as unlisted.', 'success');
  });

  it('20. publication status toggle: publishing an unlisted listing dispatches publication_status "published" and updates badge to Published', async () => {
    const unlistedMockListings = [
      {
        id: 101,
        title: 'Coorg Coffee Retreat',
        description: 'Secluded plantation villa',
        price: 18000,
        type: 'Villa',
        address: '789 Estate Way',
        city: 'Coorg',
        publication_status: 'unlisted',
        rooms: [
          { id: 10101, name: 'Plantation Suite', type: 'suite', price: 18000, capacity: 2, inventory_count: 1 }
        ],
        photos: []
      }
    ];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/admin/listings/') && url.includes('/status') && init?.method === 'PATCH') {
        const parsedBody = JSON.parse(String(init.body || '{}'));
        capturedStatusPatches.push({ url, method: 'PATCH', headers: init.headers, body: parsedBody });
        return reply({ success: true, publication_status: parsedBody.publication_status });
      }
      if (url.includes('/api/listings')) {
        return reply(unlistedMockListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));

    const unlistedBtn = await screen.findByTitle('Publish property after checking its facts and rights. The server checks the approved room-photo minimum.');
    expect(unlistedBtn).toBeTruthy();
    expect(unlistedBtn.textContent).toMatch(/Unlisted/i);

    fireEvent.click(unlistedBtn);

    await waitFor(() => {
      expect(capturedStatusPatches.length).toBe(1);
    });
    expect(capturedStatusPatches[0].url).toContain('/api/admin/listings/101/status');
    expect(capturedStatusPatches[0].body).toEqual({ publication_status: 'published' });

    await waitFor(() => {
      const updatedBtn = screen.getByTitle('Unlist property. This moves Published to Unlisted, preserving accepted facts.');
      expect(updatedBtn).toBeTruthy();
      expect(updatedBtn.textContent).toMatch(/Published/i);
    });
    expect(mockAddToast).toHaveBeenCalledWith('Status Updated', 'Listing marked as published.', 'success');
  });

  it('21. holds the room save and modal close while an in-flight room PUT has no known outcome', async () => {
    let resolvePut!: (response: Response) => void;
    const heldPut = new Promise<Response>(resolve => { resolvePut = resolve; });
    const roomPuts: Array<{ rooms: unknown[] }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/listings/42/rooms' && init?.method === 'PUT') {
        roomPuts.push(JSON.parse(String(init.body)));
        return heldPut;
      }
      if (url.includes('/api/listings')) return reply(mockListings);
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    fireEvent.click((await screen.findAllByTitle('Manage Room Types'))[0]);
    const save = screen.getByRole('button', { name: 'Save Room Types' });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(roomPuts).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Saving rooms...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close Room Type Manager' })).toBeDisabled();

    resolvePut(reply({ success: true, listingId: 42, rooms: mockListings[0].rooms }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Room Type Manager' })).toBeNull());
  });

  it('22. draft feature and presentation saves send only their edited fields', async () => {
    const listingPuts: Record<string, unknown>[] = [];
    const draftWithGuidelines = {
      ...mockListings[0],
      curated_guidelines: JSON.stringify(['Verified quiet hours']),
      concierge_privileges: 'Host pickup by prior agreement'
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/listings/42' && init?.method === 'PUT') {
        listingPuts.push(JSON.parse(String(init.body)));
        return reply({ success: true });
      }
      if (url.includes('/api/listings')) return reply([draftWithGuidelines, mockListings[1]]);
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    fireEvent.click((await screen.findAllByTitle('Edit FAANG Features'))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Features' }));
    await waitFor(() => expect(listingPuts).toHaveLength(1));
    expect(Object.keys(listingPuts[0]).sort()).toEqual(['amenity_clusters', 'child_safety_specs']);
    expect(listingPuts[0]).not.toHaveProperty('publication_status');
    expect(listingPuts[0]).not.toHaveProperty('rooms');

    fireEvent.click((await screen.findAllByTitle('Edit draft presentation fields'))[0]);
    expect(await screen.findByDisplayValue('Verified quiet hours')).toBeTruthy();
    expect(screen.getByDisplayValue('Host pickup by prior agreement')).toBeTruthy();
    expect(screen.queryByText('Heated Infinity Pool')).toBeNull();
    expect(screen.getByText('Add only tags supported by verified listing evidence. Existing tags can be removed below.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft Details' }));
    await waitFor(() => expect(listingPuts).toHaveLength(2));
    expect(Object.keys(listingPuts[1]).sort()).toEqual([
      'concierge_privileges', 'curated_guidelines', 'dominant_color_hex', 'experience_tags',
      'hero_fallback_url', 'hero_video_url', 'raw_rules'
    ]);
    expect(listingPuts[1]).not.toHaveProperty('publication_status');
    expect(listingPuts[1]).not.toHaveProperty('photos');
  });

  it('23. mounts the audited draft editor only for drafts and refreshes the directory after a scoped save', async () => {
    let currentListings: any[] = mockListings.map(listing => ({ ...listing }));
    let directoryReads = 0;
    const draftPatches: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/admin/listings/42/draft-property' && init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body));
        draftPatches.push(patch);
        currentListings = currentListings.map(listing => listing.id === 42 ? { ...listing, title: patch.title } : listing);
        return reply({ success: true });
      }
      if (url === '/api/listings/42') return reply(currentListings[0]);
      if (url === '/api/listings?city=all') {
        directoryReads++;
        return reply(currentListings);
      }
      return reply([]);
    }));

    render(<AdminDashboard onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /properties/i }));
    const draftEdit = await screen.findByTitle('Edit draft property details');
    expect(screen.getAllByTitle('Edit draft property details')).toHaveLength(1);
    fireEvent.click(draftEdit);

    const dialog = await screen.findByRole('dialog', { name: 'Edit draft property' });
    await waitFor(() => expect(within(dialog).queryByRole('status')).toBeNull());
    const title = await within(dialog).findByLabelText('Property title');
    fireEvent.change(title, { target: { value: 'Wayanad Sanctuary Estate Revised' } });
    const saveDraft = within(dialog).getByRole('button', { name: 'Save draft changes' }) as HTMLButtonElement;
    await waitFor(() => expect(saveDraft.disabled).toBe(false));
    fireEvent.click(saveDraft);

    await waitFor(() => expect(draftPatches).toHaveLength(1));
    expect(draftPatches[0]).toEqual({
      title: 'Wayanad Sanctuary Estate Revised',
      expected_current: { title: 'Wayanad Sanctuary Estate' }
    });
    await waitFor(() => expect(directoryReads).toBeGreaterThanOrEqual(2));
    await screen.findByText('Wayanad Sanctuary Estate Revised');
  });
});
