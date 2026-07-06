import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { AdminSEOTab } from './AdminSEOTab';
import { Listing } from '../types';
import { HomeIcon, ListIcon,  TrashIcon, EditIcon, CheckCircle2Icon, UserIcon } from './Icons';
import { Map, Compass, MoreHorizontal, Edit3 } from 'lucide-react';
import { useAuth, User } from './AuthContext';
import AdminInbox from './AdminInbox';
import { AdminExperiences } from './AdminExperiences';
import { useToast } from './ToastContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface AdminDashboardProps {
  onBack: () => void;
  onEditListing?: (listing: Listing) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack, onEditListing }) => {
  const [adminMode, setAdminMode] = useState<'stays' | 'experiences'>('stays');
  const [activeTab, setActiveTab] = useState<'analytics' | 'listings' | 'users' | 'settings' | 'offers' | 'reviews' | 'messages' | 'seo'>('analytics');
  const [editingRoomsListing, setEditingRoomsListing] = useState<Listing | null>(null);
  const [editingRoomsData, setEditingRoomsData] = useState<any[]>([]);

  const openRoomsEditor = (listing: Listing, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingRoomsListing(listing);
      setEditingRoomsData(listing.rooms ? JSON.parse(JSON.stringify(listing.rooms)) : []);
  };

  const saveRoomsData = async () => {
      if (!editingRoomsListing) return;
      try {
          const res = await fetch(`/api/listings/${editingRoomsListing.id}/rooms`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ rooms: editingRoomsData })
          });
          if (res.ok) {
              setListings(prev => prev.map(l => l.id === editingRoomsListing.id ? { ...l, rooms: editingRoomsData } : l));
              setEditingRoomsListing(null);
          } else {
              alert("Failed to update inventory rooms.");
          }
      } catch (err) {
          console.error(err);
          alert("Error saving rooms.");
      }
  };
  const [listings, setListings] = useState<Listing[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [experienceBookings, setExperienceBookings] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ totalListings: 0, totalUsers: 0, totalBookings: 0, revenue: 0, chartData: [], recentTransactions: [] as any[] });
  const [whatsappSettings, setWhatsappSettings] = useState({ enabled: false, number: '' });
  const [callSettings, setCallSettings] = useState({ enabled: false, number: '' });
  const [authorizedExperienceHosts, setAuthorizedExperienceHosts] = useState<string[]>([]);
  const [hostEmailInput, setHostEmailInput] = useState('');
  const [demoSettings, setDemoSettings] = useState({ enabled: false });
  const [savingSettings, setSavingSettings] = useState(false);
  const { token, logout, user } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, [adminMode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [listingsRes, metricsRes, usersRes, whatsappRes, callRes, demoRes, offersRes, reviewsRes, expRes, expBookingsRes, expHostsRes] = await Promise.all([
        fetch('/api/listings?city=all'),
        fetch(`/api/admin/metrics?type=${adminMode}`),
        fetch(`/api/admin/users?type=${adminMode}`, { headers }),
        fetch('/api/settings/whatsapp'),
        fetch('/api/settings/call'),
        fetch('/api/settings/demo_properties'),
        fetch('/api/admin/offers', { headers }),
        fetch(`/api/admin/reviews?type=${adminMode}`, { headers }),
        fetch('/api/experiences'),
        fetch('/api/admin/experience-bookings', { headers }),
        fetch('/api/admin/settings/experience-hosts', { headers })
      ]);
      
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        setListings(data);
      }
      if (expRes.ok) {
        const data = await expRes.json();
        setExperiences(data);
      }
      if (expBookingsRes.ok) {
        const data = await expBookingsRes.json();
        setExperienceBookings(data);
      }
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(prev => ({ ...prev, ...metricsData }));
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data);
        setMetrics(prev => ({ ...prev, totalUsers: data.length }));
      }
      if (whatsappRes.ok) {
        const data = await whatsappRes.json();
        setWhatsappSettings(data);
      }
      if (callRes.ok) {
        const data = await callRes.json();
        setCallSettings(data);
      }
      if (demoRes.ok) {
         const data = await demoRes.json();
         setDemoSettings(data);
      }
      if (expHostsRes.ok) {
         const data = await expHostsRes.json();
         setAuthorizedExperienceHosts(data);
      }
      if (offersRes.ok) {
         const data = await offersRes.json();
         setOffers(data);
      }
      if (reviewsRes.ok) {
         const data = await reviewsRes.json();
         setReviews(data);
      }
    } catch (e) {
      console.error("Failed to fetch admin data", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async (id: number) => {
    if (confirm('Are you sure you want to delete this review?')) {
      try {
        const res = await fetch(`/api/admin/reviews/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setReviews(prev => prev.filter(r => r.id !== id));
        } else {
          alert('Failed to delete review');
        }
      } catch (err) {
        console.error("Delete review error", err);
      }
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await Promise.all([
         fetch('/api/settings/whatsapp', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${token}`
           },
           body: JSON.stringify(whatsappSettings)
         }),
         fetch('/api/settings/call', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${token}`
           },
           body: JSON.stringify(callSettings)
         }),
         fetch('/api/settings/demo_properties', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${token}`
           },
           body: JSON.stringify(demoSettings)
         }),
         fetch('/api/admin/settings/experience-hosts', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${token}`
           },
           body: JSON.stringify({ emails: authorizedExperienceHosts })
         })
      ]);
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteListing = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this listing?')) {
      try {
        const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
        if (res.ok) {
          setListings(prev => prev.filter(l => l.id !== id));
          setMetrics(prev => ({ ...prev, totalListings: prev.totalListings - 1 }));
        } else {
          alert("Failed to delete listing.");
        }
      } catch (err) {
        console.error("Delete error", err);
      }
    }
  };

  const handleEditVideoUrl = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const newUrl = prompt(`Edit Video URL for '${listing.title}':`, listing.video_url || '');
    if (newUrl !== null) {
      try {
        const res = await fetch(`/api/listings/${listing.id}`, { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ videoUrl: newUrl })
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, video_url: newUrl } : l));
        } else {
          alert("Failed to update video URL.");
        }
      } catch (err) {
        console.error("Update error", err);
      }
    }
  };

  const handleEditCoordinates = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const lat = prompt(`Edit Latitude for '${listing.title}':`, String(listing.lat || ''));
    if (lat === null) return;
    const lng = prompt(`Edit Longitude for '${listing.title}':`, String(listing.lng || ''));
    if (lng === null) return;

    try {
      const res = await fetch(`/api/listings/${listing.id}`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) })
      });
      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to update coordinates');
      }
    } catch (e) {
      console.error(e);
      alert('Error updating coordinates');
    }
  };

  const handleEditPrice = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPriceStr = prompt(`Edit Price for '${listing.title}' (Numbers only):`, String(listing.price));
    const newPrice = Number(newPriceStr);
    if (newPriceStr !== null && !isNaN(newPrice)) {
      try {
        const res = await fetch(`/api/listings/${listing.id}`, { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ price: newPrice })
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, price: newPrice } : l));
        } else {
          alert("Failed to update price.");
        }
      } catch (err) {
        console.error("Update error", err);
      }
    }
  };

  const handleEditCapacity = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const guests = prompt(`Edit Max Guests for '${listing.title}':`, String(listing.maxGuests || 2));
    const beds = prompt(`Edit Beds for '${listing.title}':`, String(listing.beds || 1));
    const bedrooms = prompt(`Edit Bedrooms for '${listing.title}':`, String(listing.bedrooms || 1));
    const bathrooms = prompt(`Edit Bathrooms for '${listing.title}':`, String(listing.bathrooms || 1));
    
    if (guests !== null && beds !== null && bedrooms !== null && bathrooms !== null) {
      try {
        const res = await fetch(`/api/listings/${listing.id}`, { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ maxGuests: Number(guests), beds: Number(beds), bedrooms: Number(bedrooms), bathrooms: Number(bathrooms) })
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, maxGuests: Number(guests), beds: Number(beds), bedrooms: Number(bedrooms), bathrooms: Number(bathrooms) } : l));
        } else {
          alert("Failed to update capacity.");
        }
      } catch (err) {
        console.error("Update error", err);
      }
    }
  };

  const handleEditType = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const newType = prompt(`Edit Property Type for '${listing.title}'\n(e.g., Apartment, House, Cabin, etc.):`, listing.type);
    if (newType !== null && newType.trim() !== '') {
      try {
        const res = await fetch(`/api/listings/${listing.id}`, { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ type: newType.trim() })
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, type: newType.trim() } : l));
        } else {
          alert("Failed to update property type.");
        }
      } catch (err) {
        console.error("Update error", err);
      }
    }
  };

  const handleEditAmenities = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentAmenities = listing.amenities ? listing.amenities.join(', ') : '';
    const newAmenitiesStr = prompt(`Edit Amenities for '${listing.title}'\n(Comma separated list, e.g., Wifi, Pool, Kitchen):`, currentAmenities);
    if (newAmenitiesStr !== null) {
      const newAmenities = newAmenitiesStr.split(',').map(a => a.trim()).filter(a => a);
      try {
        const res = await fetch(`/api/listings/${listing.id}`, { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ amenities: newAmenities })
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, amenities: newAmenities } : l));
        } else {
          alert("Failed to update amenities.");
        }
      } catch (err) {
        console.error("Update error", err);
      }
    }
  };

  const handleEditRentalMode = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentMode = listing.rental_mode || 'entire_place';
    const newMode = prompt(`Edit Rental Mode for '${listing.title}'\n(Enter 'entire_place', 'private_rooms', or 'hybrid'):`, currentMode);
    if (newMode !== null && (newMode === 'entire_place' || newMode === 'private_rooms' || newMode === 'hybrid')) {
      try {
        // We reuse the update endpoint since we only have one generic listing update, wait we don't have a rental_mode update yet...
        // Let's create an endpoint in server.ts if it doesn't exist. Oh I'd need to add it to server.ts.
        const res = await fetch(`/api/listings/${listing.id}/mode`, { 
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ rentalMode: newMode })
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === listing.id ? { ...l, rental_mode: newMode as any } : l));
        } else {
          alert("Failed to update rental mode.");
        }
      } catch (err) {
        console.error("Update error", err);
      }
    } else if (newMode !== null) {
      alert("Invalid rental mode. Must be 'entire_place', 'private_rooms', or 'hybrid'.");
    }
  };

  const handleDeleteUser = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this user? All their associated data might be lost.')) {
      try {
        const res = await fetch(`/api/admin/users/${id}`, { 
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setUsers(prev => prev.filter(u => u.id !== Number(id)));
          setMetrics(prev => ({ ...prev, totalUsers: prev.totalUsers - 1 }));
        } else {
          alert("Failed to delete user.");
        }
      } catch (err) {
        console.error("Delete error", err);
      }
    }
  };

  const handleCreateOffer = async () => {
    const title = prompt("Offer Name (e.g. 'Flash Sale 20%'):");
    if (!title) return;
    const discountStr = prompt("Discount Percentage (e.g. '20'):");
    if (!discountStr || isNaN(Number(discountStr))) return;
    
    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title, discountPercentage: Number(discountStr) })
      });
      if (res.ok) {
        const newOffer = await res.json();
        setOffers([newOffer, ...offers]);
      } else {
        alert('Failed to list offer');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteOffer = async (id: number) => {
    if (confirm('Delete this offer?')) {
      try {
        const res = await fetch(`/api/admin/offers/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setOffers(prev => prev.filter(o => o.id !== id));
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col">
          <div className="font-bold text-2xl mb-4 text-red-500">Access Denied</div>
          <button onClick={onBack} className="px-4 py-2 border rounded">Go Back</button>
      </div>
    );
  }

  return (
    <>
      <SEO title="Admin Console | Encho Space" description="Encho Space Administration Console" />
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-b md:border-r border-gray-200 p-4 md:p-6 flex flex-col shrink-0 md:min-h-screen sticky top-0 z-10">
        <div className="font-bold tracking-tight text-xl mb-4 md:mb-10 text-gray-900 leading-none">
          Encho<span className="text-[#0284C7]">Space</span> Admin
        </div>
        
        <nav className="flex overflow-x-auto pb-2 md:pb-0 md:space-y-1 md:flex-col gap-2 md:gap-0 scrollbar-hide">
          <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'analytics' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> Analytics
          </button>
          <button onClick={() => setActiveTab('listings')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'listings' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <ListIcon className="w-4 h-4" /> Properties
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'users' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <UserIcon className="w-4 h-4" /> Users
          </button>
          <button onClick={() => setActiveTab('offers')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'offers' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg> Offers
          </button>
          <button onClick={() => setActiveTab('reviews')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'reviews' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> Reviews
          </button>
          <button onClick={() => setActiveTab('messages')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'messages' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> Messages
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'settings' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             Settings
          </button>
          <button onClick={() => setActiveTab('seo')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'seo' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
             SEO Metadata
          </button>
        </nav>
        
        <div className="mt-4 md:mt-auto pt-4 md:pt-0 border-t md:border-t-0 border-gray-200 shrink-0 flex items-center md:items-stretch">
          <button onClick={onBack} className="w-full md:w-auto px-4 py-2 border border-gray-200 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors whitespace-nowrap">
             Exit to App
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 w-full overflow-x-hidden bg-gray-50/50 relative">
        {/* Global Admin Toggle */}
        <div className="w-full flex justify-center mb-10 sticky top-0 z-20">
          <div className="flex bg-white p-1 rounded-full shadow-sm border border-gray-200 relative backdrop-blur-md">
             <button onClick={() => setAdminMode('stays')} className={`px-8 py-2.5 rounded-full font-bold text-sm transition-all ${adminMode === 'stays' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>Stays Mode</button>
             <button onClick={() => setAdminMode('experiences')} className={`px-8 py-2.5 rounded-full font-bold text-sm transition-all ${adminMode === 'experiences' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}>Experiences Mode</button>
          </div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between mb-6 pb-6 border-b border-gray-200">
           <div className="font-bold tracking-tight text-xl text-gray-900">Admin</div>
           <button onClick={onBack} className="text-sm font-medium text-gray-500 hover:text-gray-900">Exit</button>
        </div>

        <div className="mb-8">
           <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
             {activeTab === 'analytics' ? 'Analytics Overview' : activeTab === 'listings' ? (adminMode === 'stays' ? 'Properties' : 'Experiences') : activeTab === 'users' ? 'Users' : activeTab === 'offers' ? 'Offers' : activeTab === 'reviews' ? 'Reviews' : activeTab === 'messages' ? 'Messages' : 'Settings'}
           </h1>
           <p className="text-gray-500 text-sm">
             {activeTab === 'analytics' ? 'Platform insights and revenue metrics' : activeTab === 'listings' ? (adminMode === 'stays' ? 'Manage all spaces across the platform' : 'Manage platform experiences') : activeTab === 'users' ? 'Manage customers and hosts' : activeTab === 'offers' ? 'Manage platform offers' : activeTab === 'reviews' ? 'Manage property reviews' : activeTab === 'messages' ? 'Manage platform messages' : 'Manage global settings'}
           </p>
        </div>

        {/* Metrics Bar */}
        {(activeTab === 'analytics' || activeTab === 'listings' || activeTab === 'users') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
               <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                  <span className="text-gray-500 text-sm font-medium mb-1">Total Revenue</span>
                  <span className="text-3xl font-bold text-gray-900">${metrics.revenue.toLocaleString()}</span>
                  <span className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                      All time
                  </span>
               </div>
               <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                  <span className="text-gray-500 text-sm font-medium mb-1">Total Bookings</span>
                  <span className="text-3xl font-bold text-gray-900">{metrics.totalBookings}</span>
               </div>
               <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                  <span className="text-gray-500 text-sm font-medium mb-1">Active Properties</span>
                  <span className="text-3xl font-bold text-gray-900">{metrics.totalListings}</span>
               </div>
               <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                  <span className="text-gray-500 text-sm font-medium mb-1">Registered Users</span>
                  <span className="text-3xl font-bold text-gray-900">{metrics.totalUsers}</span>
               </div>
            </div>
        )}

        {/* Data Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              {activeTab === 'analytics' ? (
                <div className="p-4 md:p-8 pb-12 space-y-12 bg-white">
                   <div className="space-y-6">
                       <div>
                           <h2 className="text-xl font-bold text-gray-900">Revenue Overview</h2>
                           <p className="text-sm text-gray-500">Monthly confirmed revenue trajectory</p>
                       </div>
                       <div className="w-full h-[350px] bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                           <ResponsiveContainer width="100%" height="100%">
                               <AreaChart data={metrics.chartData}>
                                   <defs>
                                       <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                           <stop offset="5%" stopColor="#0284C7" stopOpacity={0.3} />
                                           <stop offset="95%" stopColor="#0284C7" stopOpacity={0} />
                                       </linearGradient>
                                   </defs>
                                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(val) => `$${val}`} dx={-10} />
                                   <Tooltip 
                                       contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                       formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Revenue']}
                                   />
                                   <Area type="monotone" dataKey="revenue" stroke="#0284C7" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                               </AreaChart>
                           </ResponsiveContainer>
                       </div>
                   </div>

                   <div className="space-y-6 pt-6 border-t border-gray-100">
                       <div>
                           <h2 className="text-xl font-bold text-gray-900">Booking Volume</h2>
                           <p className="text-sm text-gray-500">Number of confirmed bookings per month</p>
                       </div>
                       <div className="w-full h-[300px] bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                           <ResponsiveContainer width="100%" height="100%">
                               <BarChart data={metrics.chartData} barSize={40}>
                                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} allowDecimals={false} dx={-10} />
                                   <Tooltip 
                                       cursor={{ fill: '#F3F4F6' }}
                                       contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                   />
                                   <Bar dataKey="bookings" fill="#10B981" radius={[6, 6, 0, 0]} />
                               </BarChart>
                           </ResponsiveContainer>
                       </div>
                   </div>

                   {/* Recent Transactions List */}
                   <div className="space-y-6 pt-6 border-t border-gray-100">
                       <div>
                           <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>
                           <p className="text-sm text-gray-500">Latest confirmed bookings across the platform</p>
                       </div>
                       <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                           <div className="overflow-x-auto">
                               <table className="w-full text-left text-sm whitespace-nowrap">
                                   <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                       <tr>
                                           <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Property</th>
                                           <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Guest</th>
                                           <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Date</th>
                                           <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider text-right">Revenue</th>
                                       </tr>
                                   </thead>
                                   <tbody className="divide-y divide-gray-100">
                                       {metrics.recentTransactions.length === 0 ? (
                                           <tr>
                                               <td colSpan={4} className="px-6 py-8 text-center text-gray-400">No recent transactions found.</td>
                                           </tr>
                                       ) : (
                                           metrics.recentTransactions.map((tx: any) => (
                                               <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors pointer-events-none">
                                                   <td className="px-6 py-4 font-medium text-gray-900 max-w-[200px] truncate">{tx.listing_title}</td>
                                                   <td className="px-6 py-4 text-gray-600">{tx.name}</td>
                                                   <td className="px-6 py-4 text-gray-500">{new Date(tx.created_at).toLocaleDateString()}</td>
                                                   <td className="px-6 py-4 text-emerald-600 font-bold text-right">${parseFloat(tx.total_rent).toLocaleString()}</td>
                                               </tr>
                                           ))
                                       )}
                                   </tbody>
                               </table>
                           </div>
                       </div>
                   </div>
                </div>
              ) : activeTab === 'listings' ? (
                adminMode === 'stays' ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                   <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                   <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                      <tr>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Property</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Location</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Mode</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Price/Mo</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Status</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider text-right">Actions</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100 align-middle">
                      {loading ? (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading directory...</td></tr>
                      ) : listings.length === 0 ? (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No properties found.</td></tr>
                      ) : (
                          listings.map(listing => (
                              <tr key={listing.id} className="hover:bg-gray-50/50 transition-colors group">
                                  <td className="px-6 py-4">
                                     <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200/50 relative">
                                          {(listing.imageUrls && listing.imageUrls.length > 0) ? (
                                             <img src={`${listing.imageUrls[0]}?w=100&h=100&fit=crop`} alt="" className="w-full h-full object-cover" />
                                          ) : (
                                             <img src={`${listing.imageUrl}?w=100&h=100&fit=crop`} alt="" className="w-full h-full object-cover" />
                                          )}
                                        </div>
                                        <div className="font-semibold text-gray-900 max-w-[200px] truncate">{listing.title}</div>
                                     </div>
                                  </td>
                                  <td className="px-6 py-4 text-gray-600 truncate max-w-[150px]">{listing.city}</td>
                                  <td className="px-6 py-4">
                                      {listing.rental_mode === 'private_rooms' ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-700">
                                              Private Rooms {listing.rooms?.length ? `(${listing.rooms.length})` : ''}
                                          </span>
                                      ) : listing.rental_mode === 'hybrid' ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700">
                                              Hybrid {listing.rooms?.length ? `(${listing.rooms.length} Rooms)` : ''}
                                          </span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-700">
                                              Entire Place
                                          </span>
                                      )}
                                  </td>
                                  <td className="px-6 py-4 font-medium text-gray-900">₹{listing.price.toLocaleString()}</td>
                                  <td className="px-6 py-4">
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700">
                                         <CheckCircle2Icon className="w-3.5 h-3.5" /> Active
                                      </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex justify-end items-center gap-2">
                                          <button onClick={(e) => handleEditPrice(listing, e)} title="Edit Price" className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
                                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                          </button>
                                          <button onClick={(e) => handleEditCapacity(listing, e)} title="Edit Capacity" className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                          </button>
                                          <button onClick={(e) => handleEditType(listing, e)} title="Edit Type" className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors">
                                             <Map className="w-4 h-4" />
                                          </button>
                                          <button onClick={(e) => handleEditAmenities(listing, e)} title="Edit Amenities" className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
                                             <CheckCircle2Icon className="w-4 h-4" />
                                          </button>
                                          <button onClick={(e) => handleEditRentalMode(listing, e)} title="Edit Rental Mode" className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors">
                                             <HomeIcon className="w-4 h-4" />
                                          </button>
                                          <button onClick={(e) => handleEditCoordinates(listing, e)} title="Edit Coordinates" className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors">
                                             <Compass className="w-4 h-4" />
                                          </button>
                                          <button onClick={(e) => handleEditVideoUrl(listing, e)} title="Edit Video URL" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                             <EditIcon className="w-4 h-4" />
                                          </button>
                                          <button onClick={(e) => handleDeleteListing(listing.id, e)} title="Delete" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                              <TrashIcon className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))
                      )}
                   </tbody>
                </table>
               </div>
            </div>
              ) : (
                <div className="flex flex-col gap-6">
                    <AdminExperiences token={token!} />
                    
                    <h2 className="text-xl font-bold mt-8">Experience Bookings</h2>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                       <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                        <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                           <tr>
                              <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Guest</th>
                              <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Experience</th>
                              <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Tickets</th>
                              <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Revenue</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 align-middle">
                           {experienceBookings.length === 0 ? (
                               <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No bookings found.</td></tr>
                           ) : (
                               experienceBookings.map(b => (
                                   <tr key={b.id} className="hover:bg-gray-50/50 transition-colors group">
                                       <td className="px-6 py-4 font-semibold text-gray-900">{b.name} <br/><span className="text-xs text-gray-500">{b.phone}</span></td>
                                       <td className="px-6 py-4 text-gray-600">{b.title} <br/><span className="text-xs text-gray-500">{new Date(b.start_date).toLocaleDateString()}</span></td>
                                       <td className="px-6 py-4 font-medium text-gray-900">{b.num_tickets}</td>
                                       <td className="px-6 py-4 font-bold text-emerald-600">₹{Number(b.total_price).toLocaleString()}</td>
                                   </tr>
                               ))
                           )}
                        </tbody>
                    </table>
                   </div>
                 </div>
                </div>
              )
              ) : activeTab === 'users' ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                   <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                   <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                      <tr>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">User ID</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Name</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Email</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider">Role</th>
                         <th className="px-6 py-4 font-semibold uppercase text-xs tracking-wider text-right">Actions</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100 align-middle">
                      {loading ? (
                          <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Loading directory...</td></tr>
                      ) : users.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No users found.</td></tr>
                      ) : (
                          users.map(u => (
                              <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                                  <td className="px-6 py-4">{u.id}</td>
                                  <td className="px-6 py-4 font-semibold text-gray-900">{u.name}</td>
                                  <td className="px-6 py-4 text-gray-600">{u.email}</td>
                                  <td className="px-6 py-4">
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                                         {u.role}
                                      </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex justify-end items-center gap-2">
                                          <button onClick={(e) => handleDeleteUser(String(u.id), e)} disabled={u.role === 'admin'} title="Delete" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50">
                                              <TrashIcon className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))
                      )}
                   </tbody>
                  </table>
                 </div>
                </div>
              ) : activeTab === 'offers' ? (
                 <div className="p-6 max-w-3xl">
                    <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                       <h2 className="text-xl font-bold text-gray-900">Platform Offers</h2>
                       <button onClick={handleCreateOffer} className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors">
                          + Create Offer
                       </button>
                    </div>
                    
                    <div className="space-y-4">
                       {offers.map(offer => (
                          <div key={offer.id} className="flex items-center justify-between p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
                             <div>
                                <div className="font-bold text-lg text-gray-900 mb-1">{offer.title}</div>
                                <div className="text-sm font-bold text-[#0284C7] bg-[#0284C7]/10 inline-block px-2.5 py-1 rounded-md">{offer.discount_percentage}% OFF</div>
                             </div>
                             <button onClick={() => handleDeleteOffer(offer.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg">
                                <TrashIcon className="w-5 h-5" />
                             </button>
                          </div>
                       ))}
                       {offers.length === 0 && (
                           <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm">
                               No offers created yet.<br/>Create offers for hosts to apply to their listings.
                           </div>
                       )}
                    </div>
                 </div>
              ) : activeTab === 'reviews' ? (
                 <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">Property Reviews</h2>
                    <div className="space-y-4 max-w-4xl">
                        {reviews.map(review => (
                            <div key={review.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start justify-between gap-6 hover:shadow-md transition-shadow">
                                <div>
                                    <h3 className="font-bold text-gray-900 mb-1 leading-tight">{review.listing_title}</h3>
                                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                                        <span className="font-medium text-gray-900">{review.user_name}</span>
                                        <span>•</span>
                                        <span>{new Date(review.created_at).toLocaleDateString()}</span>
                                        <span>•</span>
                                        <span className="flex items-center text-yellow-600 font-bold bg-yellow-50 px-1.5 py-0.5 rounded text-xs">⭐ {review.rating}</span>
                                    </div>
                                    <p className="text-gray-700">{review.content}</p>
                                </div>
                                <button
                                    onClick={() => handleDeleteReview(review.id)}
                                    className="text-gray-400 hover:text-red-600 transition-colors shrink-0 p-2 hover:bg-red-50 rounded-lg"
                                    title="Delete Review"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        {reviews.length === 0 && (
                            <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm">
                                No reviews have been written yet.
                            </div>
                        )}
                    </div>
                 </div>
              ) : activeTab === 'messages' ? (
                <div className="p-4 md:p-8">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">Platform Messages & Conversations</h2>
                    <AdminInbox adminMode={adminMode} />
                </div>
              ) : activeTab === 'settings' ? (
                <div className="p-4 md:p-8 max-w-2xl space-y-12">
                   <section>
                       <h2 className="text-xl font-bold text-gray-900 mb-6">WhatsApp Redirection Settings</h2>
                       
                       <div className="space-y-6">
                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                             <div>
                                <h3 className="font-semibold text-gray-900 mb-1">Enable Automatic Redirection</h3>
                                <p className="text-sm text-gray-500">Automatically redirect customers to WhatsApp 5 seconds after a booking is complete.</p>
                             </div>
                             <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={whatsappSettings.enabled} onChange={e => setWhatsappSettings(prev => ({ ...prev, enabled: e.target.checked }))} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0284C7]"></div>
                             </label>
                          </div>

                          {whatsappSettings.enabled && (
                              <div className="space-y-2">
                                 <label className="block text-sm font-semibold text-gray-900">Support WhatsApp Number</label>
                                 <input 
                                    type="text"
                                    placeholder="e.g. 1234567890"
                                    value={whatsappSettings.number}
                                    onChange={e => setWhatsappSettings(prev => ({ ...prev, number: e.target.value }))}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all"
                                 />
                                 <p className="text-xs text-gray-500 mt-1">Include country code without '+' or '00'. Example: 447123456789 for UK.</p>
                              </div>
                          )}
                       </div>
                   </section>

                   <section>
                       <h2 className="text-xl font-bold text-gray-900 mb-6">Call Settings</h2>
                       
                       <div className="space-y-6">
                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                             <div>
                                <h3 className="font-semibold text-gray-900 mb-1">Enable Call Button</h3>
                                <p className="text-sm text-gray-500">Allow customers to call the support number from their reservations.</p>
                             </div>
                             <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={callSettings.enabled} onChange={e => setCallSettings(prev => ({ ...prev, enabled: e.target.checked }))} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0284C7]"></div>
                             </label>
                          </div>

                          {callSettings.enabled && (
                              <div className="space-y-2">
                                 <label className="block text-sm font-semibold text-gray-900">Support Phone Number</label>
                                 <input 
                                    type="text"
                                    placeholder="e.g. +447123456789"
                                    value={callSettings.number}
                                    onChange={e => setCallSettings(prev => ({ ...prev, number: e.target.value }))}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all"
                                 />
                                 <p className="text-xs text-gray-500 mt-1">Include country code with '+' (Optional). Example: +44 7123 456789.</p>
                              </div>
                          )}
                       </div>
                   </section>

                   <section>
                       <h2 className="text-xl font-bold text-gray-900 mb-6">Authorized Experience Hosts</h2>
                       
                       <div className="space-y-6">
                          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                             <div className="mb-4">
                                <h3 className="font-semibold text-gray-900 mb-1">Allowed Host Emails</h3>
                                <p className="text-sm text-gray-500">Only emails in this list (and admins) are allowed to host experiences.</p>
                             </div>
                             
                             <div className="flex gap-2 mb-4">
                               <input 
                                  type="email"
                                  placeholder="Enter host email"
                                  value={hostEmailInput}
                                  onChange={e => setHostEmailInput(e.target.value)}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (hostEmailInput.trim() && !authorizedExperienceHosts.includes(hostEmailInput.trim())) {
                                              setAuthorizedExperienceHosts([...authorizedExperienceHosts, hostEmailInput.trim()]);
                                              setHostEmailInput('');
                                          }
                                      }
                                  }}
                                  className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all"
                               />
                               <button 
                                  onClick={() => {
                                      if (hostEmailInput.trim() && !authorizedExperienceHosts.includes(hostEmailInput.trim())) {
                                          setAuthorizedExperienceHosts([...authorizedExperienceHosts, hostEmailInput.trim()]);
                                          setHostEmailInput('');
                                      }
                                  }}
                                  className="bg-gray-900 text-white px-4 py-2 rounded-xl font-bold hover:bg-gray-800"
                               >
                                 Add
                               </button>
                             </div>

                             <div className="flex flex-wrap gap-2">
                                {authorizedExperienceHosts.map((email, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-sm text-gray-700">
                                        {email}
                                        <button onClick={() => setAuthorizedExperienceHosts(authorizedExperienceHosts.filter(e => e !== email))} className="text-gray-400 hover:text-red-500 ml-1">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                ))}
                             </div>
                          </div>
                       </div>
                   </section>

                   <div className="pt-4 border-t border-gray-100">
                      <button 
                         onClick={handleSaveSettings}
                         disabled={savingSettings || (whatsappSettings.enabled && !whatsappSettings.number) || (callSettings.enabled && !callSettings.number)}
                         className="bg-[#0284C7] hover:bg-[#c21450] text-white px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                      >
                         {savingSettings ? 'Saving...' : 'Save Settings'}
                      </button>
                   </div>
                </div>
              ) : activeTab === 'seo' ? (
                 <div className="space-y-6 max-w-6xl">
                    <AdminSEOTab items={adminMode === 'stays' ? listings : experiences} type={adminMode === 'stays' ? 'listing' : 'experience'} onSuccess={fetchData} />
                  </div>
              ) : null}
            </div>
        </div>
      </main>
    </div>
    </>
  );
};

export default AdminDashboard;
