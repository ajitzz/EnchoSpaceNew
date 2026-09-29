import {useEffect, useMemo, useState} from 'react';
import {ArrowRight, ChevronLeft, ChevronRight, Eye, Image as ImageIcon} from 'lucide-react';
import type {Listing, SpatialPhoto} from '../types';
import {presentRooms, type PresentedRoom} from '../src/shared/guest/roomPresentation';
import {OptimizedImage} from './OptimizedImage';

interface ListingRoomGalleryProps {
  listing: Listing;
  onOpen: (roomKey: string, index: number) => void;
  selectedRoomKey?: string;
  onSelectRoom?: (roomKey: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  living_room: 'Living room',
  dining: 'Dining',
  bedroom: 'Sleeping space',
  bathroom: 'Bathroom',
  garden: 'Garden',
  exterior: 'Exterior',
  pool: 'Pool',
  details: 'Details',
  balcony: 'Balcony',
  parking: 'Arrival',
  restaurant: 'Restaurant',
  lobby: 'Lobby',
  spa: 'Spa',
  gym: 'Gym',
  activity_area: 'Activity area',
  view: 'View',
  other: 'Room view'
};

const formatPrice = (listing: Listing, price: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: listing.currency || 'INR',
  maximumFractionDigits: 2
}).format(price);

function PhotoTile({
  photo,
  room,
  index,
  className,
  onOpen,
  showCaption = true
}: {
  photo?: SpatialPhoto;
  room: PresentedRoom;
  index: number;
  className: string;
  onOpen: ListingRoomGalleryProps['onOpen'];
  showCaption?: boolean;
}) {
  if (!photo) {
    return (
      <div className={`${className} rounded-3xl border border-zinc-200/80 bg-zinc-50 text-zinc-400 flex flex-col items-center justify-center gap-3 p-6 text-center`}>
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs font-semibold">Room photography is being prepared.</span>
      </div>
    );
  }

  const label = photo.categoryLabel || CATEGORY_LABELS[photo.category || 'other'] || 'Room view';
  return (
    <button
      type="button"
      className={`${className} group relative overflow-hidden rounded-3xl border border-zinc-200/60 bg-zinc-100 text-left shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900`}
      aria-label={`View ${room.room.name} photo ${index + 1}`}
      onClick={() => onOpen(room.key, index)}
    >
      <OptimizedImage
        src={photo.url}
        alt={photo.title || `${room.room.name} photo ${index + 1}`}
        aspectRatio={index === 0 ? '4:3' : '16:9'}
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" aria-hidden="true" />
      {showCaption && <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white md:p-5">
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">{label}</span>
          {(photo.title || photo.description) && (
            <span className="mt-1 block truncate text-sm font-bold md:text-base">{photo.title || photo.description}</span>
          )}
        </span>
        <span className="shrink-0 rounded-full bg-white/15 p-2 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
          <Eye className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>}
    </button>
  );
}

function RoomCollection({
  listing,
  presentedRoom,
  onOpen
}: {
  listing: Listing;
  presentedRoom: PresentedRoom;
  onOpen: ListingRoomGalleryProps['onOpen'];
}) {
  const photos = presentedRoom.photos.slice(0, 4);
  const room = presentedRoom.room;

  if (photos.length === 0) {
    return (
      <article className="grid min-h-[360px] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm md:grid-cols-[1.05fr_.95fr]">
        <div className="flex items-center justify-center bg-zinc-50 p-10 text-center text-zinc-400">
          <div>
            <ImageIcon className="mx-auto h-7 w-7" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold">Room photography is being prepared.</p>
          </div>
        </div>
        <div className="flex flex-col justify-center p-7 md:p-10">
          {room.tag && <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">{room.tag}</p>}
          <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-900 font-display">{room.name}</h3>
          {room.description && <p className="mt-3 text-sm leading-relaxed text-zinc-500">{room.description}</p>}
          {Number.isFinite(room.price) && room.price > 0 && (
            <p className="mt-6 text-lg font-bold text-zinc-900">From {formatPrice(listing, room.price)} <span className="text-xs font-medium text-zinc-500">/ night</span></p>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="grid grid-cols-1 gap-3 md:h-[640px] md:grid-cols-12 md:grid-rows-2 md:gap-4">
      <div className="relative min-h-[390px] md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1 md:min-h-0">
        <PhotoTile photo={photos[0]} room={presentedRoom} index={0} onOpen={onOpen} showCaption={false} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-6 text-white md:p-8">
          {room.tag && <span className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] backdrop-blur-md">{room.tag}</span>}
          <h3 className="mt-3 text-2xl font-extrabold leading-tight font-display">{room.name}</h3>
          {(room.description || room.specs) && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-200">{room.description || room.specs}</p>}
          <div className="mt-5 flex items-center justify-between gap-3">
            {Number.isFinite(room.price) && room.price > 0 ? (
              <span className="text-sm font-bold">From {formatPrice(listing, room.price)} <span className="font-medium text-zinc-300">/ night</span></span>
            ) : <span />}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">Explore photos <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
          </div>
        </div>
      </div>
      <PhotoTile photo={photos[1]} room={presentedRoom} index={1} onOpen={onOpen} className={`${photos[1] ? 'min-h-[230px]' : 'hidden'} md:flex md:col-span-3 md:col-start-1 md:row-start-1 md:min-h-0`} />
      <PhotoTile photo={photos[2]} room={presentedRoom} index={2} onOpen={onOpen} className={`${photos[2] ? 'min-h-[230px]' : 'hidden'} md:flex md:col-span-4 md:col-start-4 md:row-start-1 md:min-h-0`} />
      <PhotoTile photo={photos[3]} room={presentedRoom} index={3} onOpen={onOpen} className={`${photos[3] ? 'min-h-[250px]' : 'hidden'} md:flex md:col-span-7 md:col-start-1 md:row-start-2 md:min-h-0`} />
      {photos.length < 4 && (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-center text-xs font-semibold text-zinc-400 md:hidden">
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          Room photography is being prepared.
        </div>
      )}
    </article>
  );
}

/**
 * Truthful room identity rendered through the original Encho editorial collection layout.
 * Property-wide media is never used as evidence of a particular room.
 */
export function ListingRoomGallery({listing, onOpen, selectedRoomKey, onSelectRoom}: ListingRoomGalleryProps) {
  const rooms = useMemo(() => presentRooms(listing), [listing]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= rooms.length) setActiveIndex(Math.max(0, rooms.length - 1));
  }, [activeIndex, rooms.length]);

  useEffect(() => {
    if (!selectedRoomKey) return;
    const selectedIndex = rooms.findIndex(entry => entry.key === selectedRoomKey);
    if (selectedIndex >= 0) setActiveIndex(selectedIndex);
  }, [rooms, selectedRoomKey]);

  const select = (index: number) => {
    setActiveIndex(index);
    const roomKey = rooms[index]?.key;
    if (roomKey) onSelectRoom?.(roomKey);
  };

  const move = (direction: -1 | 1) => {
    if (rooms.length < 2) return;
    const nextIndex = (activeIndex + direction + rooms.length) % rooms.length;
    select(nextIndex);
  };

  return (
    <section className="space-y-7 border-t border-zinc-200/80 pt-8" aria-label="Rooms and room photography">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">The room collections</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900 font-display md:text-4xl">Our Sanctuary Chambers</h2>
          <p className="mt-1 text-sm font-medium text-zinc-500 md:text-base">Explore the room options and photography supplied by the host.</p>
        </div>

        {rooms.length > 0 && (
          <div className="flex items-center gap-3 self-start md:self-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-4 py-2 text-[11px] font-bold text-zinc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" aria-hidden="true" />
              Collection {String(activeIndex + 1).padStart(2, '0')} / {String(rooms.length).padStart(2, '0')}
            </span>
            <button type="button" onClick={() => move(-1)} disabled={rooms.length < 2} className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 shadow-sm transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous room collection">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => move(1)} disabled={rooms.length < 2} className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white shadow-md transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next room collection">
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center text-zinc-500">Room details are being prepared.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Room collections">
            {rooms.map((entry, index) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={activeIndex === index}
                onClick={() => select(index)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeIndex === index ? 'bg-zinc-900 text-white shadow-sm' : 'border border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
              >
                {String(index + 1).padStart(2, '0')} · {entry.room.name}
              </button>
            ))}
          </div>

          <div className="relative">
            {rooms.map((entry, index) => (
              <div key={entry.key} className={activeIndex === index ? 'block' : 'hidden'} aria-hidden={activeIndex !== index}>
                <RoomCollection listing={listing} presentedRoom={entry} onOpen={onOpen} />
              </div>
            ))}
          </div>

          {rooms.length > 1 && (
            <div className="flex justify-center gap-2" aria-label="Room collection position">
              {rooms.map((entry, index) => (
                <button key={entry.key} type="button" aria-label={`Show room collection ${index + 1}`} onClick={() => select(index)} className={`h-1.5 rounded-full transition-all ${activeIndex === index ? 'w-7 bg-zinc-900' : 'w-2 bg-zinc-300 hover:bg-zinc-400'}`} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
