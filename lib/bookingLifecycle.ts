export function canTransitionStay(booking: { status?: string; payment_intent_id?: string | null; check_out_date?: string | null }, target: string, today = new Date().toISOString().slice(0, 10)): boolean {
  const current = String(booking.status || '').toLowerCase();
  const next = target.toLowerCase();
  if (!['pending', 'confirmed', 'cancelled', 'declined', 'completed'].includes(next)) return false;
  if (current === next) return true;
  if (['cancelled', 'declined', 'completed'].includes(current)) return false;
  if (current === 'pending') return ['declined', 'cancelled'].includes(next) || (next === 'confirmed' && Boolean(booking.payment_intent_id));
  if (current === 'confirmed') {
    if (next === 'cancelled') return true;
    return next === 'completed' && Boolean(booking.check_out_date && /^\d{4}-\d{2}-\d{2}/.test(booking.check_out_date) && booking.check_out_date.slice(0, 10) <= today);
  }
  return false;
}
