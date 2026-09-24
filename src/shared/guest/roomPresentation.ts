import type {Listing, Room, SpatialPhoto} from '../../../types';

export interface PresentedRoom {
  /** Local UI identity only: never a booking identifier or a public URL parameter. */
  key: string;
  room: Room;
  canonicalId: number | null;
  photos: SpatialPhoto[];
}

const displayable = (photo: SpatialPhoto) => Boolean(photo.url) && (!photo.moderation_status || photo.moderation_status === 'approved');

/** A classification such as "suites" is not unique room identity. */
export function presentRooms(listing: Pick<Listing, 'rooms' | 'photos'>): PresentedRoom[] {
  const rooms = listing.rooms || [];
  const uniqueId = (room: Room) => Boolean(room.id) && rooms.filter(candidate => String(candidate.id) === String(room.id)).length === 1;
  const matches = (photo: SpatialPhoto, room: Room) => {
    // An explicit foreign key must not be reinterpreted using its display tier.
    if (photo.room_type_id !== undefined && photo.room_type_id !== null) return uniqueId(room) && String(photo.room_type_id) === String(room.id);
    const tier = room.type || room.id;
    return Boolean(tier) && photo.tier === tier && rooms.filter(candidate => (candidate.type || candidate.id) === tier).length === 1;
  };
  return rooms.map((room, index) => {
    const key = uniqueId(room) ? `room-id:${encodeURIComponent(String(room.id))}` : `room-view:${index}`;
    const id = uniqueId(room) && /^[1-9]\d*$/.test(String(room.id)) ? Number(room.id) : NaN;
    const supplied = (listing.photos || []).filter(photo => displayable(photo) && matches(photo, room));
    const nested = (room.photos || []).filter(photo => displayable(photo) && (photo.room_type_id === undefined || photo.room_type_id === null || (uniqueId(room) && String(photo.room_type_id) === String(room.id))));
    return {key, room, canonicalId: Number.isSafeInteger(id) ? id : null, photos: supplied.length ? supplied : nested};
  });
}
