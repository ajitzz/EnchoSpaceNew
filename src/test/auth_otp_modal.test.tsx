import React from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const login = vi.fn();
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ login }) }));
vi.mock('@react-oauth/google', () => ({ GoogleLogin: () => null }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useDragControls: () => ({ start: vi.fn() }),
  motion: {
    div: ({ children, onClick, className }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', { onClick, className }, children),
    button: ({ children, disabled, onClick, type, className }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement('button', { disabled, onClick, type, className }, children),
  },
}));

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
};
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://encho.test/login' });
vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
vi.stubGlobal('navigator', dom.window.navigator);
vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
const { AuthModal } = await import('../../components/AuthModal');
const nativeFetch = globalThis.fetch;

afterEach(() => { cleanup(); vi.stubGlobal('fetch', nativeFetch); });
afterAll(() => { vi.unstubAllGlobals(); dom.window.close(); });

describe('phone OTP delivery truth in mounted sign-in', () => {
  it('offers code entry when delivery acknowledgement is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deliveryStatus: 'UNKNOWN', error: 'Delivery status is unknown',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    render(<AuthModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mobile Number' }), { target: { value: '+919199900123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent',
      'We could not confirm WhatsApp delivery. If the code arrives, enter it below.');
    const verify = screen.getByRole('button', { name: 'Verify & Continue' }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Verification Code' }), { target: { value: '123456' } });
    expect(verify.disabled).toBe(false);
  });

  it('does not open code entry after an ordinary send failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Store unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } })));
    render(<AuthModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mobile Number' }), { target: { value: '+919199900124' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));
    expect(await screen.findByText('Store unavailable')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Verification Code' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'I already have a code' }));
    expect(screen.getByRole('textbox', { name: 'Verification Code' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/If a code already arrived/);
  });
});
