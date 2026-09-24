import {z} from 'zod';

/** Observation freshness is a display bound, never a hold or availability guarantee. */
export const PUBLIC_AVAILABILITY_MAX_AGE_MS = 60_000;
const date = z.iso.date();
export const publicAvailabilitySchema = z.object({
  listingId: z.number().int().positive().safe(),
  from: date,
  to: date,
  observedAt: z.iso.datetime({offset: true}),
  rooms: z.array(z.object({id: z.number().int().positive().safe(), available: z.number().int().nonnegative().safe().nullable()}).strict()).max(1000),
}).strict().superRefine((value, ctx) => {
  if (value.to <= value.from) ctx.addIssue({code: 'custom', message: 'Invalid stay window'});
  if (new Set(value.rooms.map(room => room.id)).size !== value.rooms.length) ctx.addIssue({code: 'custom', message: 'Duplicate room identity'});
});
export type PublicAvailabilityObservation = z.infer<typeof publicAvailabilitySchema>;

export function isFreshAvailability(value: PublicAvailabilityObservation, now: number): boolean {
  const age = now - Date.parse(value.observedAt);
  return Number.isFinite(age) && age >= 0 && age < PUBLIC_AVAILABILITY_MAX_AGE_MS;
}

export function readAvailabilityObservation(input: unknown, expected: {listingId: number; from: string; to: string}, now = Date.now()): PublicAvailabilityObservation | null {
  const parsed = publicAvailabilitySchema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;
  return value.listingId === expected.listingId && value.from === expected.from && value.to === expected.to && isFreshAvailability(value, now) ? value : null;
}
