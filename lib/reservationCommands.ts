import {z} from 'zod';

const idSchema = z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)]).transform(String);
const amountSchema = z.union([z.number(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)])
  .transform(Number).pipe(z.number().finite().nonnegative());
const identitySchema = z.object({
  id: idSchema,
  user_id: idSchema,
  status: z.enum(['pending', 'confirmed', 'cancelled', 'declined', 'completed']),
});

export const stayBookingReceiptSchema = identitySchema.extend({
  listing_id: idSchema,
  move_in_date: z.string().min(10).max(40),
  check_out_date: z.string().min(10).max(40).nullable().optional(),
  configuration: z.string().max(256),
  name: z.string().min(1).max(256),
  phone: z.string().min(1).max(64),
  total_rent: amountSchema,
  created_at: z.iso.datetime({offset: true}),
});
export const experienceBookingReceiptSchema = identitySchema.extend({
  experience_id: idSchema,
  num_tickets: z.number().int().positive(),
  total_price: amountSchema,
  name: z.string().min(1).max(256),
  phone: z.string().min(1).max(64),
  created_at: z.iso.datetime({offset: true}),
});
export const cancellationReceiptSchema = z.object({booking: identitySchema.extend({
  status: z.literal('cancelled'),
})});

export type ReservationSession = Readonly<{actorId: string; token: string}>;
export type ReservationCommandResult<T> =
  | {status: 'COMMITTED'; receipt: T}
  | {status: 'REJECTED' | 'UNAVAILABLE' | 'OFFLINE' | 'UNKNOWN' | 'SESSION_CHANGED'};

export function sameReservationSession(a: ReservationSession | null, b: ReservationSession | null): boolean {
  return a !== null && b !== null && a.actorId === b.actorId && a.token === b.token;
}

export function readReservationSession(): ReservationSession | null {
  try {
    const user = z.object({id: idSchema}).safeParse(JSON.parse(localStorage.getItem('user') || 'null'));
    const token = localStorage.getItem('token');
    return user.success && token ? {actorId: user.data.id, token} : null;
  } catch { return null; }
}

const requestSchema = z.object({
  url: z.string().regex(/^\/api\/(?:bookings|experience-bookings|user\/(?:bookings|experience-bookings)\/[1-9][0-9]*\/cancel)$/),
  method: z.enum(['POST', 'PUT']),
});
const unavailableCodes = new Set([
  'STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE', 'EXPERIENCE_COMMERCE_NOT_RELEASED',
  'CANONICAL_CHECKOUT_REQUIRED', 'SERVER_QUOTE_REQUIRED',
]);

/**
 * Containment for legacy UI callers: exactly one online attempt, no offline
 * persistence/replay and no optimistic booking or cancellation success.
 * Server receipt validation is necessary but does not establish payment capture.
 */
export async function sendReservationCommand<T>(input: {
  url: string;
  method: 'POST' | 'PUT';
  body?: unknown;
  session: ReservationSession;
  currentSession: () => ReservationSession | null;
  receiptSchema: z.ZodType<T>;
  matches: (receipt: T) => boolean;
  online?: boolean;
  fetcher?: typeof fetch;
}): Promise<ReservationCommandResult<T>> {
  const parsedRequest = requestSchema.safeParse(input);
  if (!parsedRequest.success) return {status: 'REJECTED'};
  const request = parsedRequest.data;
  if (!sameReservationSession(input.session, input.currentSession())) return {status: 'SESSION_CHANGED'};
  if (input.online === false) return {status: 'OFFLINE'};
  const stillCurrent = () => sameReservationSession(input.session, input.currentSession());
  try {
    const response = await (input.fetcher ?? fetch)(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.session.token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: 'no-store',
      redirect: 'error',
    });
    if (!stillCurrent()) return {status: 'SESSION_CHANGED'};
    const payload: unknown = await response.json().catch(() => null);
    if (!stillCurrent()) return {status: 'SESSION_CHANGED'};
    if (!response.ok) {
      const code = z.object({code: z.string()}).safeParse(payload);
      if (code.success && unavailableCodes.has(code.data.code)) return {status: 'UNAVAILABLE'};
      return {status: response.status >= 500 ? 'UNKNOWN' : 'REJECTED'};
    }
    const parsed = input.receiptSchema.safeParse(payload);
    if (!parsed.success || !input.matches(parsed.data)) return {status: 'UNKNOWN'};
    return {status: 'COMMITTED', receipt: parsed.data};
  } catch {
    return {status: stillCurrent() ? 'UNKNOWN' : 'SESSION_CHANGED'};
  }
}

export function reservationCommandNotice(status: Exclude<ReservationCommandResult<never>['status'], 'COMMITTED' | 'SESSION_CHANGED'>): string {
  switch (status) {
    case 'OFFLINE': return 'Connect to the internet before submitting. Nothing has been queued.';
    case 'UNAVAILABLE': return 'Online reservations are currently unavailable. No reservation was confirmed.';
    case 'REJECTED': return 'The request was not accepted. Refresh your reservation status before trying again.';
    case 'UNKNOWN': return 'The outcome could not be verified. Check your reservations or contact support before submitting again.';
  }
}
