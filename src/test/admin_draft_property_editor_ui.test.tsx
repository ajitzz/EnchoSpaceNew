import React from 'react';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
};
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://encho.test/admin' });
vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
vi.stubGlobal('navigator', dom.window.navigator);
vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { AdminDraftPropertyEditor } = await import('../../components/admin/AdminDraftPropertyEditor.js');

const canonical = {
  id: 42,
  title: 'Wayanad Sanctuary Estate',
  description: 'A mountain estate',
  type: 'Villa',
  city: 'Wayanad',
  address: '123 Forest Road',
  lat: null,
  lng: null,
  max_guests: 4,
  bedrooms: 2,
  beds: 2,
  bathrooms: 2,
  amenities: ['Wi-Fi', 'Pool'],
  publication_status: 'draft'
} as const;

const listing = {
  ...canonical,
  id: '42',
  lat: undefined,
  lng: undefined,
  amenities: [...canonical.amenities],
  price: 3500,
  currency: '₹',
  imageUrl: '',
  imageCount: 0,
  isVerified: false
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

describe('Admin draft property editor', () => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const requests: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    onSaved.mockClear();
    onClose.mockClear();
    requests.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (!init?.method) return json(canonical);
      return json({ listingId: 42, publication_status: 'draft', changedFields: ['title'], auditLogId: 15 });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  it('loads the canonical draft and PATCHes only changed fields with exact expected values', async () => {
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    const title = await screen.findByDisplayValue('Wayanad Sanctuary Estate');
    await waitFor(() => expect(screen.getByRole('button', { name: /save draft changes/i }).hasAttribute('disabled')).toBe(true));
    fireEvent.change(title, { target: { value: 'Wayanad Sanctuary Villa' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft changes/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const patch = requests.find(item => item.init?.method === 'PATCH');
    expect(patch?.url).toBe('/api/admin/listings/42/draft-property');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      title: 'Wayanad Sanctuary Villa',
      expected_current: { title: 'Wayanad Sanctuary Estate' }
    });
    expect(requests[0]?.init?.headers).toEqual({ Authorization: 'Bearer admin-token' });
  });

  it('keeps the editor open on a stale competing edit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method
      ? json({ error: 'This draft changed while you were editing.', code: 'DRAFT_PROPERTY_STALE' }, 409)
      : json(canonical)));
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    const title = await screen.findByDisplayValue('Wayanad Sanctuary Estate');
    fireEvent.change(title, { target: { value: 'Updated title' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft changes/i }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This draft changed while you were editing.');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('deduplicates amenities case-insensitively to match the server contract', async () => {
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.change(screen.getByLabelText(/^Amenities/), { target: { value: 'Wi-Fi, wi-fi, Pool, pool, Breakfast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const patch = requests.find(item => item.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      amenities: ['Wi-Fi', 'Pool', 'Breakfast'],
      expected_current: { amenities: ['Wi-Fi', 'Pool'] }
    });
  });

  it('refuses to edit if the canonical property is no longer a draft', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...canonical, publication_status: 'published' })));
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This property is no longer a draft. A reviewed successor is required.');
    expect(screen.getByRole('button', { name: /save draft changes/i }).hasAttribute('disabled')).toBe(true);
  });

  it('expands advanced facts and PATCHes only their edited fields with exact raw CAS values', async () => {
    const advancedCanonical = {
      ...canonical,
      lat: '11.250',
      lng: '76.125',
      rental_mode: 'entire_place',
      raw_rules: 'Quiet after 10 pm  ',
      seo_title: 'Original SEO',
      seo_description: null,
      seo_keywords: 'Wayanad, villa'
    };
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return init?.method ? json({ listingId: 42, publication_status: 'draft' }) : json(advancedCanonical);
    }));
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    const toggle = screen.getByRole('button', { name: /advanced draft facts/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('admin-advanced-draft-facts');

    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '77.5' } });
    fireEvent.change(screen.getByLabelText('Rental mode'), { target: { value: 'private_rooms' } });
    fireEvent.change(screen.getByLabelText('House rules'), { target: { value: 'Pets by approval' } });
    fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: 'Sanctuary stay in Wayanad' } });
    fireEvent.change(screen.getByLabelText('SEO description'), { target: { value: 'A verified mountain estate.' } });
    fireEvent.change(screen.getByLabelText('SEO keywords'), { target: { value: 'Wayanad, mountain estate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const patch = requests.find(item => item.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      lat: 12.5,
      lng: 77.5,
      rental_mode: 'private_rooms',
      raw_rules: 'Pets by approval',
      seo_title: 'Sanctuary stay in Wayanad',
      seo_description: 'A verified mountain estate.',
      seo_keywords: 'Wayanad, mountain estate',
      expected_current: {
        lat: '11.250',
        lng: '76.125',
        rental_mode: 'entire_place',
        raw_rules: 'Quiet after 10 pm  ',
        seo_title: 'Original SEO',
        seo_description: null,
        seo_keywords: 'Wayanad, villa'
      }
    });
    expect(JSON.parse(String(patch?.init?.body))).not.toHaveProperty('price');
    expect(JSON.parse(String(patch?.init?.body))).not.toHaveProperty('max_guests');
  });

  it('rejects an incomplete coordinate pair before dispatch and accepts the completed pair', async () => {
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /advanced draft facts/i }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '11.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Set both latitude and longitude, or clear both.');
    expect(requests.some(item => item.init?.method === 'PATCH')).toBe(false);
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '181' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Latitude must be between -90 and 90; longitude must be between -180 and 180.');
    expect(requests.some(item => item.init?.method === 'PATCH')).toBe(false);
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '76.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const patch = requests.find(item => item.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      lat: 11.7, lng: 76.1, expected_current: { lat: null, lng: null }
    });
  });

  it('clears both coordinates as null while preserving numeric zero in expected_current', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return init?.method ? json({ listingId: 42, publication_status: 'draft' }) : json({ ...canonical, lat: 0, lng: 0 });
    }));
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /advanced draft facts/i }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const patch = requests.find(item => item.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      lat: null, lng: null, expected_current: { lat: 0, lng: 0 }
    });
  });

  it('clears optional house-rule and search text as null with unmodified raw expected values', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return init?.method ? json({ listingId: 42, publication_status: 'draft' }) : json({ ...canonical, raw_rules: 'No pets  ', seo_title: 'Old page title' });
    }));
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /advanced draft facts/i }));
    fireEvent.change(screen.getByLabelText('House rules'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const patch = requests.find(item => item.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      raw_rules: null,
      seo_title: null,
      expected_current: { raw_rules: 'No pets  ', seo_title: 'Old page title' }
    });
  });

  it('fails closed when the authoritative read omits an edited field needed for CAS', async () => {
    render(<AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /advanced draft facts/i }));
    fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: 'Verified Wayanad stay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft changes' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The current seo title value was not supplied. Reload this property before editing it.');
    expect(requests.some(item => item.init?.method === 'PATCH')).toBe(false);
  });

  it('confirms unsaved discard with keyboard controls and restores focus to the launch button', async () => {
    const Harness = () => {
      const [open, setOpen] = React.useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open draft editor</button>
        {open && <AdminDraftPropertyEditor listing={listing} token="admin-token" onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />}
      </>;
    };
    render(<Harness />);
    const launch = screen.getByRole('button', { name: 'Open draft editor' });
    launch.focus();
    fireEvent.click(launch);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.change(screen.getByLabelText('Property title'), { target: { value: 'Changed draft title' } });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Edit draft property' }), { key: 'Escape' });
    const confirmation = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    const keep = screen.getByRole('button', { name: 'Keep editing' });
    const discard = screen.getByRole('button', { name: 'Discard changes' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(confirmation, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(discard);
    fireEvent.keyDown(confirmation, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByDisplayValue('Changed draft title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit draft property' })).toBeNull());
    expect(document.activeElement).toBe(launch);
    expect(document.body.style.overflow).toBe('');
    expect(requests.some(item => item.init?.method === 'PATCH')).toBe(false);
  });
});
