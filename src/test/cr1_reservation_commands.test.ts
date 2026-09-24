import {describe, expect, it, vi} from 'vitest';
import {
  cancellationReceiptSchema, reservationCommandNotice, sendReservationCommand,
  stayBookingReceiptSchema, type ReservationSession,
} from '../../lib/reservationCommands.js';

const session: ReservationSession = {actorId: '12', token: 'session-secret'};
const booking = {
  id: 81, user_id: 12, listing_id: 3, status: 'pending', move_in_date: '2026-10-01',
  check_out_date: '2026-10-03', configuration: 'Garden room', name: 'Guest', phone: '12345',
  total_rent: '2000.00', created_at: '2026-09-24T00:00:00Z',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

function submit(fetcher: typeof fetch, currentSession: () => ReservationSession | null = () => session, online = true) {
  return sendReservationCommand({
    url: '/api/bookings', method: 'POST', body: {listingId: '3'}, session, currentSession, online, fetcher,
    receiptSchema: stayBookingReceiptSchema,
    matches: receipt => receipt.user_id === session.actorId && receipt.listing_id === '3' && receipt.status === 'pending',
  });
}

describe('CR1 online-only reservation command containment', () => {
  it('does not confirm or queue a booking rejected by the production 503 gate', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({code: 'STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE', error: 'private internal error'}, 503));
    const result = await submit(fetcher);
    expect(result).toEqual({status: 'UNAVAILABLE'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reservationCommandNotice('UNAVAILABLE')).not.toContain('private');
  });

  it('never sends an offline request and never automatically retries an ambiguous network result', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('access_token=secret'));
    expect(await submit(fetcher, () => session, false)).toEqual({status: 'OFFLINE'});
    expect(fetcher).not.toHaveBeenCalled();
    expect(await submit(fetcher)).toEqual({status: 'UNKNOWN'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts only a server receipt for the exact actor and property', async () => {
    for (const invalid of [{...booking, user_id: 99}, {...booking, listing_id: 99}, {success: true}, {...booking, id: undefined}]) {
      expect(await submit(vi.fn<typeof fetch>().mockResolvedValue(response(invalid)))).toEqual({status: 'UNKNOWN'});
    }
    const result = await submit(vi.fn<typeof fetch>().mockResolvedValue(response({...booking, access_token: 'not projected'})));
    expect(result).toMatchObject({status: 'COMMITTED', receipt: {id: '81', user_id: '12', listing_id: '3', status: 'pending', total_rent: 2000}});
    expect(JSON.stringify(result)).not.toContain('access_token');
  });

  it('discards a valid receipt after actor or token rotation, including JSON decoding time', async () => {
    let current: ReservationSession | null = session;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      current = {actorId: '19', token: 'another-session'};
      return response(booking);
    });
    expect(await submit(fetcher, () => current)).toEqual({status: 'SESSION_CHANGED'});
    current = session;
    const streamed = response(booking);
    vi.spyOn(streamed, 'json').mockImplementation(async () => {
      current = {actorId: session.actorId, token: 'rotated-token'};
      return booking;
    });
    expect(await submit(vi.fn<typeof fetch>().mockResolvedValue(streamed), () => current)).toEqual({status: 'SESSION_CHANGED'});
  });

  it('does not send under a stale session and includes auth on cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({booking: {...booking, status: 'cancelled'}}));
    expect(await submit(fetcher, () => null)).toEqual({status: 'SESSION_CHANGED'});
    expect(fetcher).not.toHaveBeenCalled();
    const result = await sendReservationCommand({
      url: '/api/user/bookings/81/cancel', method: 'PUT', session, currentSession: () => session,
      receiptSchema: cancellationReceiptSchema,
      matches: receipt => receipt.booking.id === '81' && receipt.booking.user_id === session.actorId,
      fetcher,
    });
    expect(result).toMatchObject({status: 'COMMITTED', receipt: {booking: {id: '81', status: 'cancelled'}}});
    expect(fetcher).toHaveBeenCalledWith('/api/user/bookings/81/cancel', expect.objectContaining({
      method: 'PUT', redirect: 'error', headers: expect.objectContaining({Authorization: 'Bearer session-secret'}),
    }));
  });
});
