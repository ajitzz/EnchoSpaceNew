import { describe, expect, it, vi } from 'vitest';
import { projectCampaignAvailability } from '../server/campaignAvailability';
const listing = { id: 42, rooms: [{ id: 'garden', inventory_count: 2 }] };
const scope = { checkIn: '2090-04-01', checkOut: '2090-04-04', roomIds: ['garden'] };
const reservation = { room_id: 'garden', move_in_date: scope.checkIn, check_out_date: scope.checkOut };
function fixture({ missing = false, blocked = false, bookings = [] as any[], holds = [] as any[] } = {}) {
  const query = vi.fn(async (sql: string, _values?: any[]) => {
    if (sql.includes('to_regclass')) return { rows: [{ relation: missing ? null : 'stay_checkout_orders' }] };
    if (sql.includes('FROM bookings')) return { rows: bookings };
    if (sql.includes('FROM stay_checkout_orders')) return { rows: holds };
    if (sql.includes('FROM calendar_prices')) return { rows: blocked ? [{ status: 'blocked' }] : [] };
    return { rows: [] };
  });
  return { query };
}
describe('Campaign internal availability projection', () => {
  it('accounts for bookings and holds without exposing guest records', async () => {
    const client = fixture({ bookings: [{ ...reservation, name: 'Private guest' }], holds: [reservation] });
    const result = await projectCampaignAvailability(client as any, listing, scope);
    expect(result).toMatchObject({ state: 'unavailable', externalAvailability: 'unknown', deliveryAuthorized: false, rooms: [{ roomId: 'garden', remaining: 0 }] });
    expect(JSON.stringify(result)).not.toContain('Private guest');
    for (const [sql, values] of client.query.mock.calls) if (sql.includes('listing_id=$1')) expect(values?.[0]).toBe(42);
  });
  it('does not interpret missing checkout schema as no holds', async () => {
    const client = fixture({ missing: true });
    expect(await projectCampaignAvailability(client as any, listing, scope)).toMatchObject({ state: 'unknown', rooms: [] });
    expect(client.query.mock.calls.some(([sql]) => sql.includes('FROM bookings'))).toBe(false);
  });
  it('blocks selected nights marked unavailable in the calendar', async () => expect(await projectCampaignAvailability(fixture({ blocked: true }) as any, listing, scope)).toMatchObject({ state: 'unavailable' }));
  it('reports internal stock without authorizing delivery', async () => expect(await projectCampaignAvailability(fixture() as any, listing, scope)).toMatchObject({ state: 'available', deliveryAuthorized: false, rooms: [{ remaining: 2 }] }));
  it('reports unknown for malformed reservation dates', async () => expect(await projectCampaignAvailability(fixture({ bookings: [{ ...reservation, check_out_date: 'bad' }] }) as any, listing, scope)).toMatchObject({ state: 'unknown' }));
  it('reports unknown for missing room IDs', async () => expect(await projectCampaignAvailability(fixture() as any, listing, { ...scope, roomIds: ['missing'] })).toMatchObject({ state: 'unknown' }));
  it('does not query inventory for an invalid saved scope', async () => {
    const client = fixture(); expect(await projectCampaignAvailability(client as any, listing, { ...scope, checkOut: scope.checkIn })).toMatchObject({ state: 'unknown' }); expect(client.query).not.toHaveBeenCalled();
  });
});
