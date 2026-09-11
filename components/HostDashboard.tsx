import React, { useState, useEffect, Suspense, lazy } from 'react';
import { SEO } from './SEO';
import HostForm from './HostForm';
import HostCalendar from './HostCalendar';
import InboxPage from './InboxPage';
import { Listing, Experience } from '../types';
import { DashboardListingSkeleton, ReservationSkeleton } from './Skeletons';
import { MapPin, Users, Calendar as CalendarIcon, DollarSign, Activity, Settings, Video, Loader2 } from 'lucide-react';
import { useCurrency } from './CurrencyContext';
import { HostOverview } from './HostOverview';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { PropertyReviewQueue } from './PropertyReviewQueue';
import { HostPropertyCards } from './HostPropertyCards';
import { LayoutDashboard, Building2, MessageSquare, Megaphone, ChartNoAxesCombined, CalendarDays } from 'lucide-react';

const HostMarketing = lazy(() => import('./HostMarketing'));

interface HostDashboardProps {
  view: 'today' | 'calendar' | 'listings' | 'messages' | 'analytics' | 'marketing';
  onViewChange?: (view: HostDashboardProps['view']) => void;
  user: any;
  onNavigateToHostForm?: () => void;
  onEditListing?: (listing: Listing) => void;
  onNavigateToExperienceForm?: () => void;
  onEditExperience?: (experience: Experience) => void;
  refreshTrigger?: number;
}

export default function HostDashboard({ view, onViewChange, user, onNavigateToHostForm, onEditListing, onNavigateToExperienceForm, onEditExperience, refreshTrigger = 0 }: HostDashboardProps) {
  const { formatPrice } = useCurrency();
  const [listings, setListings] = useState<Listing[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [listingType, setListingType] = useState<'stays' | 'experiences'>('stays');
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(!!user);
  const [selectedResId, setSelectedResId] = useState<string | number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingReservationId, setPendingReservationId] = useState<string | number | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) { setListings([]); setReservations([]); setExperiences([]); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const loadArray = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
      if (!response.ok) throw new Error(`Could not load your workspace (${response.status}). Please retry.`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('The workspace returned an unexpected response. Please retry.');
      return data;
    };
    
    Promise.all([
      loadArray(`/api/listings?userId=${user.id}`),
      loadArray(`/api/host/reservations?userId=${user.id}`),
      listingType === 'experiences' ? loadArray(`/api/experiences?host_id=${user.id}`) : Promise.resolve([])
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
    .catch(error => {
      if (active && error.name !== 'AbortError') {
        console.error('Host workspace request failed:', error);
        setLoadError(error.message);
        setListings([]); setReservations([]); setExperiences([]);
      }
    })
    .finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; controller.abort(); };
  }, [user?.id, listingType, refreshTrigger, retryCount]);

  useEffect(() => {
    if (selectedResId && view === 'messages') {
      fetch(`/api/messages/${selectedResId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setMessages(data);
        })
        .catch(console.error);
    }
  }, [selectedResId, view]);

  const updateReservationStatus = async (id: string | number, status: string) => {
     if (pendingReservationId !== null) return;
     setPendingReservationId(id);
     setLoadError(null);
     try {
       const res = await fetch(`/api/host/reservations/${id}/status`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
         body: JSON.stringify({ status })
       });
       if (res.ok) {
         setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
       } else throw new Error('The reservation could not be updated. Refresh and try again.');
     } catch (e) {
       console.error('Failed to update reservation status:', e);
       setLoadError(e instanceof Error ? e.message : 'The reservation could not be updated.');
     } finally {
       setPendingReservationId(null);
     }
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !selectedResId) return;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
           bookingId: selectedResId,
           senderId: user.id,
           content: msgInput.trim()
        })
      });
      if (res.ok) {
        const newMsg = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) } as any;
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
      return <HostOverview name={user?.name} listings={listingType === 'stays' ? listings : experiences as unknown as Listing[]} reservations={filteredReservations}
        loading={loading} error={loadError} onRetry={() => setRetryCount(value => value + 1)}
        onCreate={listingType === 'stays' ? onNavigateToHostForm : onNavigateToExperienceForm} onMarketing={() => onViewChange?.('marketing')}
        onUpdate={updateReservationStatus} pendingId={pendingReservationId} formatPrice={formatPrice} />;
    }

    if (view === 'calendar') {
       return <HostCalendar listings={listingType === 'stays' ? listings : experiences as any} reservations={filteredReservations} />;
    }

    if (view === 'listings') {
        return (
           <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 flex flex-col pb-40">
               <div className="flex items-center justify-between mb-8">
                   <h1 className="text-3xl md:text-5xl font-bold text-gray-900 tracking-tight">Your listings</h1>
                   <button type="button" aria-label={listingType === 'stays' ? 'Add a property' : 'Add an experience'} onClick={listingType === 'stays' ? onNavigateToHostForm : onNavigateToExperienceForm} className="w-12 h-12 bg-gray-900 hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors shadow-lg">
                       <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                   </button>
               </div>
               
               {listingType === 'stays' && <PropertyReviewQueue onResume={onEditListing} />}
               {loading ? (
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {[1, 2, 3, 4].map(n => <DashboardListingSkeleton key={n} />)}
                   </div>
               ) : listingType === 'stays' ? (
                   <HostPropertyCards listings={listings} onEdit={onEditListing} onDeleted={id => setListings(previous => previous.filter(listing => String(listing.id) !== id))} />
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

    if (view === 'marketing') {
        return (
            <div className="w-full">
                <Suspense fallback={
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-sky-500 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
                        <p className="text-sm font-semibold text-gray-700">Loading Campaign Reactor Core...</p>
                    </div>
                }>
                    <HostMarketing user={user} listings={listings} />
                </Suspense>
            </div>
        );
    }

    return null;
  };

  return (
    <>
      <SEO title="Host Dashboard | Encho Space" description="Manage your properties, experiences, and reservations." />
    <div className="workspace-shell">
       {onViewChange && <WorkspaceNavigation role="Host" active={view} onSelect={id => onViewChange(id as HostDashboardProps['view'])} items={[
         { id: 'today', label: 'Overview', icon: LayoutDashboard, count: reservations.filter(r => r.status?.toLowerCase() === 'pending').length },
         { id: 'listings', label: 'Properties', icon: Building2 },
         { id: 'calendar', label: 'Calendar', icon: CalendarDays },
         { id: 'messages', label: 'Inbox', icon: MessageSquare },
         { id: 'marketing', label: 'Marketing', icon: Megaphone },
         { id: 'analytics', label: 'Performance', icon: ChartNoAxesCombined },
       ]} />}
       <div className="workspace-body">
       {/* Global Toggle for Host */}
       <div className="w-full flex justify-center py-4 bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
          <div className="flex bg-gray-100 p-1 rounded-full relative">
             <button onClick={() => setListingType('stays')} className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${listingType === 'stays' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Hosting Stays</button>
             <button onClick={() => setListingType('experiences')} className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${listingType === 'experiences' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Hosting Experiences</button>
          </div>
       </div>
       {view !== 'today' && loadError && <div className="workspace-error mx-4 mt-4" role="alert"><span>{loadError}</span><button type="button" onClick={() => setRetryCount(value => value + 1)}>Retry</button></div>}
       {renderView()}
       </div>
    </div>
    </>
  );
}
