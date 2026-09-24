import React from 'react';
import type {Listing} from '../types';
import {presentRooms} from '../src/shared/guest/roomPresentation';
import {OptimizedImage} from './OptimizedImage';

/** Property-wide media is never presented as evidence of a particular room. */
export function ListingRoomGallery({listing,onOpen}:{listing:Listing;onOpen:(tier:string,index:number)=>void}) {
  return <section className="space-y-8" aria-label="Rooms and room photography">
    <h2 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">Your space to stay</h2>
    {!listing.rooms?.length && <p className="text-zinc-500">Room details are being prepared.</p>}
    {presentRooms(listing).map(({room, key, photos: roomPhotos}) => {
      return <article key={key} className="overflow-hidden rounded-3xl bg-white border border-zinc-200">
        <div className="p-6 md:p-8 flex flex-wrap justify-between gap-4">
          <div><h3 className="text-2xl font-display font-semibold">{room.name}</h3>{room.description && <p className="mt-2 text-zinc-500 max-w-xl">{room.description}</p>}</div>
          {Number.isFinite(room.price) && room.price>0 && <p className="text-lg font-semibold">From {new Intl.NumberFormat('en-IN',{style:'currency',currency:listing.currency || 'INR',maximumFractionDigits:2}).format(room.price)} <span className="text-sm text-zinc-500">/ night</span></p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
          {roomPhotos.slice(0,4).map((photo,index) => <button type="button" key={photo.id || photo.url} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-100 text-left group" aria-label={`View ${room.name} photo ${index+1}`} onClick={()=>onOpen(key,index)}>
            <OptimizedImage src={photo.url} alt={photo.title || `${room.name} photo ${index+1}`} aspectRatio="4:3" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            {(photo.title || photo.description) && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent pt-12 p-5 text-white">{photo.title || photo.description}</span>}
          </button>)}
          {roomPhotos.length<4 && <div className="min-h-40 p-8 rounded-2xl bg-zinc-50 text-zinc-500 flex items-center justify-center">Room photography is being prepared.</div>}
        </div>
      </article>;
    })}
  </section>;
}
