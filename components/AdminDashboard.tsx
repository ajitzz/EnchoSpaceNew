import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { AdminSEOTab } from './AdminSEOTab';
import { Listing } from '../types';
import { HomeIcon, ListIcon,  TrashIcon, EditIcon, CheckCircle2Icon, UserIcon, XIcon } from './Icons';
import { Map, Compass, MoreHorizontal, Edit3, Megaphone } from 'lucide-react';
import { useAuth, User } from './AuthContext';
import AdminInbox from './AdminInbox';
import { useCurrency } from './CurrencyContext';
import { AdminExperiences } from './AdminExperiences';
import { useToast } from './ToastContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface AdminDashboardProps {
  onBack: () => void;
  onEditListing?: (listing: Listing) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack, onEditListing }) => {
  const { formatPrice } = useCurrency();
  const [adminMode, setAdminMode] = useState<'stays' | 'experiences'>('stays');
  const [activeTab, setActiveTab] = useState<'analytics' | 'listings' | 'users' | 'settings' | 'offers' | 'reviews' | 'messages' | 'seo' | 'marketing'>('analytics');
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
  const [marketingCampaigns, setMarketingCampaigns] = useState<any[]>([]);
  const [rejectingCampaignId, setRejectingCampaignId] = useState<number | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState('');
  const [rejectedFieldInputs, setRejectedFieldInputs] = useState<Record<string, string>>({});
  const [submittingRejection, setSubmittingRejection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ totalListings: 0, totalUsers: 0, totalBookings: 0, revenue: 0, chartData: [], recentTransactions: [] as any[] });
  const [whatsappSettings, setWhatsappSettings] = useState({ enabled: false, number: '' });
  const [callSettings, setCallSettings] = useState({ enabled: false, number: '' });
  const [authorizedExperienceHosts, setAuthorizedExperienceHosts] = useState<string[]>([]);
  const [hostEmailInput, setHostEmailInput] = useState('');
  const [demoSettings, setDemoSettings] = useState({ enabled: false });
  const [paymentRates, setPaymentRates] = useState({ commission_rate: 10, tax_rate: 18, system_fee: 150 });
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
      
      const [listingsRes, metricsRes, usersRes, whatsappRes, callRes, demoRes, offersRes, reviewsRes, expRes, expBookingsRes, expHostsRes, ratesRes, campaignsRes] = await Promise.all([
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
        fetch('/api/admin/settings/experience-hosts', { headers }),
        fetch('/api/settings/payment_rates'),
        fetch('/api/admin/marketing/campaigns', { headers })
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
      if (ratesRes.ok) {
         const data = await ratesRes.json();
         setPaymentRates(data);
      }
      if (campaignsRes.ok) {
         const data = await campaignsRes.json();
         setMarketingCampaigns(data);
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
      await fetch('/api/settings/payment_rates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(paymentRates)
      });
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApproveCampaign = async (id: number) => {
    if (!confirm('Approve this campaign and push live to Meta Ad Network?')) return;
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('Approved', 'Campaign approved and queued for publication on Meta!', 'success');
        setMarketingCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active', approved_at: new Date().toISOString() } : c));
      } else {
        addToast('Error', 'Failed to approve campaign.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'Connection failure during campaign approval.', 'error');
    }
  };

  const handleOpenRejectModal = (id: number) => {
    setRejectingCampaignId(id);
    setRejectionFeedback('');
    setRejectedFieldInputs({});
  };

  const handleConfirmRejectCampaign = async () => {
    if (!rejectingCampaignId) return;
    setSubmittingRejection(true);
    try {
      // Filter out empty input feedback values so we only send actual corrections
      const filteredRejectedFields: Record<string, string> = {};
      Object.entries(rejectedFieldInputs).forEach(([key, value]) => {
        if (value && value.trim()) {
          filteredRejectedFields[key] = value.trim();
        }
      });

      const res = await fetch(`/api/admin/marketing/campaigns/${rejectingCampaignId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          feedback: rejectionFeedback || 'Ad copy or media does not meet Meta policy guidelines.',
          rejected_fields: filteredRejectedFields
        })
      });
      if (res.ok) {
        addToast('Rejected', 'Campaign rejected and host notified with field level feedback.', 'info');
        setMarketingCampaigns(prev => prev.map(c => c.id === rejectingCampaignId ? { 
          ...c, 
          status: 'rejected', 
          admin_feedback: rejectionFeedback || 'Ad copy or media does not meet Meta policy guidelines.',
          rejected_fields: filteredRejectedFields
        } : c));
        setRejectingCampaignId(null);
        setRejectedFieldInputs({});
      } else {
        addToast('Error', 'Failed to reject campaign.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'Connection failure during campaign rejection.', 'error');
    } finally {
      setSubmittingRejection(false);
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
          <button onClick={() => setActiveTab('marketing')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${activeTab === 'marketing' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
             <Megaphone className="w-4 h-4" />
             QC Marketing {marketingCampaigns.filter(c => c.status === 'pending').length > 0 && (
               <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                 {marketingCampaigns.filter(c => c.status === 'pending').length}
               </span>
             )}
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
                                  <td className="px-6 py-4 font-medium text-gray-900">{formatPrice(listing.price, 'INR')}</td>
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
                                       <td className="px-6 py-4 font-bold text-emerald-600">{formatPrice(Number(b.total_price), 'INR')}</td>
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

                   <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Payment & Commission Settings</h2>
                            <p className="text-sm text-gray-500 mt-1">Configure global rates for platform commissions, tax, and system fees applied during checkout.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="space-y-2">
                              <label className="block text-sm font-semibold text-gray-900">Platform Commission (%)</label>
                              <div className="relative">
                                 <input 
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={paymentRates.commission_rate}
                                    onChange={e => setPaymentRates(prev => ({ ...prev, commission_rate: Number(e.target.value) }))}
                                    className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all font-mono font-semibold"
                                 />
                                 <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-500 font-bold">%</div>
                              </div>
                              <p className="text-xs text-gray-400">Charged on top of base listing/experience price.</p>
                           </div>

                           <div className="space-y-2">
                              <label className="block text-sm font-semibold text-gray-900">GST / Tax Rate (%)</label>
                              <div className="relative">
                                 <input 
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={paymentRates.tax_rate}
                                    onChange={e => setPaymentRates(prev => ({ ...prev, tax_rate: Number(e.target.value) }))}
                                    className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all font-mono font-semibold"
                                 />
                                 <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-500 font-bold">%</div>
                              </div>
                              <p className="text-xs text-gray-400">Calculated on subtotal (Base + Commission).</p>
                           </div>

                           <div className="space-y-2">
                              <label className="block text-sm font-semibold text-gray-900">Flat System Fee (₹)</label>
                              <div className="relative">
                                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 font-bold">₹</div>
                                 <input 
                                    type="number"
                                    min="0"
                                    value={paymentRates.system_fee}
                                    onChange={e => setPaymentRates(prev => ({ ...prev, system_fee: Number(e.target.value) }))}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all font-mono font-semibold"
                                 />
                              </div>
                              <p className="text-xs text-gray-400">Flat processing fee added to final checkout total.</p>
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
              ) : activeTab === 'seo' ? (
                  <div className="space-y-6 max-w-6xl">
                     <AdminSEOTab items={adminMode === 'stays' ? listings : experiences} type={adminMode === 'stays' ? 'listing' : 'experience'} onSuccess={fetchData} />
                  </div>
              ) : activeTab === 'marketing' ? (
                 <div className="p-6 space-y-8 max-w-6xl">
                    <div className="bg-gradient-to-r from-sky-900 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
                       <div className="relative z-10 max-w-2xl">
                          <span className="bg-sky-500/20 text-sky-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-sky-500/30">
                             Quality Assurance Engine
                          </span>
                          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-3">
                             Meta & Social Ad Moderation
                          </h2>
                          <p className="text-sky-100/80 text-sm md:text-base mt-2 leading-relaxed">
                             Protect Encho Space's collective Meta Business Manager and pixel assets from suspension. Review ad copy, visual assets, copyright licensing, and guidelines before approving budgets.
                          </p>
                       </div>
                       <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 pointer-events-none hidden md:block">
                          <Megaphone className="w-full h-full rotate-12 animate-pulse" />
                       </div>
                    </div>

                    {/* Stats overview */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Pending Review</span>
                          <span className="text-3xl font-bold text-amber-500">{marketingCampaigns.filter(c => c.status === 'pending').length}</span>
                       </div>
                       <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Active Ad Sets</span>
                          <span className="text-3xl font-bold text-emerald-500">{marketingCampaigns.filter(c => c.status === 'active').length}</span>
                       </div>
                       <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Total Active Ad Budget</span>
                          <span className="text-3xl font-bold text-gray-900">
                             ₹{marketingCampaigns.reduce((sum, c) => sum + (c.status === 'active' ? Number(c.budget) : 0), 0).toLocaleString()}
                          </span>
                       </div>
                    </div>

                    {/* Queue */}
                    <div className="space-y-6">
                       <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                             <span>Campaigns Moderation Queue</span>
                             <span className="text-sm font-normal text-gray-500">({marketingCampaigns.length} total)</span>
                          </h3>
                       </div>

                       {marketingCampaigns.length === 0 ? (
                          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm">
                             <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                             <p className="text-gray-500 font-medium">No marketing campaigns have been created yet.</p>
                             <p className="text-xs text-gray-400 mt-1">Host-submitted campaigns will appear here for review.</p>
                          </div>
                       ) : (
                          <div className="grid grid-cols-1 gap-6">
                             {marketingCampaigns.map((campaign) => (
                                <div key={campaign.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col md:flex-row">
                                   <div className="p-6 flex-1 space-y-4">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                         <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                               <h4 className="text-lg font-bold text-gray-900">{campaign.title}</h4>
                                               <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                  campaign.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                  campaign.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                                  campaign.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                  'bg-gray-100 text-gray-700'
                                               }`}>
                                                  {campaign.status.toUpperCase()}
                                               </span>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                               Property: <span className="font-semibold text-gray-700">{campaign.listing_title}</span> • Host: <span className="font-semibold text-gray-700">{campaign.host_name}</span> ({campaign.host_email})
                                            </p>
                                         </div>
                                         <div className="text-right">
                                            <span className="text-xs text-gray-400 block">Ad Budget</span>
                                            <span className="text-lg font-mono font-bold text-sky-700">₹{campaign.budget.toLocaleString()}</span>
                                         </div>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                      	<div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                      		<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Primary Ad Copy (Description)</span>
                                      		<p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{campaign.description}</p>
                                      	</div>
                                      	<div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                                      		<div>
                                      			<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Bottom Feed Tagline</span>
                                      			<p className="text-sm text-gray-800 font-semibold leading-relaxed">{campaign.feed_description || '—'}</p>
                                      		</div>
                                      		<div>
                                      			<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Target Locations</span>
                                      			<p className="text-xs text-gray-600 leading-relaxed">{campaign.target_locations || '—'}</p>
                                      		</div>
                                      	</div>
                                      </div>

                                      {/* Transaction and Meta API Dispatch Telemetry Info */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs p-4 bg-zinc-50 border border-zinc-200/60 rounded-xl">
                                         <div>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Billing & Transaction Status</span>
                                            <div className="flex items-center gap-1.5">
                                               <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase font-mono border ${
                                                  campaign.payment_status === 'paid' 
                                                     ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                     : 'bg-amber-50 text-amber-700 border-amber-200'
                                               }`}>
                                                  {campaign.payment_status || 'UNPAID'}
                                               </span>
                                               {campaign.payment_gateway && (
                                                  <span className="bg-zinc-100 text-zinc-700 font-bold font-mono px-2 py-0.5 rounded-md border text-[10px] uppercase">
                                                     {campaign.payment_gateway}
                                                  </span>
                                               )}
                                            </div>
                                            {campaign.payment_intent_id && (
                                               <p className="text-[10px] text-gray-500 font-mono font-light mt-1.5">
                                                  Gateway Transaction ID: <span className="font-semibold">{campaign.payment_intent_id}</span>
                                               </p>
                                            )}
                                         </div>

                                         <div>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Meta Ads API Launch Logs</span>
                                            {campaign.meta_campaign_id ? (
                                               <div className="space-y-1">
                                                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                                                     <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                                     <span>Instant API Dispatched Successfully</span>
                                                  </div>
                                                  <p className="text-[10px] text-gray-600 font-mono truncate">
                                                     Meta Ad Account ID: <span className="font-semibold">{campaign.meta_campaign_id}</span>
                                                  </p>
                                               </div>
                                            ) : (
                                               <div className="text-zinc-500 font-light text-[11px] flex items-center gap-1 mt-1">
                                                  <span className="inline-block w-1.5 h-1.5 bg-zinc-400 rounded-full" />
                                                  <span>Awaiting payment success webhook & admin review approval</span>
                                               </div>
                                            )}
                                         </div>
                                      </div>

                                      {(() => {
                                      	let mediaList = [];
                                      	try {
                                      		if (campaign.media_urls) {
                                      			mediaList = typeof campaign.media_urls === 'string' ? JSON.parse(campaign.media_urls) : campaign.media_urls;
                                      		}
                                      	} catch (e) {
                                      		console.error(e);
                                      	}
                                      	if (mediaList && mediaList.length > 0) {
                                      		return (
                                      			<div className="space-y-1">
                                      				<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Campaign Visual Assets ({mediaList.length})</span>
                                      				<div className="flex gap-2 pb-1 overflow-x-auto scrollbar-thin">
                                      					{mediaList.map((url, idx) => (
                                      						<div key={url + idx} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-gray-50">
                                      							<img src={url} alt={`Campaign visual ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      						</div>
                                      					))}
                                      				</div>
                                      			</div>
                                      		);
                                      	}
                                      	return null;
                                      })()}

                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pt-2">
                                      	<div>
                                      		<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Target Platforms</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                               {campaign.platforms && (typeof campaign.platforms === 'string' ? JSON.parse(campaign.platforms) : campaign.platforms).map((plat, index) => (
                                                  <span key={index} className="bg-sky-50 text-sky-700 text-xs font-semibold px-2 py-0.5 rounded-md border border-sky-100">
                                                     {plat.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                                  </span>
                                               ))}
                                            </div>
                                         </div>
										<div>
											<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Creative Ad Format</span>
											<span className="inline-block mt-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-0.5 rounded-md border border-purple-100">
												{(campaign.ad_format || 'post').toUpperCase().replace('_', ' ')}
											</span>
										</div>
                                         {campaign.video_url && (
                                            <div>
                                               <span className="text-xs text-gray-400 block font-medium">Reel / Video Asset</span>
                                               <a href={campaign.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-sky-600 font-semibold hover:underline mt-1.5">
                                                  <span>Watch Reel Asset ({campaign.video_url.length > 30 ? campaign.video_url.substring(0, 30) + '...' : campaign.video_url})</span>
                                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                               </a>
                                            </div>
                                         )}
                                      </div>

                                      {campaign.admin_feedback && (
                                         <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-xs text-red-700">
                                            <strong>Moderator Feedback:</strong> {campaign.admin_feedback}
                                         </div>
                                      )}
                                   </div>

                                   {campaign.status === 'pending' && (
                                      <div className="bg-gray-50 border-t md:border-t-0 md:border-l border-gray-100 p-6 flex flex-row md:flex-col justify-center items-stretch gap-3 shrink-0 min-w-[180px]">
                                         <button 
                                            onClick={() => handleApproveCampaign(campaign.id)}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                                         >
                                            <CheckCircle2Icon className="w-4 h-4" /> Approve
                                         </button>
                                         <button 
                                            onClick={() => handleOpenRejectModal(campaign.id)}
                                            className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2.5 px-4 rounded-xl text-sm border border-red-200 transition-all flex items-center justify-center gap-2"
                                         >
                                            <XIcon className="w-4 h-4" /> Reject
                                         </button>
                                      </div>
                                   )}
                                </div>
                             ))}
                          </div>
                       )}
                    </div>

                    {/* Reject modal overlay */}
                    {rejectingCampaignId !== null && (
                       <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
                             <h4 className="text-xl font-black text-gray-900 mb-1 tracking-tight">Rejection Moderation Feedback</h4>
                             <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                                Choose specific fields to reject and input exact correction reasons to guide the host, along with a general summary.
                             </p>

                             {/* Field level rejectors */}
                             <div className="space-y-3.5 mb-5 border-t border-b border-gray-100 py-4 max-h-[40vh] overflow-y-auto pr-1 text-left">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Field-Level Corrective Directives</span>
                                
                                {[
                                   { id: 'title', label: 'Ad Headline / Title' },
                                   { id: 'description', label: 'Primary Ad Copy' },
                                   { id: 'feed_description', label: 'Ad Feed Tagline' },
                                   { id: 'ad_format', label: 'Creative Format' },
                                   { id: 'target_locations', label: 'Targeting Locations' },
                                   { id: 'video_url', label: 'Video Reel URL' },
                                   { id: 'media', label: 'Creative Visual Media/Images' }
                                ].map((field) => {
                                   const isFieldRejected = rejectedFieldInputs[field.id] !== undefined;
                                   return (
                                      <div key={field.id} className="p-3 border border-gray-150 rounded-2xl space-y-2 bg-zinc-50/50 transition-all text-left">
                                         <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                            <input 
                                               type="checkbox"
                                               checked={isFieldRejected}
                                               onChange={(e) => {
                                                  if (e.target.checked) {
                                                     setRejectedFieldInputs(prev => ({ ...prev, [field.id]: '' }));
                                                  } else {
                                                     setRejectedFieldInputs(prev => {
                                                        const copy = { ...prev };
                                                        delete copy[field.id];
                                                        return copy;
                                                     });
                                                  }
                                               }}
                                               className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                                            />
                                            <span className="text-xs font-bold text-gray-700">{field.label}</span>
                                         </label>

                                         {isFieldRejected && (
                                            <input 
                                               type="text"
                                               required
                                               placeholder={`e.g. Please revise the ${field.id.replace('_', ' ')}...`}
                                               value={rejectedFieldInputs[field.id] || ''}
                                               onChange={(e) => {
                                                  setRejectedFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }));
                                               }}
                                               className="w-full bg-white border border-rose-200 text-xs rounded-xl p-2.5 focus:border-red-500 focus:outline-none focus:bg-rose-50/10 text-red-900 font-medium"
                                            />
                                         )}
                                      </div>
                                   );
                                })}
                             </div>
                             <textarea 
                                value={rejectionFeedback}
                                onChange={(e) => setRejectionFeedback(e.target.value)}
                                placeholder="E.g., Music track violates copyright policies. Please upload an royalty-free or platform-native audio track."
                                className="w-full h-28 p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0284C7] focus:outline-none transition-all text-sm resize-none mb-6"
                             />
                             <div className="flex gap-3 justify-end">
                                <button 
                                   onClick={() => setRejectingCampaignId(null)}
                                   disabled={submittingRejection}
                                   className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors"
                                >
                                   Cancel
                                </button>
                                <button 
                                   onClick={handleConfirmRejectCampaign}
                                   disabled={submittingRejection}
                                   className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
                                >
                                   {submittingRejection ? 'Rejecting...' : 'Submit Rejection'}
                                </button>
                             </div>
                          </div>
                       </div>
                    )}
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
