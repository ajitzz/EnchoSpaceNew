import { describe, expect, it } from 'vitest';
import { evaluateStayAvailability } from '../../lib/stayAvailability';

const base = { roomId: 'garden', inventory: 1, checkIn: '2090-04-01', checkOut: '2090-04-04', reservations: [] };
const stay = (start: string, end: string, room = 'garden') => ({ room_id: room, move_in_date: start, check_out_date: end });
describe('Dated internal room availability', () => {
  it('allows adjacent stays at checkout boundary', () => {
    expect(evaluateStayAvailability({ ...base, reservations: [stay('2090-03-28', '2090-04-01'), stay('2090-04-04', '2090-04-07')] })).toEqual({ state: 'available', remaining: 1 });
  });
  it('uses peak occupancy, not lifetime reservation count', () => {
    expect(evaluateStayAvailability({ ...base, inventory: 2, reservations: [stay('2090-04-01', '2090-04-02'), stay('2090-04-02', '2090-04-04')] })).toEqual({ state: 'available', remaining: 1 });
  });
  it('requires availability for every requested night', () => {
    expect(evaluateStayAvailability({ ...base, reservations: [stay('2090-04-03', '2090-04-04')] })).toEqual({ state: 'unavailable', remaining: 0 });
  });
  it('counts unknown-room legacy reservations conservatively and matches exact comma-separated IDs', () => {
    expect(evaluateStayAvailability({ ...base, reservations: [stay('2090-04-01', '2090-04-04', '')] }).state).toBe('unavailable');
    expect(evaluateStayAvailability({ ...base, reservations: [stay('2090-04-01', '2090-04-04', 'suite, garden')] }).state).toBe('unavailable');
    expect(evaluateStayAvailability({ ...base, reservations: [stay('2090-04-01', '2090-04-04', 'garden-large')] }).state).toBe('available');
  });
  it.each([['2090-04-04', '2090-04-01'], ['2090-04-01', '2090-04-01'], ['2090-04-01junk', '2090-04-04'], ['2090-02-30', '2090-04-04']])('does not ignore malformed legacy history %s–%s', (start, end) => {
    expect(evaluateStayAvailability({ ...base, reservations: [stay(start, end)] }).state).toBe('unknown');
  });
  it('preserves zero stock', () => expect(evaluateStayAvailability({ ...base, inventory: 0 })).toEqual({ state: 'unavailable', remaining: 0 }));
  it.each([-1, 0.5, NaN])('rejects invalid inventory %s', inventory => expect(evaluateStayAvailability({ ...base, inventory }).state).toBe('unknown'));
  it('rejects reversed requested dates', () => expect(evaluateStayAvailability({ ...base, checkOut: '2090-03-31' }).state).toBe('unknown'));
});
