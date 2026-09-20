// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OptimizedImage} from '../../components/OptimizedImage';
import {ListingDetailsNew} from '../../components/ListingDetailsNew';
import HostForm from '../../components/HostForm';
import type {Listing} from '../../types';
vi.mock('../../components/AuthContext',()=>({useAuth:()=>({user:null,token:''})}));
vi.mock('../../components/ToastContext',()=>({useToast:()=>({addToast:vi.fn()})}));
vi.mock('../../components/CurrencyContext',()=>({useCurrency:()=>({currency:'INR'})}));
beforeEach(()=>{
 localStorage.clear();window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 vi.stubGlobal('IntersectionObserver',class {observe(){}unobserve(){}disconnect(){}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders missing or failed images without requesting unrelated stock media',()=>{
 const view=render(<OptimizedImage src="" alt="Lake room"/>);expect(view.container.querySelector('img')).toBeNull();
 view.rerender(<OptimizedImage src="/actual-room.jpg" alt="Lake room"/>);fireEvent.error(view.container.querySelector('img')!);
 expect(screen.getByRole('img',{name:'Lake room: image unavailable'})).toBeTruthy();expect(view.container.querySelector('img')).toBeNull();
});
it('keeps a new host draft and its preview free from invented rooms, services, ratings and coordinates',async()=>{
 render(<HostForm onBack={()=>{}} onSuccess={()=>{}}/>);
 await waitFor(()=>expect(localStorage.getItem('hostPreviewListing')).not.toBeNull());
 const preview=JSON.parse(localStorage.getItem('hostPreviewListing')!);
 expect(preview.experience_tags).toEqual([]);expect(preview.price).toBe(0);expect(preview.maxGuests).toBe(0);
 expect(preview.rooms).toEqual([]);expect(preview.photos).toEqual([]);expect(preview.amenities).toEqual([]);
 expect(preview.curated_guidelines).toEqual([]);expect(preview.concierge_privileges).toBe('');
 expect(preview.rating).toBeUndefined();expect(preview.isVerified).toBe(false);expect(preview.lat).toBeUndefined();expect(preview.lng).toBeUndefined();
});
it('discards a previous property refresh even if its response arrives after switching properties',async()=>{
 let resolveFirst!:(value:unknown)=>void;
 const fetcher=vi.fn().mockImplementation((url:string)=>url==='/api/listings/10'?new Promise(resolve=>{resolveFirst=resolve;}):Promise.resolve({ok:true,json:async()=>({rooms:[]})}));vi.stubGlobal('fetch',fetcher);
 const listing=(id:number,title:string)=>({id,title,price:1000,type:'Villa',currency:'INR',imageUrl:'',imageUrls:[],imageCount:0,isVerified:false} as unknown as Listing);
 const view=render(<ListingDetailsNew listing={listing(10,'First property')} onBack={()=>{}}/>);
 view.rerender(<ListingDetailsNew listing={listing(11,'Second property')} onBack={()=>{}}/>);
 await act(async()=>resolveFirst({ok:true,json:async()=>listing(10,'Late first property')}));
 expect(view.container.textContent).toContain('Second property');expect(view.container.textContent).not.toContain('Late first property');
 expect(fetcher.mock.calls.find(call=>call[0]==='/api/listings/10')?.[1].signal.aborted).toBe(true);
});
