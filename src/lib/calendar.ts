/** Public availability never contains guest, booking, block or owner identities. */
export interface CalendarRoom { id: number; name: string; inventoryCount: number }
export interface CalendarDay {
  roomTypeId: number; date: string; total: number; held: number; booked: number; blocked: number;
  available: number | null; issue: 'LEGACY_BOOKING' | 'UNMAPPED_BLOCK' | 'INVENTORY_DRIFT' | null;
}
export interface PrivateCalendar {
  listingId: number; listingTitle: string; from: string; to: string; observedAt: string;
  rooms: CalendarRoom[]; days: CalendarDay[];
  bookings: { id: number; startDate: string | null; endDate: string | null; guestName: string | null; status: string; totalPrice: string | null }[];
  blocks: { id: number; roomTypeId: number | null; startDate: string; endDate: string; source: string; note: string | null }[];
}
export interface PublicAvailability {
  listingId: number; from: string; to: string; observedAt: string;
  rooms: { id: number; available: number | null }[];
}
