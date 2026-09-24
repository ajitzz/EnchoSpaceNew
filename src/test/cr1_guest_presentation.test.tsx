// @vitest-environment jsdom
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, renderHook, screen, within} from '@testing-library/react';
import type {Listing, SpatialPhoto} from '../../types';
import {ListingDetailsNew} from '../../components/ListingDetailsNew';
import {SanctuaryGalleryModal, classifyListingPhotos} from '../../components/SanctuaryGalleryModal';
import {presentRooms} from '../shared/guest/roomPresentation';
import {readAvailabilityObservation, PUBLIC_AVAILABILITY_MAX_AGE_MS} from '../shared/guest/publicAvailability';
import {usePublicAvailability} from '../../hooks/usePublicAvailability';

vi.mock('../../components/AuthContext', () => ({useAuth: () => ({user: null, token: ''})}));
vi.mock('../../components/ToastContext', () => ({useToast: () => ({addToast: vi.fn()})}));
vi.mock('../../hooks/useListingTelemetry', () => ({useListingTelemetry: () => ({trackPhotoView: vi.fn(), trackDateSelection: vi.fn()})}));
vi.mock('../../components/audio', () => ({uiAudio: {playClick: vi.fn(), playPop: vi.fn()}}));
vi.mock('../../components/SEO', () => ({SEO: () => null}));

const photo = (id: string, roomId?: number): SpatialPhoto => ({id, url: `/${id}.jpg`, tier: 'suite', category: 'bedroom', ...(roomId === undefined ? {} : {room_type_id: roomId})});
const listing = (): Listing => ({id: '1', title: 'Mixed-price resort', price: 99, currency: 'INR', type: 'Resort', rental_mode: 'private_rooms', imageUrl: '/grounds.jpg', imageCount: 1, isVerified: false,
  rooms: [{id: '101', type: 'suite', name: 'Garden room', price: 3500.75, capacity: 2}, {id: '102', type: 'suite', name: 'Presidential room', price: 8000, capacity: 4}],
  photos: [photo('garden', 101), photo('presidential', 102), photo('ambiguous')],
});
const windowScope = {listingId: 1, from: '2026-10-01', to: '2026-10-03'};
const observation = () => ({...windowScope, observedAt: new Date().toISOString(), rooms: [{id: 101, available: 0}, {id: 102, available: 2}]});

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}}));
  vi.stubGlobal('IntersectionObserver', class {observe() {} unobserve() {} disconnect() {}});
  Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'visible'});
  vi.stubGlobal('fetch', vi.fn(async () => ({ok: false})));
});
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();});

describe('room identity and truthful guest rendering', () => {
  it('isolates same-classification rooms using explicit media association and exact price', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const query = new URL(url, 'https://encho.test').searchParams;
      return {ok: true, json: async () => ({...observation(), from: query.get('from'), to: query.get('to')})};
    }));
    const view = render(<ListingDetailsNew listing={listing()} isPreview onBack={() => {}} />);
    await act(async () => {});
    expect(screen.getByRole('button', {name: 'Garden room'}).getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).toContain('From ₹3,500.75');
    expect(screen.getByRole('status').textContent).toContain('No rooms are available');
    fireEvent.click(screen.getByRole('button', {name: 'Presidential room'}));
    expect(screen.getByRole('status').textContent).toContain('2 rooms reported available');
    expect(view.container.textContent).not.toContain('Instant Confirmation');
    expect(view.container.textContent).not.toContain('complete privacy');
    for (const button of screen.getAllByRole('button', {name: /booking.*prepared/i})) expect((button as HTMLButtonElement).disabled).toBe(true);
    const rooms = presentRooms(listing());
    expect(rooms.map(entry => entry.photos.map(asset => asset.url))).toEqual([['/garden.jpg'], ['/presidential.jpg']]);
    expect(classifyListingPhotos(listing()).filter(asset => asset.url === '/ambiguous.jpg')[0].tier).toBe('suite');
  });

  it('does not use a repeated or absent room ID as inventory authority', () => {
    const source = listing(); source.rooms![1].id = '101';
    const duplicated = presentRooms(source);
    expect(duplicated.map(entry => entry.canonicalId)).toEqual([null, null]);
    expect(new Set(duplicated.map(entry => entry.key)).size).toBe(2);
    expect(duplicated.every(entry => entry.photos.length === 0)).toBe(true);
  });

  it('does not reinterpret an explicit foreign-room photo using a matching classification', () => {
    const source = listing(); source.rooms = [source.rooms![0]]; source.photos = [photo('foreign', 777)];
    expect(presentRooms(source)[0].photos).toEqual([]);
  });

  it('suppresses non-approved media and keeps nested room photography correctly associated', () => {
    const source = listing(); source.photos = [ {...photo('pending', 101), moderation_status: 'pending'} ];
    source.rooms![0].photos = [photo('nested')];
    expect(presentRooms(source)[0].photos.map(asset => asset.url)).toEqual(['/nested.jpg']);
    expect(classifyListingPhotos(source).some(asset => asset.url === '/pending.jpg')).toBe(false);
  });

  it('renders similar stays as named keyboard controls without unverified stars or zero-rate claims', () => {
    const similar = {...listing(), id: 'similar', title: 'Another stay', price: 0, rating: 4.99, reviewCount: 200};
    const navigate = vi.fn();
    render(<ListingDetailsNew listing={{...listing(), id: 'display-only'}} similarListings={[similar]} onListingClick={navigate} onBack={() => {}} />);
    const card = screen.getByRole('button', {name: 'View Another stay'});
    expect(card.textContent).not.toContain('4.99'); expect(card.textContent).toContain('Price is being prepared');
    card.focus(); expect(document.activeElement).toBe(card); fireEvent.click(card); expect(navigate).toHaveBeenCalledWith(similar);
    expect(screen.getByLabelText('Check-in')).toBeTruthy(); expect(screen.getByLabelText('Check-out')).toBeTruthy();
  });

  it('names the gallery dialog, keeps focus inside and restores the opener', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const source = {...listing(), photos: [], rooms: [], imageUrl: ''};
    const close = vi.fn();
    const view = render(<SanctuaryGalleryModal isOpen onClose={close} listing={source} initialIndex={-1} />);
    const dialog = screen.getByRole('dialog', {name: 'Mixed-price resort photo gallery'});
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(window, {key: 'Tab'});
    expect(dialog.contains(document.activeElement)).toBe(true);
    const controls = within(dialog).getAllByRole('button'); controls.at(-1)!.focus();
    fireEvent.keyDown(window, {key: 'Tab'}); expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(window, {key: 'Escape'}); fireEvent.keyDown(window, {key: 'Escape'}); expect(close).toHaveBeenCalled();
    view.unmount(); expect(document.activeElement).toBe(opener); opener.remove();
  });
});

describe('public availability observation boundary', () => {
  it('accepts only exact listing/window evidence and rejects stale or future timestamps', () => {
    const now = Date.now(), input = observation();
    expect(readAvailabilityObservation(input, windowScope, now)).not.toBeNull();
    for (const patch of [{listingId: 2}, {from: '2026-10-02'}, {observedAt: new Date(now + 1).toISOString()}, {observedAt: new Date(now - PUBLIC_AVAILABILITY_MAX_AGE_MS).toISOString()}]) {
      expect(readAvailabilityObservation({...input, ...patch}, windowScope, now)).toBeNull();
    }
  });

  it('rejects duplicate room IDs, invalid counts, impossible dates and private fields', () => {
    const input = observation();
    for (const rooms of [[{id: 101, available: -1}], [{id: 101, available: 0.5}], [{id: 101, available: 1}, {id: 101, available: 2}], [{id: 101, available: 1, guestName: 'Private'}]]) {
      expect(readAvailabilityObservation({...input, rooms}, windowScope)).toBeNull();
    }
    expect(readAvailabilityObservation({...input, from: '2026-02-30'}, windowScope)).toBeNull();
    expect(readAvailabilityObservation({...input, bookings: []}, windowScope)).toBeNull();
    expect(readAvailabilityObservation({...input, rooms: [{id: 101, available: null}]}, windowScope)?.rooms[0].available).toBeNull();
  });

  it('fences overlapping refreshes and hides evidence immediately when the document becomes hidden', async () => {
    vi.useFakeTimers();
    const pending: ((value: unknown) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => pending.push(resolve))));
    const view = renderHook(() => usePublicAvailability('1', windowScope.from, windowScope.to));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await act(async () => pending[1]({ok: true, json: async () => observation()}));
    expect(view.result.current?.rooms[1].available).toBe(2);
    await act(async () => pending[0]({ok: true, json: async () => ({...observation(), rooms: [{id: 102, available: 99}]})}));
    expect(view.result.current?.rooms[1].available).toBe(2);
    Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'hidden'});
    act(() => { document.dispatchEvent(new Event('visibilitychange')); }); expect(view.result.current).toBeNull();
  });

  it('expires a prior observation even when the next network request never finishes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ok: true, json: async () => observation()}).mockImplementation(() => new Promise(() => {})));
    const view = renderHook(() => usePublicAvailability('1', windowScope.from, windowScope.to));
    await act(async () => {}); expect(view.result.current).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(PUBLIC_AVAILABILITY_MAX_AGE_MS); });
    expect(view.result.current).toBeNull();
  });
});
