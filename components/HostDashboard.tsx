import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import HostForm from './HostForm';
import HostCalendar from './HostCalendar';
import InboxPage from './InboxPage';
import { Listing, Experience } from '../types';
import { DashboardListingSkeleton, ReservationSkeleton } from './Skeletons';
import { MapPin, Users, Calendar as CalendarIcon, DollarSign, Activity, Settings, Video } from 'lucide-react';
import { useCurrency } from './CurrencyContext';

interface HostDashboardProps {
  view: 'today' | 'calendar' | 'listings' | 'messages' | 'analytics';
  user: any;
  onNavigateToHostForm?: () => void;
  onEditListing?: (listing: Listing) => void;
  onNavigateToExperienceForm?: () => void;
  onEditExperience?: (experience: Experience) => void;
  refreshTrigger?: number;
}

export default function HostDashboard({ view, user, onNavigateToHostForm, onEditListing, onNavigateToExperienceForm, onEditExperience, refreshTrigger = 0 }: HostDashboardProps) {
  const { formatPrice } = useCurrency();
  const [listings, setListings] = useState<Listing[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [listingType, setListingType] = useState<'stays' | 'experiences'>('stays');
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(!!user);
  const [selectedResId, setSelectedResId] = useState<string | number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');

  useEffect(() => {
    let active = true;
    if (!user) return;
    
    Promise.all([
      fetch(`/api/listings?userId=${user.id}&_t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json()),
      fetch(`/api/host/reservations?userId=${user.id}&_t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json()),
      fetch(`/api/experiences?host_id=${user.id}&_t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json())
    ])
    .then(([listingsData, reservationsData, experiencesData]) => {
      if (!active) return;
      const parsedListings = Array.isArray(listingsData) ? listingsData : [];
      const parsedExperiences = Array.isArray(experiencesData) ? experiencesData : [];
      setListings(parsedListings);
      setExperiences(parsedExperiences);
      
      if (parsedListings.length === 0 && parsedExperiences.length > 0) {
        setListingType('experiences');
      }

      const resData = Array.isArray(reservationsData) ? reservationsData : [];
      setReservations(resData);
      if (resData.length > 0 && view === 'messages' && !selectedResId) {
        setSelectedResId(resData[0].id);
      }
    })
    .catch(console.error)
    .finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [user, view, refreshTrigger]);

  useEffect(() => {
    if (selectedResId && view === 'messages') {
      fetch(`/api/messages/${selectedResId}`)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setMessages(data);
        })
        .catch(console.error);
    }
  }, [selectedResId, view]);

  const updateReservationStatus = async (id: string | number, status: string) => {
     try {
       const res = await fetch(`/api/host/reservations/${id}/status`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status })
       });
       if (res.ok) {
         setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
       }
     } catch (e) {
       console.error("Failed to update status");
     }
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !selectedResId) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           bookingId: selectedResId,
           senderId: user.id,
           content: msgInput.trim()
        })
      });
      if (res.ok) {
        const newMsg = await res.json();
        setMessages(prev => [...prev, newMsg]);
        setMsgInput('');
      }
    } catch (e) {
      console.error("Failed to send message", e);
    }
  };

  const renderView = () => {
    // Filter by type: stays vs experiences
    // For reservations, we assigned type: 'stay' | 'experience' in server.ts
    const filteredReservations = reservations.filter(r => r.type === (listingType === 'stays' ? 'stay' : 'experience'));

    if (view === 'today') {
      const pendingRes = filteredReservations.filter(r => r.status === 'pending');
      const upcomingRes = filteredReservations.filter(r => r.status === 'confirmed');

      return (
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col items-center text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-8 tracking-tight">Today</h1>
          
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm w-full max-w-xl mx-auto mb-10 flex items-center justify-between">
            <div className="text-left">
              <p className="text-sm text-gray-500 font-bold tracking-wider uppercase mb-1">Your account</p>
              <h2 className="text-lg font-bold text-gray-900">Confirm your account information</h2>
              <p className="text-gray-500">Required to get paid</p>
            </div>
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-2xl border border-orange-100 shadow-sm relative">
               💼
               <div className="absolute -bottom-1 -right-1 bg-pink-500 text-white rounded-full p-0.5 border-2 border-white">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
               </div>
            </div>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-full mb-12 relative">
              <button className="bg-gray-900 text-white px-6 py-2 rounded-full font-bold text-sm shadow-sm transition-all">Pending ({pendingRes.length})</button>
              <button className="text-gray-600 hover:text-gray-900 px-6 py-2 rounded-full font-bold text-sm transition-colors">Upcoming ({upcomingRes.length})</button>
          </div>

          {loading ? (
              <div className="w-full max-w-2xl mx-auto space-y-4 mt-8">
                 <ReservationSkeleton />
                 <ReservationSkeleton />
                 <ReservationSkeleton />
              </div>
          ) : filteredReservations.length === 0 ? (
            <div className="mt-8 opacity-60">
                <img src="https://cdni.iconscout.com/illustration/premium/thumb/empty-state-2130362-1800926.png" alt="No reservations" className="w-48 h-48 mx-auto mb-6 grayscale opacity-70" />
                <h3 className="text-2xl font-bold text-gray-900 mb-2">You don't have any reservations</h3>
                <p className="text-gray-500 font-medium">Any upcoming reservations will appear here.</p>
            </div>
          ) : (
            <div className="w-full max-w-2xl mx-auto space-y-4 text-left">
              {pendingRes.length > 0 && <h3 className="text-2xl font-bold text-gray-900 mb-6">Pending Approval</h3>}
              {pendingRes.map((res: any, idx: number) => (
                 <div key={res.id} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-md flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
                   <img src={res.listing.imageUrl || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500&q=80'} className="w-24 h-24 rounded-2xl object-cover bg-gray-100" alt="" />
                   <div className="flex-1">
                     <h4 className="text-lg font-bold text-gray-900">{res.listing.title}</h4>
                     <p className="text-sm text-gray-500 font-medium">{res.name} • {res.phone}</p>
                     <p className="text-sm text-gray-700 font-bold mt-2">Move in: {res.moveInDate}</p>
                   </div>
                   <div className="text-right flex flex-col items-end">
                     <p className="text-xl font-bold text-gray-900">${res.totalRent}</p>
                     <p className="text-xs text-yellow-600 font-bold uppercase mt-1 mb-3">Pending</p>
                     <div className="flex gap-2">
                       <button onClick={() => updateReservationStatus(res.id, 'confirmed')} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">Accept</button>
                       <button onClick={() => updateReservationStatus(res.id, 'declined')} className="px-4 py-2 bg-gray-100 text-gray-900 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">Decline</button>
                     </div>
                   </div>
                 </div>
              ))}
              
              {upcomingRes.length > 0 && <h3 className="text-2xl font-bold text-gray-900 mb-6 pt-6">Upcoming Reservations</h3>}
              {upcomingRes.map((res: any, idx: number) => (
                 <div key={res.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-6">
                   <img src={res.listing.imageUrl || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500&q=80'} className="w-24 h-24 rounded-2xl object-cover bg-gray-100" alt="" />
                   <div className="flex-1">
                     <h4 className="text-lg font-bold text-gray-900">{res.listing.title}</h4>
                     <p className="text-sm text-gray-500 font-medium">{res.name} • {res.phone}</p>
                     <p className="text-sm text-gray-700 font-bold mt-2">Move in: {res.moveInDate}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-xl font-bold text-gray-900">${res.totalRent}</p>
                     <p className="text-xs text-green-600 font-bold uppercase mt-1">Confirmed</p>
                     <div className="mt-3 flex flex-col items-end gap-2">
                         <button onClick={() => updateReservationStatus(res.id, 'Completed')} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors">Mark Completed</button>
                         <button onClick={() => updateReservationStatus(res.id, 'cancelled')} className="text-xs text-red-500 font-semibold hover:underline">Cancel booking</button>
                     </div>
                   </div>
                 </div>
              ))}

              {filteredReservations.filter(r => r.status?.toLowerCase() === 'completed').length > 0 && (
                  <>
                    <h3 className="text-2xl font-bold text-gray-900 mb-6 pt-6">Completed</h3>
                    {filteredReservations.filter(r => r.status?.toLowerCase() === 'completed').map((res: any) => (
                        <div key={res.id} className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex flex-col md:flex-row items-center gap-6 opacity-75">
                           <img src={res.listing.imageUrl || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500&q=80'} className="w-16 h-16 rounded-2xl object-cover bg-gray-200 grayscale" alt="" />
                           <div className="flex-1">
                             <h4 className="text-base font-bold text-gray-900">{res.listing.title}</h4>
                             <p className="text-xs text-gray-500 font-medium">{res.name}</p>
                           </div>
                           <div className="text-right">
                             <p className="text-xs text-gray-600 font-bold uppercase">Completed</p>
                           </div>
                        </div>
                    ))}
                  </>
              )}
            </div>
          )}
        </div>
      );
    }

    if (view === 'calendar') {
       return <HostCalendar listings={listingType === 'stays' ? listings : experiences as any} reservations={filteredReservations} />;
    }

    if (view === 'listings') {
        return (
           <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 flex flex-col pb-40">
               <div className="flex items-center justify-between mb-8">
                   <h1 className="text-3xl md:text-5xl font-bold text-gray-900 tracking-tight">Your listings</h1>
                   <button onClick={listingType === 'stays' ? onNavigateToHostForm : onNavigateToExperienceForm} className="w-12 h-12 bg-gray-900 hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors shadow-lg">
                       <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                   </button>
               </div>
               
               {loading ? (
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {[1, 2, 3, 4].map(n => <DashboardListingSkeleton key={n} />)}
                   </div>
               ) : listingType === 'stays' ? (
                   listings.length === 0 ? (
                       <div className="bg-white border text-center p-12 lg:p-24 rounded-3xl text-gray-500 border-dashed w-full max-w-4xl font-medium">
                         You don't have any stays yet. Click the + button to host your space!
                       </div>
                   ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                           {listings.map(listing => (
                              <div key={listing.id} className="group cursor-pointer">
                                  <div className="aspect-square w-full relative mb-3 overflow-hidden rounded-2xl bg-gray-200">
                                      <img src={listing.imageUrl || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500'} alt={listing.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                                  </div>
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <h3 className="font-semibold text-gray-900">{listing.city}</h3>
                                          <p className="text-sm text-gray-500 truncate w-full">{listing.title}</p>
                                          <div className="mt-1 flex items-center gap-1">
                                              <span className="font-semibold">${listing.price}</span>
                                              <span className="text-gray-900">night</span>
                                          </div>
                                      </div>
                                      <div className="flex">
                                          <button onClick={(e) => {
                                              e.stopPropagation();
                                              onEditListing?.(listing);
                                          }} className="p-2 text-gray-400 hover:text-gray-900 transition-colors" title="Edit listing">
                                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                          </button>
                                          <button onClick={(e) => {
                                              e.stopPropagation();
                                              if(confirm('Are you sure you want to delete this listing?')) {
                                                  fetch(`/api/listings/${listing.id}`, { method: 'DELETE' })
                                                  .then(() => setListings(prev => prev.filter(l => l.id !== listing.id)))
                                                  .catch(err => console.error(err));
                                              }
                                          }} className="p-2 -mr-2 text-gray-400 hover:text-red-500 transition-colors" title="Delete listing">
                                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          </button>
                                      </div>
                                  </div>
                              </div>
                           ))}
                       </div>
                   )
               ) : (
                   experiences.length === 0 ? (
                       <div className="bg-white border text-center p-12 lg:p-24 rounded-3xl text-gray-500 border-dashed w-full max-w-4xl font-medium">
                         You don't have any experiences yet. Click the + button to host an experience!
                       </div>
                   ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                           {experiences.map(exp => (
                              <div key={exp.id} className="group cursor-pointer">
                                  <div className="aspect-[4/5] w-full relative mb-3 overflow-hidden rounded-2xl bg-gray-200">
                                      <img src={exp.image_urls?.[0] || 'https://images.unsplash.com/photo-1596423735880-5c6020ce84b4?w=500'} alt={exp.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                                  </div>
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <h3 className="font-semibold text-gray-900 truncate max-w-[200px]">{exp.destination}</h3>
                                          <p className="text-sm text-gray-500 truncate w-full">{exp.title}</p>
                                          <div className="mt-1 flex items-center gap-1">
                                              <span className="font-semibold">${exp.price}</span>
                                              <span className="text-gray-900">/ person</span>
                                          </div>
                                      </div>
                                      <div className="flex">
                                          <button onClick={(e) => {
                                              e.stopPropagation();
                                              onEditExperience?.(exp);
                                          }} className="p-2 text-gray-400 hover:text-gray-900 transition-colors" title="Edit experience">
                                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                          </button>
                                          <button onClick={(e) => {
                                              e.stopPropagation();
                                              if(confirm('Are you sure you want to delete this experience?')) {
                                                  const token = localStorage.getItem('token');
                                                  fetch(`/api/experiences/${exp.id}`, { 
                                                      method: 'DELETE',
                                                      headers: { 'Authorization': `Bearer ${token}` }
                                                  })
                                                  .then(() => setExperiences(prev => prev.filter(e => e.id !== exp.id)))
                                                  .catch(err => console.error(err));
                                              }
                                          }} className="p-2 -mr-2 text-gray-400 hover:text-red-500 transition-colors" title="Delete experience">
                                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          </button>
                                      </div>
                                  </div>
                              </div>
                           ))}
                       </div>
                   )
               )}
           </div>
        );
    }

    if (view === 'messages') {
        return (
           <div className="w-full">
              <InboxPage onBack={() => {}} role="host" />
           </div>
        );
    }

    if (view === 'analytics') {
        const confirmedRes = filteredReservations.filter(r => r.status === 'confirmed' || r.status === 'completed' || r.status === 'Completed');
        const totalEarnings = confirmedRes.reduce((acc, r) => acc + Number(r.totalRent || 0), 0);
        const totalBookings = confirmedRes.length;
        const totalWishlists = listingType === 'stays' 
            ? listings.reduce((acc, l) => acc + (l.wishlist_count || 0), 0)
            : experiences.reduce((acc, e) => acc + (e.wishlist_count || 0), 0);
        
        return (
            <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 animate-fade-in">
                <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-8 tracking-tight">Analytics & Earnings</h1>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center">
                        <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <p className="text-gray-500 font-bold text-sm tracking-wider uppercase mb-2">Total Earnings</p>
                        <h2 className="text-4xl font-extrabold text-gray-900">{formatPrice(totalEarnings, 'INR')}</h2>
                    </div>
                    
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <p className="text-gray-500 font-bold text-sm tracking-wider uppercase mb-2">Bookings</p>
                        <h2 className="text-4xl font-extrabold text-gray-900">{totalBookings}</h2>
                    </div>
                    
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center">
                        <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                        </div>
                        <p className="text-gray-500 font-bold text-sm tracking-wider uppercase mb-2">Active Listings</p>
                        <h2 className="text-4xl font-extrabold text-gray-900">{listingType === 'stays' ? listings.length : experiences.length}</h2>
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center">
                        <div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                        </div>
                        <p className="text-gray-500 font-bold text-sm tracking-wider uppercase mb-2">Wishlist Adds</p>
                        <h2 className="text-4xl font-extrabold text-gray-900">{totalWishlists}</h2>
                    </div>
                </div>
            </div>
        );
    }

    return null;
  };

  return (
    <>
      <SEO title="Host Dashboard | Encho Space" description="Manage your properties, experiences, and reservations." />
    <div className="flex flex-col h-full relative">
       {/* Global Toggle for Host */}
       <div className="w-full flex justify-center py-4 bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
          <div className="flex bg-gray-100 p-1 rounded-full relative">
             <button onClick={() => setListingType('stays')} className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${listingType === 'stays' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Hosting Stays</button>
             <button onClick={() => setListingType('experiences')} className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${listingType === 'experiences' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Hosting Experiences</button>
          </div>
       </div>
       {renderView()}
    </div>
    </>
  );
}

