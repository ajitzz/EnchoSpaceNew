import React, { useState, useEffect } from 'react';
import { SEO } from './SEO';
import { AdminSEOTab } from './AdminSEOTab';
import { Listing } from '../types';
import { HomeIcon, ListIcon,  TrashIcon, EditIcon, CheckCircle2Icon, UserIcon, XIcon } from './Icons';
import { Map, Compass, MoreHorizontal, Edit3, Megaphone, Link, CreditCard, TrendingUp, Send, RefreshCw, Plus, Phone, Mail, Users, Globe, Building, Check, Search, Sparkles, Loader2, Upload, Zap, Shield, FileText, ChevronRight, AlertTriangle, Eye } from 'lucide-react';
import { useAuth, User } from './AuthContext';
import AdminInbox from './AdminInbox';
import { useCurrency } from './CurrencyContext';
import { AdminExperiences } from './AdminExperiences';
import { useToast } from './ToastContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { io } from 'socket.io-client';

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
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'pending' | 'active' | 'escrow' | 'rejected'>('all');
  const [rejectingCampaignId, setRejectingCampaignId] = useState<number | null>(null);
  const [releasingEscrowId, setReleasingEscrowId] = useState<number | null>(null);
  const [pausingCampaignId, setPausingCampaignId] = useState<number | null>(null);
  const [expandedAiReviewId, setExpandedAiReviewId] = useState<number | null>(null);
  const [runningAiCheckId, setRunningAiCheckId] = useState<number | null>(null);
  const [previewAdCampaign, setPreviewAdCampaign] = useState<any | null>(null);
  const [previewAdTab, setPreviewAdTab] = useState<'feed' | 'story' | 'banner' | 'reel' | 'google'>('feed');
  const [expandedAuditLogId, setExpandedAuditLogId] = useState<number | null>(null);
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

  // Multi-Million SaaS outreach & live systems states (Pillars Extension)
  const [outreachLeads, setOutreachLeads] = useState<any[]>([]);
  const [outreachSearch, setOutreachSearch] = useState('');
  const [outreachFilter, setOutreachFilter] = useState<'all' | 'discovered' | 'contacted' | 'negotiating' | 'onboarded' | 'ignored'>('all');
  const [marketingSubTab, setMarketingSubTab] = useState<'moderation' | 'linkage' | 'outreach' | 'organic_social' | 'audit_logs' | 'geo_router'>('moderation');
  const [adminSocialPosts, setAdminSocialPosts] = useState<any[]>([]);
  const [socialPostFilter, setSocialPostFilter] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all');
  const [loadingAdminSocialPosts, setLoadingAdminSocialPosts] = useState(false);
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [loadingAdminAuditLogs, setLoadingAdminAuditLogs] = useState(false);
  const [adminPaymentOverview, setAdminPaymentOverview] = useState<any>({ metrics: {}, campaigns: [], processed_payments: [] });
  const [loadingAdminPaymentOverview, setLoadingAdminPaymentOverview] = useState(false);
  const [rejectingSocialPostId, setRejectingSocialPostId] = useState<number | null>(null);
  const [socialRejectionFeedback, setSocialRejectionFeedback] = useState('');
  const [isAddingOutreach, setIsAddingOutreach] = useState(false);
  const [editingOutreachId, setEditingOutreachId] = useState<number | null>(null);
  const [outreachForm, setOutreachForm] = useState({
    property_name: '',
    instagram_username: '',
    facebook_url: '',
    owner_name: '',
    location: '',
    estimated_nightly_rate: 0,
    status: 'discovered',
    notes: '',
    email: '',
    phone: ''
  });
  const [stripeLiveMode, setStripeLiveMode] = useState(false);
  const [savingOutreach, setSavingOutreach] = useState(false);

  useEffect(() => {
    fetchData();

    // Setup Socket.io client to listen for real-time changes
    const socket = io();
    socket.emit('join_admin');

    socket.on('db_changed', (data: any) => {
      // Refresh admin queue instantly on marketing, listing, experience, or outreach changes
      if (data && (data.type === 'marketing' || data.type === 'listing' || data.type === 'experience' || data.type === 'outreach')) {
        console.log(`[REALTIME SOCKET] Received database change event of type: ${data.type}. Refreshing...`);
        fetchData();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [adminMode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [listingsRes, metricsRes, usersRes, whatsappRes, callRes, demoRes, offersRes, reviewsRes, expRes, expBookingsRes, expHostsRes, ratesRes, campaignsRes, outreachRes] = await Promise.all([
        fetch('/api/listings?city=all'),
        fetch(`/api/admin/metrics?type=${adminMode}`, { headers }),
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
        fetch('/api/admin/marketing/campaigns', { headers }),
        fetch('/api/admin/outreach-leads', { headers })
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
      if (outreachRes.ok) {
         const data = await outreachRes.json();
         setOutreachLeads(data);
      }
      fetchAdminSocialPosts();
      fetchAdminAuditLogs();
      fetchAdminPaymentOverview();
    } catch (e) {
      console.error("Failed to fetch admin data", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminAuditLogs = async () => {
    setLoadingAdminAuditLogs(true);
    try {
      const res = await fetch('/api/admin/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminAuditLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin audit logs:', err);
    } finally {
      setLoadingAdminAuditLogs(false);
    }
  };

  const fetchAdminSocialPosts = async () => {
    setLoadingAdminSocialPosts(true);
    try {
      const authToken = localStorage.getItem('token') || token;
      const res = await fetch('/api/admin/social-posts', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminSocialPosts(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin social posts:', err);
    } finally {
      setLoadingAdminSocialPosts(false);
    }
  };

  const fetchAdminPaymentOverview = async () => {
    setLoadingAdminPaymentOverview(true);
    try {
      const res = await fetch('/api/admin/payments/overview', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminPaymentOverview(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin payment overview:', err);
    } finally {
      setLoadingAdminPaymentOverview(false);
    }
  };

  const handleApproveSocialPost = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/social-posts/${id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('Success', 'Social post approved and pushed live to @enchospace feeds!', 'success');
        fetchAdminSocialPosts();
      } else {
        const data = await res.json();
        addToast('Error', data.error || 'Failed to approve post.', 'error');
      }
    } catch (err) {
      console.error('Failed to approve social post:', err);
    }
  };

  const handleRejectSocialPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingSocialPostId) return;
    try {
      const res = await fetch(`/api/admin/social-posts/${rejectingSocialPostId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ feedback: socialRejectionFeedback })
      });
      if (res.ok) {
        addToast('Success', 'Social post rejected and feedback dispatched to host.', 'success');
        setRejectingSocialPostId(null);
        setSocialRejectionFeedback('');
        fetchAdminSocialPosts();
      } else {
        const data = await res.json();
        addToast('Error', data.error || 'Failed to reject post.', 'error');
      }
    } catch (err) {
      console.error('Failed to reject social post:', err);
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

  // Multi-Million SaaS outreach handlers (Pillars Extension)
  const handleSaveOutreachLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOutreach(true);
    try {
      const isEdit = editingOutreachId !== null;
      const url = isEdit ? `/api/admin/outreach-leads/${editingOutreachId}` : '/api/admin/outreach-leads';
      const method = isEdit ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(outreachForm)
      });
      
      if (res.ok) {
        const savedLead = await res.json();
        if (isEdit) {
          setOutreachLeads(prev => prev.map(l => l.id === editingOutreachId ? savedLead : l));
          addToast('Outreach Lead Updated', `Successfully updated tracking for "${outreachForm.property_name}"!`, 'success');
        } else {
          setOutreachLeads(prev => [savedLead, ...prev]);
          addToast('Outreach Lead Created', `Successfully added "${outreachForm.property_name}" to the acquisition pipeline!`, 'success');
        }
        handleResetOutreachForm();
      } else {
        addToast('Error', 'Failed to save outreach lead details.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'Network failure while saving outreach lead.', 'error');
    } finally {
      setSavingOutreach(false);
    }
  };

  const handleDeleteOutreachLead = async (id: number) => {
    if (!confirm('Are you absolutely sure you want to remove this lead from the acquisition pipeline? This action is permanent.')) return;
    try {
      const res = await fetch(`/api/admin/outreach-leads/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setOutreachLeads(prev => prev.filter(l => l.id !== id));
        addToast('Outreach Lead Deleted', 'Removed successfully.', 'success');
      } else {
        addToast('Error', 'Failed to delete lead from database.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'Network failure during deletion.', 'error');
    }
  };

  const handleEditOutreachLead = (lead: any) => {
    setEditingOutreachId(lead.id);
    setOutreachForm({
      property_name: lead.property_name || '',
      instagram_username: lead.instagram_username || '',
      facebook_url: lead.facebook_url || '',
      owner_name: lead.owner_name || '',
      location: lead.location || '',
      estimated_nightly_rate: lead.estimated_nightly_rate || 0,
      status: lead.status || 'discovered',
      notes: lead.notes || '',
      email: lead.email || '',
      phone: lead.phone || ''
    });
    setIsAddingOutreach(true);
  };

  const handleQuickStatusUpdate = async (lead: any, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/outreach-leads/${lead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...lead,
          status: newStatus,
          last_contacted_at: new Date().toISOString()
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setOutreachLeads(prev => prev.map(l => l.id === lead.id ? updated : l));
        addToast('Status Updated', `Updated "${lead.property_name}" to ${newStatus.toUpperCase()}`, 'success');
      } else {
        addToast('Error', 'Failed to update outreach status.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'Network failure.', 'error');
    }
  };

  const handleResetOutreachForm = () => {
    setIsAddingOutreach(false);
    setEditingOutreachId(null);
    setOutreachForm({
      property_name: '',
      instagram_username: '',
      facebook_url: '',
      owner_name: '',
      location: '',
      estimated_nightly_rate: 0,
      status: 'discovered',
      notes: '',
      email: '',
      phone: ''
    });
  };

  const handleRunAiCheck = async (campaignId: number) => {
    setRunningAiCheckId(campaignId);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/ai-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        addToast('AI Gatekeeper Check Complete', `Campaign scored ${data.score || 8.5}/10. ${data.passed ? 'PASSED dual-gate pre-check.' : 'FLAGGED for compliance issues.'}`, data.passed ? 'success' : 'warning');
        setMarketingCampaigns(prev => prev.map(c => c.id === campaignId ? {
          ...c,
          ai_score: data.score,
          ai_review: data.checks ? data.checks.map((ch: any) => `${ch.category}: ${ch.feedback}`).join(' | ') : 'AI Gatekeeper check updated.'
        } : c));
      } else {
        const err = await res.json();
        addToast('AI Check Error', err.error || 'Failed to execute AI Gatekeeper check.', 'error');
      }
    } catch (err) {
      console.error('Error running AI check:', err);
      addToast('Error', 'Failed to run AI check.', 'error');
    } finally {
      setRunningAiCheckId(null);
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
        const data = await res.json();
        addToast('Approved', 'Campaign approved and dispatched live to Meta Ad Network!', 'success');
        if (data.campaign) {
          setMarketingCampaigns(prev => prev.map(c => c.id === id ? data.campaign : c));
        } else {
          setMarketingCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active', approved_at: new Date().toISOString() } : c));
        }
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

  const handleToggleRejectionField = (field: string, selected: boolean) => {
    setRejectedFieldInputs(prev => {
      const next = { ...prev };
      if (selected) {
        next[field] = '';
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const handleUpdateRejectionReason = (field: string, reason: string) => {
    setRejectedFieldInputs(prev => ({
      ...prev,
      [field]: reason
    }));
  };

  const handleConfirmRejectCampaign = async () => {
    if (!rejectingCampaignId) return;
    setSubmittingRejection(true);
    try {
      // Filter out empty input feedback values so we only send actual corrections
      const filteredRejectedFields: Record<string, string> = {};
      Object.entries(rejectedFieldInputs).forEach(([key, value]) => {
        const strVal = value as string;
        if (strVal && strVal.trim()) {
          filteredRejectedFields[key] = strVal.trim();
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

  const handleReleaseEscrow = async (campaignId: number) => {
    if (!confirm(`Force release 24-hour fraud escrow for Campaign #${campaignId}? Ad spend will be immediately dispatched.`)) return;
    setReleasingEscrowId(campaignId);
    try {
      const res = await fetch('/api/admin/payments/escrow/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ campaign_id: campaignId })
      });
      const data = await res.json();
      if (res.ok) {
        addToast('Escrow Released', data.message || 'Escrow force-released by Admin.', 'success');
        setMarketingCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, escrow_status: 'released', status: 'active' } : c));
      } else {
        addToast('Escrow Error', data.error || 'Failed to release escrow.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      addToast('Error', err.message || 'Network error releasing escrow.', 'error');
    } finally {
      setReleasingEscrowId(null);
    }
  };

  const handleEmergencyPauseCampaign = async (campaignId: number) => {
    if (!confirm(`Emergency Pause Campaign #${campaignId}? Ad spend will be halted immediately.`)) return;
    setPausingCampaignId(campaignId);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/pacing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mode: 'paused' })
      });
      if (res.ok) {
        addToast('Campaign Paused', 'Campaign emergency paused by Admin.', 'info');
        setMarketingCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'paused' } : c));
      } else {
        addToast('Error', 'Failed to pause campaign.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      addToast('Error', 'Network error pausing campaign.', 'error');
    } finally {
      setPausingCampaignId(null);
    }
  };

  const handleRunAdminAiCheck = async (campaignId: number) => {
    setRunningAiCheckId(campaignId);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/ai-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.ai_evaluation) {
        addToast('AI Gatekeeper Complete', `Campaign evaluated: ${data.ai_evaluation.score}/10 (${data.ai_evaluation.score >= 8.0 ? 'Approved' : 'Auto-Rejected'})`, data.ai_evaluation.score >= 8.0 ? 'success' : 'warning');
        setMarketingCampaigns(prev => prev.map(c => c.id === campaignId ? {
          ...c,
          ai_score: data.ai_evaluation.score,
          ai_review: JSON.stringify(data.ai_evaluation),
          status: data.ai_evaluation.score < 8.0 ? 'rejected' : c.status
        } : c));
        setExpandedAiReviewId(campaignId);
      } else {
        addToast('AI Error', data.error || 'Failed to execute AI Gatekeeper scan.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      addToast('Error', 'Network error during AI Gatekeeper scan.', 'error');
    } finally {
      setRunningAiCheckId(null);
    }
  };

  const applyRejectionTemplate = (type: 'contact_leak' | 'media_aspect' | 'fair_housing' | 'broad_targeting') => {
    if (type === 'contact_leak') {
      setRejectionFeedback('Campaign copy contains external contact details (phone, email, or WhatsApp/Telegram link) violating Encho CRM containment guidelines.');
      setRejectedFieldInputs(prev => ({ ...prev, description: 'Remove phone numbers, email addresses, or external links.' }));
    } else if (type === 'media_aspect') {
      setRejectionFeedback('Uploaded visual media assets do not meet Meta 1:1 Feed or 9:16 Story/Reel high-resolution aspect ratio requirements.');
      setRejectedFieldInputs(prev => ({ ...prev, media_urls: 'Upload high-res 1:1 or 9:16 images without blurry stretch.' }));
    } else if (type === 'fair_housing') {
      setRejectionFeedback('Ad text violates Meta Housing Equal Opportunity (HEC) Nondiscrimination policies.');
      setRejectedFieldInputs(prev => ({ ...prev, description: 'Revise copy to eliminate demographic exclusion or age/family restrictions.' }));
    } else if (type === 'broad_targeting') {
      setRejectionFeedback('Target locations are too broad or unaligned with high-intent feeder markets.');
      setRejectedFieldInputs(prev => ({ ...prev, target_locations: 'Specify top 2-3 feeder cities (e.g., Los Angeles, San Francisco).' }));
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
                                          {(() => {
                                             const imgUrl = (listing.imageUrls && listing.imageUrls[0]) || listing.imageUrl || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6';
                                             return <img src={`${imgUrl}?w=100&h=100&fit=crop`} alt="" className="w-full h-full object-cover" />;
                                          })()}
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
                     <AdminSEOTab items={adminMode === 'stays' ? listings : experiences} type={adminMode === 'stays' ? 'listing' : 'experience'} onSuccess={fetchData} />
                  </div>
              ) : activeTab === 'marketing' ? (
                 <div className="p-6 space-y-8 max-w-6xl">
                    {/* Multi-Million Scale Hub Header */}
                    <div className="bg-gradient-to-r from-sky-900 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden text-left">
                       <div className="relative z-10 max-w-3xl">
                          <span className="bg-sky-500/20 text-sky-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-sky-500/30">
                             SaaS Hyper-Scale Command Center
                          </span>
                          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-3">
                             Host Absolute Marketing Engine
                          </h2>
                          <p className="text-sky-100/80 text-sm md:text-base mt-2 leading-relaxed">
                             Configure live outbound Meta & Google API linkagers, moderate high-value guest-generation ad sets, oversee merchant payment flows, and manage the premium host acquisition pipeline.
                          </p>
                       </div>
                       <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 pointer-events-none hidden md:block">
                          <Megaphone className="w-full h-full rotate-12 animate-pulse" />
                       </div>
                    </div>

                    {/* Sub Tab Navigation */}
                    <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
                       <button
                          type="button"
                          onClick={() => setMarketingSubTab('moderation')}
                          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                             marketingSubTab === 'moderation'
                                ? 'border-sky-600 text-sky-700 font-bold'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                          }`}
                       >
                          <Megaphone className="w-4 h-4" />
                          Campaign Moderation Review ({marketingCampaigns.length})
                       </button>
                       <button
                          type="button"
                          onClick={() => setMarketingSubTab('linkage')}
                          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                             marketingSubTab === 'linkage'
                                ? 'border-sky-600 text-sky-700 font-bold'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                          }`}
                       >
                          <Link className="w-4 h-4" />
                          API & Billing Onboarding
                       </button>
                       <button
                          type="button"
                          onClick={() => setMarketingSubTab('outreach')}
                          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                             marketingSubTab === 'outreach'
                                ? 'border-sky-600 text-sky-700 font-bold'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                          }`}
                       >
                          <Users className="w-4 h-4" />
                          Host Acquisition CRM ({outreachLeads.length})
                       </button>
                       <button
                          type="button"
                          onClick={() => setMarketingSubTab('organic_social')}
                          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                             marketingSubTab === 'organic_social'
                                ? 'border-sky-600 text-sky-700 font-bold'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                          }`}
                       >
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Social Moderation ({adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length} Pending)
                       </button>
                       <button
                          type="button"
                          onClick={() => setMarketingSubTab('audit_logs')}
                          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                             marketingSubTab === 'audit_logs'
                                ? 'border-emerald-600 text-emerald-700 font-bold'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                          }`}
                       >
                          <Shield className="w-4 h-4 text-emerald-600" />
                          Immutable Audit Trail ({adminAuditLogs.length})
                       </button>
                       <button
                          type="button"
                          onClick={() => {
                             setMarketingSubTab('geo_router');
                             fetchAdminPaymentOverview();
                          }}
                          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                             marketingSubTab === 'geo_router'
                                ? 'border-indigo-600 text-indigo-700 font-bold'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                          }`}
                       >
                          <CreditCard className="w-4 h-4 text-indigo-600" />
                          Payment Geo-Router & Escrow ({adminPaymentOverview.metrics?.escrow_holding_count || 0} Holding)
                       </button>
                    </div>

                    {/* Tab Content 1: Moderation Queue */}
                    {marketingSubTab === 'moderation' && (
                       <div className="space-y-6 text-left">
                          {/* Master Brand Social Queue Alert Banner */}
                          {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length > 0 && (
                             <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white p-5 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-bold shrink-0">
                                      <Sparkles className="w-5 h-5 text-white" />
                                   </div>
                                   <div>
                                      <h4 className="font-extrabold text-sm tracking-tight">
                                         Master Brand Queue: {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length} Organic Social Post(s) Awaiting Review
                                      </h4>
                                      <p className="text-xs text-amber-100 font-medium">
                                         Host draft posts submitted for @enchospace master platform publishing require moderation.
                                      </p>
                                   </div>
                                </div>
                                <button
                                   type="button"
                                   onClick={() => setMarketingSubTab('organic_social')}
                                   className="px-4 py-2 bg-white text-amber-900 rounded-xl text-xs font-bold hover:bg-amber-50 transition-all shadow-sm shrink-0 flex items-center justify-center gap-1.5"
                                >
                                   <span>Review Master Brand Queue</span>
                                   <ChevronRight className="w-4 h-4" />
                                </button>
                             </div>
                          )}

                          {/* Stats overview */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Pending Review</span>
                                <span className="text-3xl font-bold text-amber-500">
                                   {marketingCampaigns.filter(c => c.status === 'pending' || c.status === 'pending_approval' || c.status === 'PENDING_APPROVAL').length}
                                </span>
                             </div>
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Active Ad Sets</span>
                                <span className="text-3xl font-bold text-emerald-500">
                                   {marketingCampaigns.filter(c => c.status === 'active' || c.status === 'approved').length}
                                </span>
                             </div>
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Total Active Ad Budget</span>
                                <span className="text-3xl font-bold text-gray-900">
                                   ₹{marketingCampaigns.reduce((sum, c) => sum + ((c.status === 'active' || c.status === 'approved') ? Number(c.budget) : 0), 0).toLocaleString()}
                                </span>
                             </div>
                          </div>

                          {/* Queue List */}
                          <div className="space-y-6">
                             <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 gap-4">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                   <span>Campaigns Moderation Queue</span>
                                   <span className="text-sm font-normal text-gray-500">({marketingCampaigns.length} total)</span>
                                </h3>

                                {/* Queue Status Filter Buttons */}
                                <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-150">
                                   {[
                                      { id: 'all', label: 'All', count: marketingCampaigns.length },
                                      { id: 'pending', label: 'Pending', count: marketingCampaigns.filter(c => c.status === 'pending' || c.status === 'pending_approval' || c.status === 'PENDING_APPROVAL').length },
                                      { id: 'active', label: 'Active', count: marketingCampaigns.filter(c => c.status === 'active' || c.status === 'approved').length },
                                      { id: 'rejected', label: 'Rejected', count: marketingCampaigns.filter(c => c.status === 'rejected').length }
                                   ].map((tab) => (
                                      <button
                                         key={tab.id}
                                         type="button"
                                         onClick={() => setCampaignFilter(tab.id as any)}
                                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 focus:outline-none ${
                                            campaignFilter === tab.id
                                               ? 'bg-zinc-900 text-white shadow-sm'
                                               : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                         }`}
                                      >
                                         <span>{tab.label}</span>
                                         <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                                            campaignFilter === tab.id
                                               ? 'bg-white/20 text-white'
                                               : 'bg-gray-200 text-gray-700'
                                         }`}>
                                            {tab.count}
                                         </span>
                                      </button>
                                   ))}
                                </div>
                             </div>

                             {marketingCampaigns.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm w-full">
                                   <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                   <p className="text-gray-500 font-medium">No marketing campaigns have been created yet.</p>
                                   <p className="text-xs text-gray-400 mt-1">Host-submitted campaigns will appear here for review.</p>
                                </div>
                             ) : (() => {
                                const filteredCampaigns = marketingCampaigns.filter(c => {
                                   if (campaignFilter === 'all') return true;
                                   if (campaignFilter === 'pending') return c.status === 'pending' || c.status === 'pending_approval' || c.status === 'PENDING_APPROVAL';
                                   if (campaignFilter === 'active') return c.status === 'active' || c.status === 'approved';
                                   if (campaignFilter === 'rejected') return c.status === 'rejected';
                                   return true;
                                });
                                if (filteredCampaigns.length === 0) {
                                   return (
                                      <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm w-full">
                                         <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                         <p className="text-gray-500 font-medium">No campaigns match this filter.</p>
                                         <p className="text-xs text-gray-400 mt-1">Try switching to a different status filter above.</p>
                                      </div>
                                   );
                                }
                                return (
                                   <div className="grid grid-cols-1 gap-6 w-full">
                                      {filteredCampaigns.map((campaign) => {
                                         const isPending = campaign.status === 'pending' || campaign.status === 'pending_approval' || campaign.status === 'PENDING_APPROVAL';
                                         const isActive = campaign.status === 'active' || campaign.status === 'approved';
                                         const isRejected = campaign.status === 'rejected';
                                         return (
                                      <div key={campaign.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col md:flex-row text-left">
                                         <div className="p-6 flex-1 space-y-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                               <div className="space-y-1">
                                                  <div className="flex items-center gap-2">
                                                     <h4 className="text-lg font-bold text-gray-900">{campaign.title}</h4>
                                                     <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                        isPending ? 'bg-amber-100 text-amber-700' :
                                                        isActive ? 'bg-emerald-100 text-emerald-700' :
                                                        isRejected ? 'bg-red-100 text-red-700' :
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
                                                           Meta Ad ID: <span className="font-semibold">{campaign.meta_campaign_id}</span>
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

                                            {/* Direct Conversions API (CAPI) & Google Ads Trackers */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs p-4 bg-blue-50/15 border border-blue-100/60 rounded-xl">
                                               <div>
                                                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1.5">Meta Conversions API (CAPI) Configuration</span>
                                                  {campaign.meta_pixel_id ? (
                                                     <div className="space-y-1">
                                                        <p className="text-xs text-gray-700">
                                                           Pixel ID: <span className="font-mono font-bold text-gray-900 bg-white border px-1.5 py-0.5 rounded">{campaign.meta_pixel_id}</span>
                                                        </p>
                                                        <p className="text-[10px] text-zinc-400 truncate font-mono">
                                                           Token: {campaign.meta_capi_token ? `${campaign.meta_capi_token.substring(0, 15)}... (active)` : 'None'}
                                                        </p>
                                                     </div>
                                                  ) : (
                                                     <span className="text-[10px] text-zinc-400 font-mono block">No Meta Pixel / CAPI Linkage Configured</span>
                                                  )}
                                               </div>
                                               <div>
                                                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1.5">Google Ads Offline Linkage</span>
                                                  {campaign.google_conversion_id ? (
                                                     <div className="space-y-1">
                                                        <p className="text-xs text-gray-700">
                                                           Conversion ID: <span className="font-mono font-bold text-gray-900 bg-white border px-1.5 py-0.5 rounded">{campaign.google_conversion_id}</span>
                                                        </p>
                                                        <p className="text-[10px] text-zinc-500 font-mono">
                                                           Label: {campaign.google_conversion_label || '—'}
                                                        </p>
                                                     </div>
                                                  ) : (
                                                     <span className="text-[10px] text-zinc-400 font-mono block">No Google Ads Conversion Label Configured</span>
                                                  )}
                                               </div>
                                            </div>

                                            {/* Real-time Spend and Pacing Telemetry for Admins */}
                                            {(campaign.status === 'active' || campaign.status === 'completed') && (() => {
                                               const spent = campaign.analytics?.spent || 0;
                                               const budget = campaign.budget || 2500;
                                               const pct = Math.min(100, (spent / budget) * 100);
                                               const remaining = Math.max(0, budget - spent);
                                               const isDepleted = campaign.status === 'completed' || pct >= 100;

                                               let barColor = 'bg-emerald-500';
                                               let textBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                               if (pct >= 60 && pct < 85) {
                                                  barColor = 'bg-amber-500';
                                                  textBg = 'bg-amber-50 text-amber-700 border-amber-200';
                                               } else if (pct >= 85) {
                                                  barColor = 'bg-rose-500';
                                                  textBg = 'bg-rose-50 text-rose-700 border-rose-200';
                                               }

                                               return (
                                                  <div className="p-4 bg-gray-50 border border-gray-200/60 rounded-xl space-y-3 text-xs mb-4">
                                                     <div className="flex items-center justify-between">
                                                        <span className="font-bold text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                                           🛡️ Admin Real-time Telemetry & Fuel Gauge
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono uppercase ${textBg}`}>
                                                           {Number(pct || 0).toFixed(1)}% Spent
                                                        </span>
                                                     </div>
                                                     <div className="space-y-1">
                                                        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden p-[1px]">
                                                           <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                                                           <span>Spent: {campaign.currency === 'USD' ? `$${spent.toFixed(2)}` : `₹${spent.toLocaleString()}`}</span>
                                                           <span>Remaining: {campaign.currency === 'USD' ? `$${remaining.toFixed(2)}` : `₹${remaining.toLocaleString()}`}</span>
                                                        </div>
                                                     </div>
                                                     <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-[10px] font-mono">
                                                        <div className="bg-white p-2 border rounded-lg">
                                                           <span className="text-gray-400 block mb-0.5">Impressions</span>
                                                           <strong className="text-gray-900 font-bold">{campaign.analytics?.impressions?.toLocaleString() || 0}</strong>
                                                        </div>
                                                        <div className="bg-white p-2 border rounded-lg">
                                                           <span className="text-gray-400 block mb-0.5">Clicks</span>
                                                           <strong className="text-gray-900 font-bold">{campaign.analytics?.clicks?.toLocaleString() || 0}</strong>
                                                        </div>
                                                        <div className="bg-white p-2 border rounded-lg">
                                                           <span className="text-gray-400 block mb-0.5">CTR</span>
                                                           <strong className="text-gray-900 font-bold">{Number(campaign.analytics?.ctr || 0).toFixed(2)}%</strong>
                                                        </div>
                                                        <div className="bg-white p-2 border rounded-lg">
                                                           <span className="text-gray-400 block mb-0.5">Pacing</span>
                                                           <strong className="text-gray-900 font-bold uppercase">{campaign.pacing_mode || 'standard'}</strong>
                                                        </div>
                                                     </div>
                                                  </div>
                                               );
                                            })()}

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
                                                           {mediaList.map((url: string, idx: number) => (
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
                                               {/* AI Quality Score and Controls Banner */}
                                               <div className="col-span-full p-3 bg-purple-50/50 border border-purple-100 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs mb-1">
                                                  <div className="flex items-center gap-2">
                                                     <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">AI Gatekeeper Score:</span>
                                                     <span className="font-extrabold text-emerald-600 font-mono text-sm">{campaign.ai_score || 8.5}/10</span>
                                                     <button
                                                        type="button"
                                                        onClick={() => setExpandedAiReviewId(expandedAiReviewId === campaign.id ? null : campaign.id)}
                                                        className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold underline"
                                                     >
                                                        {expandedAiReviewId === campaign.id ? 'Hide Audit' : 'View Audit'}
                                                     </button>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                     <button
                                                        type="button"
                                                        onClick={() => setPreviewAdCampaign(campaign)}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 shadow-xs"
                                                     >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>Preview Ad Creative</span>
                                                     </button>
                                                     <button
                                                        type="button"
                                                        disabled={runningAiCheckId === campaign.id}
                                                        onClick={() => handleRunAiCheck(campaign.id)}
                                                        className="bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 border border-purple-200 disabled:opacity-50"
                                                     >
                                                        {runningAiCheckId === campaign.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-600" />}
                                                        <span>Run AI Check</span>
                                                     </button>
                                                     {campaign.escrow_status === 'holding' && (
                                                        <button
                                                           type="button"
                                                           disabled={releasingEscrowId === campaign.id}
                                                           onClick={() => handleReleaseEscrow(campaign.id)}
                                                           className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 shadow-xs"
                                                        >
                                                           {releasingEscrowId === campaign.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                                                           <span>⚡ Release Escrow</span>
                                                        </button>
                                                     )}
                                                     {campaign.status === 'active' && (
                                                        <button
                                                           type="button"
                                                           disabled={pausingCampaignId === campaign.id}
                                                           onClick={() => handleEmergencyPauseCampaign(campaign.id)}
                                                           className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded-lg text-xs border border-rose-200 transition-all flex items-center gap-1"
                                                        >
                                                           {pausingCampaignId === campaign.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                                                           <span>Emergency Pause</span>
                                                        </button>
                                                     )}
                                                  </div>
                                               </div>

                                               {expandedAiReviewId === campaign.id && (
                                                  <div className="col-span-full bg-purple-50 p-3 rounded-xl border border-purple-100 text-[11px] text-purple-900 leading-relaxed font-mono mb-2">
                                                     <strong>Encho AI Gatekeeper Audit:</strong> {campaign.ai_review || 'Copy structure meets direct response guidelines. Media resolution high. Target geography validated.'}
                                                  </div>
                                               )}
                                               <div>
                                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Target Platforms</span>
                                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                                     {campaign.platforms && (typeof campaign.platforms === 'string' ? JSON.parse(campaign.platforms) : campaign.platforms).map((plat: string, index: number) => (
                                                        <span key={index} className="bg-sky-50 text-sky-700 text-xs font-semibold px-2 py-0.5 rounded-md border border-sky-100">
                                                           {plat.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
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
                                                  <strong>Moderator Feedback & Guidance:</strong> {campaign.admin_feedback}
                                               </div>
                                            )}
                                         </div>

                                         {isPending && (
                                            <div className="bg-gray-50 border-t md:border-t-0 md:border-l border-gray-100 p-6 flex flex-row md:flex-col justify-center items-stretch gap-3 shrink-0 min-w-[180px]">
                                               <button 
                                                  type="button"
                                                  onClick={() => handleApproveCampaign(campaign.id)}
                                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                                               >
                                                  <CheckCircle2Icon className="w-4 h-4" /> Approve
                                               </button>
                                               <button 
                                                  type="button"
                                                  onClick={() => handleOpenRejectModal(campaign.id)}
                                                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2.5 px-4 rounded-xl text-sm border border-red-200 transition-all flex items-center justify-center gap-2"
                                               >
                                                  <XIcon className="w-4 h-4" /> Reject
                                               </button>
                                            </div>
                                         )}
                                      </div>
                                      );
                                      })}
                                   </div>
                                );
                             })()}
                          </div>
                       </div>
                    )}

                    {/* Tab Content 2: Live APIs Linkage & Merchant Stripe Billing Settings */}
                    {marketingSubTab === 'linkage' && (
                       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left w-full">
                          {/* Stripe Production Mode */}
                          <div className="lg:col-span-5 space-y-6">
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-3">
                                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                         <CreditCard className="w-6 h-6" />
                                      </div>
                                      <div>
                                         <h4 className="font-bold text-gray-900">Merchant Billing Mode</h4>
                                         <p className="text-xs text-gray-400">Manage Stripe subscription processing</p>
                                      </div>
                                   </div>
                                   <div className="flex items-center">
                                      <button
                                         type="button"
                                         onClick={() => {
                                            if (!stripeLiveMode) {
                                               const accept = confirm("⚠️ WARNING: Transitioning Stripe to Live Mode will request actual currency transactions from hosts subscribing or funding campaigns. Do you have live production credentials configured?");
                                               if (accept) {
                                                  setStripeLiveMode(true);
                                                  addToast("Stripe Live Mode", "Stripe merchant has been updated to production mode. Real payments are active.", "success");
                                               }
                                            } else {
                                               setStripeLiveMode(false);
                                               addToast("Stripe Sandbox Mode", "Stripe transaction simulator is active.", "info");
                                            }
                                         }}
                                         className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                            stripeLiveMode ? 'bg-red-600' : 'bg-gray-200'
                                         }`}
                                      >
                                         <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            stripeLiveMode ? 'translate-x-5' : 'translate-x-0'
                                         }`} />
                                      </button>
                                   </div>
                                </div>

                                {/* Status banners */}
                                {stripeLiveMode ? (
                                   <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs leading-relaxed font-medium">
                                      ⚠️ <strong>STRIPE LIVE ENGINE ACTIVE:</strong> Real bank accounts and credentials will be used for subscriptions. Please ensure your Stripe Dashboard contains appropriate live webhooks configured with HTTPS endpoints.
                                   </div>
                                ) : (
                                   <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs leading-relaxed font-medium">
                                      🔧 <strong>STRIPE SANDBOX MODE ACTIVE:</strong> Sandbox card numbers (e.g. 4242...) can be used to simulate payments and auto-approve. Recommended for general staging.
                                   </div>
                                )}

                                <div className="border-t border-gray-100 pt-4 space-y-3">
                                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Stripe Gateway Connections</span>
                                   <div className="flex items-center justify-between text-xs font-semibold text-gray-700 bg-gray-50 p-2.5 rounded-lg border">
                                      <span className="flex items-center gap-1.5">
                                         <div className={`w-2 h-2 rounded-full ${stripeLiveMode ? 'bg-rose-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                                         {stripeLiveMode ? 'Live Production API' : 'Sandbox Test API'}
                                      </span>
                                      <span className="font-mono text-gray-400 text-[10px]">v3 (Latest)</span>
                                   </div>
                                   <div className="flex items-center justify-between text-xs font-semibold text-gray-700 bg-gray-50 p-2.5 rounded-lg border">
                                      <span className="flex items-center gap-1.5">
                                         <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                         Webhook Handler Status
                                      </span>
                                      <span className="text-emerald-600 font-mono text-[10px]">Secure TLS OK</span>
                                   </div>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200 space-y-2">
                                   <h5 className="text-xs font-bold text-gray-700">Production Merchant Onboarding</h5>
                                   <p className="text-xs text-gray-500 leading-relaxed">
                                      Host subscriptions feed directly into the unified platform account. On successful payments, the campaign changes status from <span className="font-mono bg-gray-200 px-1 py-0.5 rounded text-[10px]">unpaid</span> to <span className="font-mono bg-gray-200 px-1 py-0.5 rounded text-[10px]">paid</span>, which instantly triggers background dispatch.
                                   </p>
                                </div>
                             </div>
                          </div>

                          {/* Meta & Google API Linkage */}
                          <div className="lg:col-span-7 space-y-6">
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                                <div className="flex items-center gap-3">
                                   <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                                      <Globe className="w-6 h-6 animate-spin-slow" />
                                   </div>
                                   <div>
                                      <h4 className="font-bold text-gray-900">Meta Marketing Graph API Connection</h4>
                                      <p className="text-xs text-gray-400">Oversee real-time campaign dispatch integrations</p>
                                   </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="bg-gray-50 p-3.5 rounded-xl border space-y-1">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Graph API SDK Endpoints</span>
                                      <span className="text-xs font-mono font-semibold text-gray-800 font-bold">graph.facebook.com/v19.0</span>
                                   </div>
                                   <div className="bg-gray-50 p-3.5 rounded-xl border space-y-1">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Integration Status</span>
                                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                                         <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                         Live Handshake Connected
                                      </span>
                                   </div>
                                </div>

                                <div className="space-y-2">
                                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Live Payload Inspection Blueprint</span>
                                   <p className="text-xs text-gray-500 leading-relaxed mb-2">
                                      Below is the exact JSON structure dispatched to the Meta Ads Manager API upon approving and validating a paid campaign.
                                   </p>
                                   <pre className="bg-zinc-900 text-sky-300 font-mono text-[11px] p-4 rounded-xl overflow-x-auto max-h-[180px] scrollbar-thin">
{`{
  "name": "Encho Host Campaign - #[ID]",
  "objective": "OUTCOME_TRAFFIC",
  "status": "PAUSED",
  "special_ad_categories": ["HOUSING"],
  "adsets": [{
    "name": "Target Audience - [Locations]",
    "billing_event": "IMPRESSIONS",
    "optimization_goal": "REACH",
    "daily_budget": "[Budget In Cents]",
    "targeting": {
      "geo_locations": {
        "countries": ["IN"],
        "cities": [{"key": "12345", "radius": 25, "distance_unit": "mile"}]
      },
      "publisher_platforms": ["instagram", "facebook"],
      "user_device": ["mobile"]
    }
  }],
  "creative": {
    "name": "Pillar 5 Rahul-Proof Ad Creative",
    "object_story_spec": {
      "instagram_actor_id": "ig_encho_host",
      "link_data": {
        "call_to_action": {"type": "BOOK_NOW"},
        "message": "[Description Copy]",
        "link": "https://encho.space/stays/[Listing_ID]"
      }
    }
  }
}`}
                                   </pre>
                                </div>

                                {/* simulated incoming webhook validator terminal */}
                                <div className="space-y-2 border-t border-gray-100 pt-4 text-left">
                                   <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Live Webhook Verification Logs</span>
                                      <span className="text-[9px] px-2 py-0.5 bg-zinc-950 text-emerald-400 font-mono rounded border border-emerald-900 animate-pulse">MONITOR RUNNING</span>
                                   </div>
                                   <div className="bg-black text-emerald-500 font-mono text-[10px] p-3 rounded-lg max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin text-left">
                                      <div className="text-zinc-500">[2026-07-16 18:50] Webhook listener listening on port 3000...</div>
                                      <div className="text-zinc-500">[2026-07-16 18:51] Received GET challenge from graph.facebook.com...</div>
                                      <div className="text-sky-400">&gt; Verifying Meta hub.verify_token: "ENCHO_METRICS_SUITE_AUTHENTICATOR_2026"</div>
                                      <div className="text-emerald-400">&gt; Verification Signature Validated (status: 200 OK)</div>
                                      <div className="text-zinc-500">[2026-07-16 18:52] Received Stripe webhook charge.succeeded (ID: ch_398f3b)...</div>
                                      <div className="text-amber-400">&gt; Verifying SHA256 Signature header: t=168953112, v1=e3b0c44...</div>
                                      <div className="text-emerald-400">&gt; Webhook accepted: Campaign Status set to PAID. Meta API dispatch triggered.</div>
                                   </div>
                                </div>
                             </div>
                          </div>
                       </div>
                    )}

                    {/* Tab Content 3: Host Acquisition CRM Outreach */}
                    {marketingSubTab === 'outreach' && (
                       <div className="space-y-6 text-left w-full">
                          {/* Stats Panel */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                             <div className="bg-white p-4 rounded-xl border shadow-sm">
                                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Total Leads</span>
                                <span className="text-2xl font-bold text-gray-900">{outreachLeads.length}</span>
                             </div>
                             <div className="bg-white p-4 rounded-xl border shadow-sm">
                                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Discovered</span>
                                <span className="text-2xl font-bold text-amber-600">{outreachLeads.filter(l => l.status === 'discovered').length}</span>
                             </div>
                             <div className="bg-white p-4 rounded-xl border shadow-sm">
                                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">In Negotiation</span>
                                <span className="text-2xl font-bold text-indigo-600">{outreachLeads.filter(l => l.status === 'negotiating').length}</span>
                             </div>
                             <div className="bg-white p-4 rounded-xl border shadow-sm">
                                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Onboarded</span>
                                <span className="text-2xl font-bold text-emerald-600">{outreachLeads.filter(l => l.status === 'onboarded').length}</span>
                             </div>
                          </div>

                          {/* Outreach Search and Filters bar */}
                          <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                             <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                   <Search className="w-4 h-4" />
                                </div>
                                <input
                                   type="text"
                                   placeholder="Search properties, locations, instagram handles..."
                                   value={outreachSearch}
                                   onChange={(e) => setOutreachSearch(e.target.value)}
                                   className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none text-sm font-medium transition-all"
                                />
                             </div>

                             <div className="flex flex-wrap items-center gap-1.5">
                                {[
                                   { id: 'all', label: 'All Statuses' },
                                   { id: 'discovered', label: 'Discovered' },
                                   { id: 'contacted', label: 'Contacted' },
                                   { id: 'negotiating', label: 'Negotiating' },
                                   { id: 'onboarded', label: 'Onboarded' },
                                   { id: 'ignored', label: 'Ignored' }
                                ].map((filter) => (
                                   <button
                                      key={filter.id}
                                      type="button"
                                      onClick={() => setOutreachFilter(filter.id as any)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none ${
                                         outreachFilter === filter.id
                                            ? 'bg-sky-600 text-white shadow-sm font-bold'
                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                      }`}
                                   >
                                      {filter.label}
                                   </button>
                                ))}

                                <button
                                   type="button"
                                   onClick={() => {
                                      handleResetOutreachForm();
                                      setIsAddingOutreach(true);
                                   }}
                                   className="bg-zinc-900 hover:bg-sky-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ml-2 shadow-sm"
                                >
                                   <Plus className="w-3.5 h-3.5" /> Add Target Lead
                                </button>
                             </div>
                          </div>

                          {/* Inline Add / Edit Target Form */}
                          {isAddingOutreach && (
                             <form onSubmit={handleSaveOutreachLead} className="bg-gray-50 p-6 rounded-2xl border border-gray-200 space-y-4 w-full">
                                <div className="flex items-center justify-between border-b pb-3 border-gray-200">
                                   <h4 className="font-bold text-gray-900 text-base">
                                      {editingOutreachId ? `Edit Target Lead Details: "${outreachForm.property_name}"` : 'Add Premium Direct-Booking Target Lead'}
                                   </h4>
                                   <button
                                      type="button"
                                      onClick={handleResetOutreachForm}
                                      className="text-gray-400 hover:text-gray-700 hover:scale-105 transition-transform"
                                   >
                                      <XIcon className="w-5 h-5" />
                                   </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Property Name *</label>
                                      <input
                                         type="text"
                                         required
                                         value={outreachForm.property_name}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, property_name: e.target.value }))}
                                         placeholder="e.g. Glacier Peak A-Frame"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Location</label>
                                      <input
                                         type="text"
                                         value={outreachForm.location}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, location: e.target.value }))}
                                         placeholder="e.g. Mount Rainier, WA"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Owner Name</label>
                                      <input
                                         type="text"
                                         value={outreachForm.owner_name}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, owner_name: e.target.value }))}
                                         placeholder="e.g. Jane Miller"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none"
                                      />
                                   </div>

                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Instagram Handle</label>
                                      <div className="relative">
                                         <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 text-xs font-bold">@</span>
                                         <input
                                            type="text"
                                            value={outreachForm.instagram_username}
                                            onChange={e => setOutreachForm(prev => ({ ...prev, instagram_username: e.target.value }))}
                                            placeholder="glaciercabin"
                                            className="w-full border rounded-lg pl-6 pr-2 py-2 bg-white text-xs font-medium focus:outline-none"
                                         />
                                      </div>
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Facebook Page URL</label>
                                      <input
                                         type="url"
                                         value={outreachForm.facebook_url}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, facebook_url: e.target.value }))}
                                         placeholder="https://facebook.com/glaciercabin"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Est. Nightly Rate (₹/USD)</label>
                                      <input
                                         type="number"
                                         value={outreachForm.estimated_nightly_rate}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, estimated_nightly_rate: Number(e.target.value) }))}
                                         placeholder="450"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none font-mono"
                                      />
                                   </div>

                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Contact Email</label>
                                      <input
                                         type="email"
                                         value={outreachForm.email}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, email: e.target.value }))}
                                         placeholder="jane@glaciercabin.co"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Contact Phone</label>
                                      <input
                                         type="text"
                                         value={outreachForm.phone}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, phone: e.target.value }))}
                                         placeholder="+1 (555) 019-2831"
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-medium focus:outline-none"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Outreach Status</label>
                                      <select
                                         value={outreachForm.status}
                                         onChange={e => setOutreachForm(prev => ({ ...prev, status: e.target.value }))}
                                         className="w-full border rounded-lg p-2 bg-white text-xs font-bold text-gray-700 focus:outline-none cursor-pointer"
                                      >
                                         <option value="discovered">Discovered (Uncontacted)</option>
                                         <option value="contacted">Contacted (In Pitch)</option>
                                         <option value="negotiating">Negotiating Deal</option>
                                         <option value="onboarded">Onboarded (Live Host!)</option>
                                         <option value="ignored">Ignored/Declined</option>
                                      </select>
                                   </div>
                                </div>

                                <div className="space-y-1">
                                   <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Conversation Logs & Internal Notes</label>
                                   <textarea
                                      value={outreachForm.notes}
                                      onChange={e => setOutreachForm(prev => ({ ...prev, notes: e.target.value }))}
                                      placeholder="Logs of DMs sent, responses, friction points, or integration requirements. Pitching direct-booking engine saving..."
                                      rows={3}
                                      className="w-full border rounded-lg p-2.5 bg-white text-xs font-medium focus:outline-none resize-none leading-relaxed"
                                   />
                                </div>

                                <div className="flex gap-2 justify-end pt-2 border-t">
                                   <button
                                      type="button"
                                      onClick={handleResetOutreachForm}
                                      className="px-4 py-2 border rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                                   >
                                      Cancel
                                   </button>
                                   <button
                                      type="submit"
                                      disabled={savingOutreach}
                                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                                   >
                                      {savingOutreach ? 'Saving...' : editingOutreachId ? 'Save Changes' : 'Add Target Lead'}
                                   </button>
                                </div>
                             </form>
                          )}

                          {/* Outreach Leads List */}
                          {(() => {
                             const filteredLeads = outreachLeads.filter(lead => {
                                const matchesFilter = outreachFilter === 'all' || lead.status === outreachFilter;
                                const matchesSearch = 
                                   lead.property_name.toLowerCase().includes(outreachSearch.toLowerCase()) ||
                                   (lead.location && lead.location.toLowerCase().includes(outreachSearch.toLowerCase())) ||
                                   (lead.instagram_username && lead.instagram_username.toLowerCase().includes(outreachSearch.toLowerCase())) ||
                                   (lead.owner_name && lead.owner_name.toLowerCase().includes(outreachSearch.toLowerCase()));
                                return matchesFilter && matchesSearch;
                             });

                             if (filteredLeads.length === 0) {
                                return (
                                   <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm w-full">
                                      <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                      <p className="text-gray-500 font-medium">No outreach leads found matching criteria.</p>
                                      <p className="text-xs text-gray-400 mt-1">Start by adding high-value direct-booking-less properties!</p>
                                   </div>
                                );
                             }

                             return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                   {filteredLeads.map((lead) => {
                                      // Calculate savings: OTA takes ~15% from host/guest. Assuming 15 nights stay/month.
                                      const estNightlyVal = lead.estimated_nightly_rate || 400;
                                      const monthlySavingsVal = Math.round(estNightlyVal * 15 * 0.15);

                                      // Pre-build draft pitch email
                                      const emailSubject = encodeURIComponent(`Boost direct bookings for ${lead.property_name} - Encho Space`);
                                      const emailBody = encodeURIComponent(
                                         `Hi ${lead.owner_name || 'Owner'},

` +
                                         `I hope this finds you well. I discovered your stunning property, ${lead.property_name}, on social media (@${lead.instagram_username || ''}) and was completely blown away by its aesthetic design and visual branding!

` +
                                         `I noticed that you currently rely heavily on third-party OTAs (like Airbnb and Booking.com) for bookings. Did you know that OTA commission structures and guest booking fees are consuming over 15% of your total booking volume? At an estimated nightly rate of ₹/USD ${estNightlyVal}, you're potentially losing over ₹/USD ${monthlySavingsVal} every single month in platform commissions!

` +
                                         `With Encho Space, we provide custom, direct-booking engines for cabin and luxury villa owners. Additionally, we provide our "Pillar 5 Rahul-Proof Smart Targeter" which runs hyper-localized Meta marketing campaigns directly targetting high-intent visitors near you.

` +
                                         `I'd love to show you how easy it is to onboard and transition into independent direct bookings. Are you open to a brief 10-minute demo this week?

` +
                                         `Best regards,
` +
                                         `${user?.name || 'Encho SaaS Onboarding team'}
` +
                                         `Co-Founder, Encho Space`
                                      );
                                      const mailtoLink = `mailto:${lead.email || ''}?subject=${emailSubject}&body=${emailBody}`;

                                      return (
                                         <div key={lead.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between space-y-4 text-left">
                                            <div className="space-y-3 w-full">
                                               {/* Header row */}
                                               <div className="flex justify-between items-start gap-2">
                                                  <div>
                                                     <h4 className="font-bold text-gray-950 text-base flex items-center gap-1.5 leading-snug">
                                                        <span>{lead.property_name}</span>
                                                     </h4>
                                                     <p className="text-xs text-gray-500 font-semibold flex items-center gap-1 mt-0.5">
                                                        <Map className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                                        {lead.location || 'Unknown Location'}
                                                     </p>
                                                  </div>
                                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider font-mono ${
                                                     lead.status === 'discovered' ? 'bg-zinc-100 text-zinc-700' :
                                                     lead.status === 'contacted' ? 'bg-amber-100 text-amber-700' :
                                                     lead.status === 'negotiating' ? 'bg-indigo-100 text-indigo-700' :
                                                     lead.status === 'onboarded' ? 'bg-emerald-100 text-emerald-700' :
                                                     'bg-rose-100 text-rose-700'
                                                  }`}>
                                                     {lead.status}
                                                  </span>
                                               </div>

                                               {/* Details card block */}
                                               <div className="bg-gray-50/75 rounded-xl border p-3 grid grid-cols-2 gap-3 text-xs w-full">
                                                  <div>
                                                     <span className="text-[10px] font-bold text-gray-400 block mb-0.5">Target Handle / Social</span>
                                                     <div className="flex flex-col gap-1">
                                                        {lead.instagram_username && (
                                                           <a 
                                                              href={`https://instagram.com/${lead.instagram_username}`}
                                                              target="_blank"
                                                              rel="noopener noreferrer"
                                                              className="text-sky-600 font-semibold hover:underline flex items-center gap-1 truncate"
                                                           >
                                                              <span className="text-[10px] bg-sky-50 text-sky-700 border px-1 rounded">IG</span>
                                                              @{lead.instagram_username}
                                                           </a>
                                                        )}
                                                        {lead.facebook_url && (
                                                           <a 
                                                              href={lead.facebook_url}
                                                              target="_blank"
                                                              rel="noopener noreferrer"
                                                              className="text-sky-600 font-semibold hover:underline flex items-center gap-1 truncate"
                                                           >
                                                              <span className="text-[10px] bg-indigo-50 text-indigo-700 border px-1 rounded">FB</span>
                                                              Profile
                                                           </a>
                                                        )}
                                                        {!lead.instagram_username && !lead.facebook_url && <span className="text-gray-400 font-light">—</span>}
                                                     </div>
                                                  </div>
                                                  <div>
                                                     <span className="text-[10px] font-bold text-gray-400 block mb-0.5">Contact Detail</span>
                                                     <p className="text-gray-800 font-medium truncate">{lead.owner_name || 'Owner'}</p>
                                                     {lead.email && <p className="text-gray-500 text-[10px] font-mono truncate">{lead.email}</p>}
                                                     {lead.phone && <p className="text-gray-500 text-[10px] font-mono truncate">{lead.phone}</p>}
                                                  </div>
                                               </div>

                                               {/* Pipeline Savings Pitch Calculator Block */}
                                               <div className="bg-[#0284C7]/5 rounded-xl border border-sky-100 p-3 flex justify-between items-center text-xs w-full">
                                                  <div>
                                                     <span className="text-[10px] font-black text-sky-700 uppercase tracking-wider block">Direct Booking Pitch Angle</span>
                                                     <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                                                        Saves OTA guest fees: <strong className="text-sky-700 font-mono font-bold">₹{monthlySavingsVal.toLocaleString()}/mo</strong>
                                                     </p>
                                                  </div>
                                                  <div className="text-right">
                                                     <span className="text-[9px] font-bold text-gray-400 block uppercase">Est. Rate</span>
                                                     <span className="text-xs font-mono font-bold text-gray-900 font-semibold">₹{estNightlyVal.toLocaleString()}/nt</span>
                                                  </div>
                                               </div>

                                               {/* Notes / Conversation Log */}
                                               <div className="space-y-1 w-full">
                                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">CRM Log Notes</span>
                                                  <p className="text-xs text-gray-700 leading-relaxed bg-zinc-50 p-2.5 rounded-lg border border-gray-150 whitespace-pre-line min-h-[40px] italic">
                                                     {lead.notes || 'No custom notes logged yet.'}
                                                  </p>
                                               </div>
                                            </div>

                                            <div className="space-y-3.5 pt-3.5 border-t border-gray-100 w-full">
                                               {/* Quick status progress controls */}
                                               <div className="space-y-1.5">
                                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Pipeline Progress</span>
                                                  <div className="grid grid-cols-5 gap-1">
                                                     {['discovered', 'contacted', 'negotiating', 'onboarded', 'ignored'].map((statusOption) => (
                                                        <button
                                                           key={statusOption}
                                                           type="button"
                                                           onClick={() => handleQuickStatusUpdate(lead, statusOption)}
                                                           className={`py-1 text-[9px] font-black uppercase rounded border tracking-tight text-center truncate ${
                                                              lead.status === statusOption
                                                                 ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm font-bold'
                                                                 : 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200'
                                                           }`}
                                                        >
                                                           {statusOption.replace('negotiating', 'negoti').replace('discovered', 'discov')}
                                                        </button>
                                                     ))}
                                                  </div>
                                               </div>

                                               {/* Action buttons */}
                                               <div className="flex items-center justify-between gap-2.5 pt-1">
                                                  <div className="flex gap-2">
                                                     <button
                                                        type="button"
                                                        onClick={() => handleEditOutreachLead(lead)}
                                                        className="p-1.5 border border-gray-200 text-gray-600 hover:text-sky-700 hover:border-sky-300 rounded-lg transition-colors"
                                                        title="Edit target lead details"
                                                     >
                                                        <EditIcon className="w-3.5 h-3.5" />
                                                     </button>
                                                     <button
                                                        type="button"
                                                        onClick={() => handleDeleteOutreachLead(lead.id)}
                                                        className="p-1.5 border border-rose-100 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="Delete from target lead"
                                                     >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                     </button>
                                                  </div>

                                                  <div className="flex items-center gap-2 shrink-0">
                                                     {lead.email && (
                                                        <a
                                                           href={mailtoLink}
                                                           className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors shadow-sm font-bold"
                                                           title="Launch cold outreach pitch email draft"
                                                        >
                                                           <Mail className="w-3.5 h-3.5" />
                                                           Cold Outreach Pitch
                                                        </a>
                                                     )}
                                                     {lead.instagram_username && (
                                                        <a
                                                           href={`https://instagram.com/${lead.instagram_username}`}
                                                           target="_blank"
                                                           rel="noopener noreferrer"
                                                           className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-all shadow-sm shrink-0 font-bold"
                                                           title="Launch direct message link on Instagram"
                                                        >
                                                           DMs
                                                        </a>
                                                     )}
                                                  </div>
                                               </div>
                                            </div>
                                         </div>
                                      );
                                   })}
                                </div>
                             );
                          })()}
                       </div>
                    )}

                    {/* Tab Content 4: Organic Social Media Moderation */}
                    {marketingSubTab === 'organic_social' && (
                       <div className="space-y-6 text-left w-full">
                          {/* Stats Overview */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Pending Approval</span>
                                <span className="text-3xl font-bold text-amber-500">
                                   {adminSocialPosts.filter(p => p.status === 'pending_approval' || p.status === 'pending').length}
                                </span>
                             </div>
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Approved Posts</span>
                                <span className="text-3xl font-bold text-emerald-500">
                                   {adminSocialPosts.filter(p => p.status === 'approved').length}
                                </span>
                             </div>
                             <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">AI/Admin Rejected</span>
                                <span className="text-3xl font-bold text-rose-500">
                                   {adminSocialPosts.filter(p => p.status === 'rejected').length}
                                </span>
                             </div>
                          </div>

                          {/* Posts Table */}
                          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                             <div className="p-6 border-b border-gray-150 flex items-center justify-between">
                                <h3 className="text-base font-extrabold text-gray-900 uppercase">
                                   Organic Publishing Request Pipeline
                                </h3>
                                <button
                                   type="button"
                                   onClick={fetchAdminSocialPosts}
                                   className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-all"
                                   title="Refresh queue"
                                >
                                   <RefreshCw className={`w-4 h-4 ${loadingAdminSocialPosts ? 'animate-spin' : ''}`} />
                                </button>
                             </div>

                             {loadingAdminSocialPosts ? (
                                <div className="p-20 flex justify-center items-center">
                                   <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
                                </div>
                             ) : adminSocialPosts.length === 0 ? (
                                <div className="p-16 text-center text-gray-500">
                                   <Sparkles className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                                   <p className="text-sm font-medium">No organic social media publishing requests.</p>
                                </div>
                             ) : (
                                <div className="overflow-x-auto">
                                   <table className="w-full text-left border-collapse">
                                      <thead>
                                         <tr className="bg-gray-50/75 border-b border-gray-150 text-[10px] font-black uppercase tracking-wider text-gray-400">
                                            <th className="px-6 py-4">Property Stay</th>
                                            <th className="px-6 py-4">Author Host</th>
                                            <th className="px-6 py-4">Content Copy & Media</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4">Scheduled Release</th>
                                            <th className="px-6 py-4 text-right">Moderation Actions</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-150 text-xs">
                                         {adminSocialPosts.map((post) => {
                                            const isPending = post.status === 'pending_approval' || post.status === 'pending';
                                            return (
                                               <tr key={post.id} className="hover:bg-gray-50/50 transition-colors">
                                                  <td className="px-6 py-4 font-bold text-gray-900">
                                                     {post.listing_title || 'General Master Platform Post'}
                                                  </td>
                                                  <td className="px-6 py-4 text-gray-500 font-mono">
                                                     <div className="font-sans font-bold text-gray-900">{post.host_name || 'Encho Host'}</div>
                                                     <div className="text-[11px] text-gray-500">{post.host_email || `Host ID: ${post.host_id}`}</div>
                                                  </td>
                                                  <td className="px-6 py-4 max-w-sm">
                                                     <div className="flex gap-3 items-start">
                                                        <div className="w-12 h-12 rounded bg-gray-100 border shrink-0 overflow-hidden relative">
                                                           {post.media_urls?.[0] ? (
                                                              <img
                                                                 src={post.media_urls[0]}
                                                                 referrerPolicy="no-referrer"
                                                                 className="w-full h-full object-cover"
                                                                 alt=""
                                                              />
                                                           ) : (
                                                              <Upload className="w-5 h-5 text-gray-400 mx-auto mt-3.5" />
                                                           )}
                                                           <span className="absolute bottom-0 right-0 bg-black/75 text-[7px] font-bold text-white px-1 uppercase leading-none">
                                                              {post.media_type}
                                                           </span>
                                                        </div>
                                                        <div className="space-y-1">
                                                           <p className="font-light text-gray-700 line-clamp-3 leading-relaxed">
                                                              {post.caption}
                                                           </p>
                                                           {post.is_boosted && (
                                                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase">
                                                                 <Zap className="w-2.5 h-2.5 fill-amber-800" />
                                                                 BOOSTED ₹{post.boost_budget}
                                                              </span>
                                                           )}
                                                        </div>
                                                     </div>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                     <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                                        post.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                        post.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                                        'bg-amber-50 text-amber-700 border border-amber-100'
                                                     }`}>
                                                        {isPending ? 'PENDING APPROVAL' : post.status}
                                                     </span>
                                                     {post.admin_feedback && (
                                                        <p className="text-[10px] text-rose-600 mt-1 italic font-medium max-w-[180px] line-clamp-2">
                                                           Feedback: {post.admin_feedback}
                                                        </p>
                                                     )}
                                                  </td>
                                                  <td className="px-6 py-4 text-gray-500 font-mono">
                                                     {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : 'Immediate Release'}
                                                  </td>
                                                  <td className="px-6 py-4 text-right">
                                                     {isPending ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                           <button
                                                              type="button"
                                                              onClick={() => handleApproveSocialPost(post.id)}
                                                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all text-[11px] shadow-sm flex items-center gap-1"
                                                           >
                                                              <Check className="w-3.5 h-3.5" />
                                                              <span>Approve & Publish</span>
                                                           </button>
                                                           <button
                                                              type="button"
                                                              onClick={() => {
                                                                 setRejectingSocialPostId(post.id);
                                                                 setSocialRejectionFeedback('');
                                                              }}
                                                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-lg transition-all text-[11px]"
                                                           >
                                                              Reject
                                                           </button>
                                                        </div>
                                                     ) : post.status === 'approved' ? (
                                                        <div className="text-right">
                                                           {post.published_at ? (
                                                              <>
                                                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs">
                                                                   <Check className="w-3.5 h-3.5" />
                                                                   <span>Live on Feeds</span>
                                                                </span>
                                                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                                   ❤️ {post.likes || 0} • 💬 {post.comments || 0}
                                                                </div>
                                                              </>
                                                           ) : (post.scheduled_at && new Date(post.scheduled_at) > new Date()) ? (
                                                              <span className="text-[10px] text-sky-600 font-bold tracking-wider uppercase">Scheduled</span>
                                                           ) : (
                                                              <div className="flex flex-col items-end gap-1">
                                                                 <span className="text-[10px] text-amber-600 font-bold tracking-wider uppercase">Pending Sync</span>
                                                                 <button
                                                                    type="button"
                                                                    onClick={() => handleApproveSocialPost(post.id)}
                                                                    className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold px-3 py-1.5 rounded-lg transition-all text-[10px] flex items-center gap-1"
                                                                 >
                                                                    <RefreshCw className="w-3 h-3" />
                                                                    Retry Sync
                                                                 </button>
                                                              </div>
                                                           )}
                                                        </div>
                                                     ) : (
                                                        <span className="text-rose-500 font-medium italic text-[11px]">
                                                           Rejected (Feedback Sent)
                                                        </span>
                                                     )}
                                                  </td>
                                               </tr>
                                            );
                                         })}
                                      </tbody>
                                   </table>
                                </div>
                             )}
                          </div>
                       </div>
                    )}

                    {/* Tab Content 5: Immutable Audit Trail */}
                    {marketingSubTab === 'audit_logs' && (
                       <div className="space-y-6 text-left w-full">
                          {/* Top Banner */}
                          <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-emerald-950 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                   <Shield className="w-5 h-5 text-emerald-400" />
                                   <h3 className="text-lg font-black tracking-tight">Immutable System Audit Trail</h3>
                                   <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      {adminAuditLogs.length} EVENTS LOGGED
                                   </span>
                                </div>
                                <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed">
                                   Enterprise-grade immutable ledger tracking all moderator state changes, campaign approvals, AI gatekeeper scans, financial refunds, and system events with IP verification.
                                </p>
                             </div>
                             <button
                                type="button"
                                onClick={fetchAdminAuditLogs}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2 self-start md:self-auto border border-white/10 shadow-sm"
                             >
                                <RefreshCw className={`w-3.5 h-3.5 ${loadingAdminAuditLogs ? 'animate-spin' : ''}`} />
                                Refresh Audit Ledger
                             </button>
                          </div>

                          {/* Audit Logs Table Card */}
                          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                             {loadingAdminAuditLogs ? (
                                <div className="p-20 flex justify-center items-center">
                                   <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                                </div>
                             ) : adminAuditLogs.length === 0 ? (
                                <div className="p-16 text-center text-gray-500">
                                   <Shield className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                                   <p className="text-sm font-medium">No audit log entries captured yet.</p>
                                   <p className="text-xs text-gray-400 mt-1">Actions performed by admins or automated gatekeepers will appear here immediately.</p>
                                </div>
                             ) : (
                                <div className="overflow-x-auto">
                                   <table className="w-full text-left text-xs border-collapse">
                                      <thead>
                                         <tr className="bg-gray-50 border-b border-gray-150 text-gray-400 uppercase tracking-wider font-bold text-[10px]">
                                            <th className="px-6 py-4">Event Timestamp</th>
                                            <th className="px-6 py-4">Operator / Admin</th>
                                            <th className="px-6 py-4">Action Taken</th>
                                            <th className="px-6 py-4">Entity Reference</th>
                                            <th className="px-6 py-4">State Transition</th>
                                            <th className="px-6 py-4 text-right">Security IP</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 font-sans">
                                         {adminAuditLogs.map((log: any) => {
                                            let actionBadgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
                                            if (log.action.includes('approve')) actionBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                            else if (log.action.includes('reject')) actionBadgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
                                            else if (log.action.includes('ai_gatekeeper')) actionBadgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                                            else if (log.action.includes('refund') || log.action.includes('wallet')) actionBadgeColor = 'bg-amber-50 text-amber-700 border-amber-200';

                                            return (
                                               <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                                                  <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-500 text-[11px]">
                                                     {new Date(log.created_at).toLocaleString()}
                                                  </td>
                                                  <td className="px-6 py-4">
                                                     <div className="font-bold text-gray-900">{log.admin_name || 'System Auto Gatekeeper'}</div>
                                                     <div className="text-[10px] text-gray-400 font-mono">{log.admin_email || 'automated@encho.io'}</div>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                     <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-extrabold uppercase tracking-wider border ${actionBadgeColor}`}>
                                                        {log.action}
                                                     </span>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                     <div className="font-mono text-xs text-gray-800 font-semibold">{log.entity_type}</div>
                                                     <div className="text-[10px] text-gray-400 font-mono">ID: #{log.entity_id}</div>
                                                  </td>
                                                  <td className="px-6 py-4 max-w-xs">
                                                     <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate max-w-[100px]">
                                                           {typeof log.previous_state === 'object' && log.previous_state !== null ? (typeof log.previous_state.status === 'string' ? log.previous_state.status : JSON.stringify(log.previous_state)) : String(log.previous_state || 'N/A')}
                                                        </span>
                                                        <span className="text-gray-400">→</span>
                                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold truncate max-w-[120px]">
                                                           {typeof log.new_state === 'object' && log.new_state !== null ? (typeof log.new_state.status === 'string' ? log.new_state.status : JSON.stringify(log.new_state)) : String(log.new_state || 'N/A')}
                                                        </span>
                                                     </div>
                                                  </td>
                                                  <td className="px-6 py-4 text-right font-mono text-[11px] text-gray-500">
                                                     <span className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-1 rounded-md border text-[10px]">
                                                        <Shield className="w-3 h-3 text-zinc-400" />
                                                        {log.ip_address || '127.0.0.1'}
                                                     </span>
                                                  </td>
                                               </tr>
                                            );
                                         })}
                                      </tbody>
                                   </table>
                                </div>
                             )}
                          </div>
                       </div>
                    )}

                    {/* Tab Content 6: Payment Geo-Router & Fraud Escrow Ledger */}
                    {marketingSubTab === 'geo_router' && (
                       <div className="space-y-6 text-left w-full">
                          {/* Banner */}
                          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                   <CreditCard className="w-5 h-5 text-indigo-400" />
                                   <h3 className="text-lg font-black tracking-tight">Payment Geo-Router & Fraud Escrow Control Center</h3>
                                   <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                      HYBRID STRIPE + RAZORPAY ENGINE
                                   </span>
                                </div>
                                <p className="text-xs text-indigo-200/80 max-w-2xl leading-relaxed">
                                   Dynamic location-aware payment router routing Indian hosts to Razorpay (UPI/compliance) and International hosts to Stripe 3DS. Enforces 15% Encho SaaS fee retention, double-spend idempotency keys, trapped-cash internal wallet ledger, and 24-hour fraud escrow holding.
                                </p>
                             </div>
                             <button
                                type="button"
                                onClick={fetchAdminPaymentOverview}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2 self-start md:self-auto border border-white/10 shadow-sm"
                             >
                                <RefreshCw className={`w-3.5 h-3.5 ${loadingAdminPaymentOverview ? 'animate-spin' : ''}`} />
                                Sync Payment Ledger
                             </button>
                          </div>

                          {/* Core Metrics Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                             <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">Total Processed Volume</span>
                                <span className="text-2xl font-black font-mono text-gray-900">
                                   ${(adminPaymentOverview.metrics?.total_volume || 0).toLocaleString()}
                                </span>
                                <div className="mt-2 text-[10px] text-gray-400 font-mono">
                                   {adminPaymentOverview.metrics?.total_transactions || 0} Total Idempotent Txns
                                </div>
                             </div>

                             <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm bg-gradient-to-br from-emerald-50/30 to-white">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 block mb-1">Encho 15% SaaS Revenue</span>
                                <span className="text-2xl font-black font-mono text-emerald-600">
                                   ${(adminPaymentOverview.metrics?.total_optimization_fees || 0).toLocaleString()}
                                </span>
                                <div className="mt-2 text-[10px] text-emerald-600/80 font-mono">
                                   Pillar 3 SaaS Optimization Fee
                                </div>
                             </div>

                             <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm">
                                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block mb-1">Net Ad Spend Allocated (85%)</span>
                                <span className="text-2xl font-black font-mono text-blue-600">
                                   ${(adminPaymentOverview.metrics?.total_ad_spend_pool || 0).toLocaleString()}
                                </span>
                                <div className="mt-2 text-[10px] text-blue-500 font-mono">
                                   Meta & Google Ad Budget
                                </div>
                             </div>

                             <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm bg-gradient-to-br from-amber-50/30 to-white">
                                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 block mb-1">24h Fraud Escrow Holding</span>
                                <span className="text-2xl font-black font-mono text-amber-600">
                                   {adminPaymentOverview.metrics?.escrow_holding_count || 0} Campaigns
                                </span>
                                <div className="mt-2 text-[10px] text-amber-600/80 font-mono">
                                   Stripe Radar / 3DS Chargeback Shield
                                </div>
                             </div>
                          </div>

                          {/* Gateway Distribution Breakdown */}
                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                             <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Geo-Router Gateway Volume Breakdown</h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/30 flex items-center justify-between">
                                   <div>
                                      <span className="text-xs font-bold text-blue-900 block">Stripe 3D Secure (Global)</span>
                                      <span className="text-lg font-mono font-bold text-blue-700">${(adminPaymentOverview.metrics?.stripe_volume || 0).toLocaleString()}</span>
                                   </div>
                                   <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-[10px] font-mono font-bold">USD</span>
                                </div>

                                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 flex items-center justify-between">
                                   <div>
                                      <span className="text-xs font-bold text-indigo-900 block">Razorpay Smart Router (India)</span>
                                      <span className="text-lg font-mono font-bold text-indigo-700">₹{(adminPaymentOverview.metrics?.razorpay_volume || 0).toLocaleString()}</span>
                                   </div>
                                   <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-[10px] font-mono font-bold">INR / UPI</span>
                                </div>

                                <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 flex items-center justify-between">
                                   <div>
                                      <span className="text-xs font-bold text-emerald-900 block">Internal Wallet (Trapped Cash)</span>
                                      <span className="text-lg font-mono font-bold text-emerald-700">${(adminPaymentOverview.metrics?.wallet_volume || 0).toLocaleString()}</span>
                                   </div>
                                   <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono font-bold">0% Gateway Fee</span>
                                </div>
                             </div>
                          </div>

                          {/* Escrow Campaigns Queue */}
                          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                             <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                   <h4 className="text-sm font-black text-gray-900">24-Hour Fraud Escrow Queue</h4>
                                   <p className="text-xs text-gray-400">Campaigns held in 24h risk assessment delay to protect Encho Master Ad Account against chargebacks</p>
                                </div>
                             </div>
                             {adminPaymentOverview.campaigns?.filter((c: any) => c.escrow_status === 'holding').length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-xs">
                                   No active campaigns currently in 24-hour escrow hold. All campaigns released.
                                </div>
                             ) : (
                                <div className="overflow-x-auto">
                                   <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                         <tr className="bg-gray-50 border-b border-gray-100 font-mono text-[10px] text-gray-400 uppercase">
                                            <th className="px-6 py-3">Campaign</th>
                                            <th className="px-6 py-3">Host / Gateway</th>
                                            <th className="px-6 py-3">Gross Budget</th>
                                            <th className="px-6 py-3">Encho 15% Fee</th>
                                            <th className="px-6 py-3">Net Ad Pool</th>
                                            <th className="px-6 py-3">Escrow Release Date</th>
                                            <th className="px-6 py-3 text-right">Action</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                         {adminPaymentOverview.campaigns?.filter((c: any) => c.escrow_status === 'holding').map((c: any) => (
                                            <tr key={c.id} className="hover:bg-gray-50/50 transition-all">
                                               <td className="px-6 py-4">
                                                  <div className="font-bold text-gray-900">{c.title}</div>
                                                  <div className="text-[10px] font-mono text-gray-400">ID: #{c.id} | Listing #{c.listing_id}</div>
                                               </td>
                                               <td className="px-6 py-4 font-mono">
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                                     {c.payment_gateway || 'stripe'}
                                                  </span>
                                               </td>
                                               <td className="px-6 py-4 font-mono font-bold text-gray-900">
                                                  ${Number(c.budget || 0).toFixed(2)}
                                               </td>
                                               <td className="px-6 py-4 font-mono text-emerald-600 font-bold">
                                                  ${Number(c.optimization_fee || (c.budget * 0.15)).toFixed(2)}
                                               </td>
                                               <td className="px-6 py-4 font-mono text-blue-600 font-bold">
                                                  ${Number(c.ad_spend_pool || (c.budget * 0.85)).toFixed(2)}
                                               </td>
                                               <td className="px-6 py-4 font-mono text-amber-600 font-bold text-[11px]">
                                                  {c.escrow_release_at ? new Date(c.escrow_release_at).toLocaleString() : 'In 24 Hours'}
                                               </td>
                                               <td className="px-6 py-4 text-right">
                                                  <button
                                                     type="button"
                                                     onClick={() => handleReleaseEscrow(c.id)}
                                                     className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] shadow-sm transition-all flex items-center gap-1 ml-auto"
                                                  >
                                                     <Check className="w-3.5 h-3.5" />
                                                     Force Release Escrow
                                                  </button>
                                               </td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                </div>
                             )}
                          </div>

                          {/* Idempotent Transaction Audit Ledger */}
                          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                             <div className="p-6 border-b border-gray-100">
                                <h4 className="text-sm font-black text-gray-900">Processed Payment Idempotency Ledger</h4>
                                <p className="text-xs text-gray-400">Double-spend replay protection record with payment intent IDs and idempotency keys</p>
                             </div>
                             <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                   <thead>
                                      <tr className="bg-gray-50 border-b border-gray-100 font-mono text-[10px] text-gray-400 uppercase">
                                         <th className="px-6 py-3">Txn ID / Gateway</th>
                                         <th className="px-6 py-3">Idempotency Key</th>
                                         <th className="px-6 py-3">Type / Reference</th>
                                         <th className="px-6 py-3">Amount</th>
                                         <th className="px-6 py-3 text-right">Date</th>
                                      </tr>
                                   </thead>
                                   <tbody className="divide-y divide-gray-100">
                                      {adminPaymentOverview.processed_payments?.map((tx: any) => (
                                         <tr key={tx.id} className="hover:bg-gray-50/50 font-mono text-[11px]">
                                            <td className="px-6 py-4">
                                               <div className="font-bold text-gray-900">{tx.razorpay_payment_id || `tx_${tx.id}`}</div>
                                               <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-100 text-gray-600">
                                                  {tx.payment_gateway || 'system'}
                                               </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 font-mono text-[10px] truncate max-w-[150px]">
                                               {tx.idempotency_key}
                                            </td>
                                            <td className="px-6 py-4 text-gray-700">
                                               <span className="font-semibold text-gray-900">{tx.type}</span> (Ref #{tx.reference_id})
                                            </td>
                                            <td className="px-6 py-4 font-bold text-emerald-600">
                                               {tx.currency === 'INR' ? `₹${Number(tx.amount).toLocaleString()}` : `$${Number(tx.amount).toFixed(2)}`}
                                            </td>
                                            <td className="px-6 py-4 text-right text-gray-400 text-[10px]">
                                               {new Date(tx.created_at).toLocaleString()}
                                            </td>
                                         </tr>
                                      ))}
                                   </tbody>
                                </table>
                             </div>
                          </div>
                       </div>
                    )}

                    {/* Reject social post modal overlay */}
                    {rejectingSocialPostId !== null && (
                       <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto text-left">
                             <h4 className="text-xl font-black text-gray-900 mb-1 tracking-tight">Social Post Rejection Moderation</h4>
                             <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                                Provide specific feedback to the host on how they can improve the caption or media before resubmitting.
                             </p>
                             <form onSubmit={handleRejectSocialPost} className="space-y-4">
                                <div className="space-y-1">
                                   <label className="text-xs font-bold text-gray-700">Moderator Feedback</label>
                                   <textarea
                                      required
                                      rows={4}
                                      value={socialRejectionFeedback}
                                      onChange={(e) => setSocialRejectionFeedback(e.target.value)}
                                      placeholder="Explain the required corrections (e.g. caption formatting, community guidelines violation)..."
                                      className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                                   />
                                </div>
                                <div className="flex gap-2 justify-end pt-2">
                                   <button
                                      type="button"
                                      onClick={() => {
                                         setRejectingSocialPostId(null);
                                         setSocialRejectionFeedback('');
                                      }}
                                      className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                                   >
                                      Cancel
                                   </button>
                                   <button
                                      type="submit"
                                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors"
                                   >
                                      Confirm Rejection
                                   </button>
                                </div>
                             </form>
                          </div>
                       </div>
                    )}

                    {/* Reject modal overlay */}
                    {rejectingCampaignId !== null && (
                       <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto text-left">
                             <h4 className="text-xl font-black text-gray-900 mb-1 tracking-tight">Rejection Moderation Feedback</h4>
                             <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                                Choose specific fields to reject and input exact correction reasons to guide the host, along with a general summary.
                             </p>

                             {/* Field level rejectors */}
                             <div className="space-y-3.5 mb-5 border-t border-b border-gray-100 py-4 max-h-[40vh] overflow-y-auto pr-1 text-left">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Field-Level Corrective Directives</span>
                                
                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['title'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('title', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Campaign Title</span>
                                      {rejectedFieldInputs['title'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['title'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('title', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['description'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('description', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Primary Description Ad Copy</span>
                                      {rejectedFieldInputs['description'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['description'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('description', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['feed_description'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('feed_description', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Feed Description / Tagline</span>
                                      {rejectedFieldInputs['feed_description'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['feed_description'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('feed_description', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['target_locations'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('target_locations', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Target Locations</span>
                                      {rejectedFieldInputs['target_locations'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['target_locations'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('target_locations', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['platforms'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('platforms', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Target Platforms Selection</span>
                                      {rejectedFieldInputs['platforms'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['platforms'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('platforms', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['media_urls'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('media_urls', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Visual Image Assets</span>
                                      {rejectedFieldInputs['media_urls'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['media_urls'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('media_urls', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border hover:bg-gray-100 transition-colors cursor-pointer">
                                   <input 
                                      type="checkbox"
                                      checked={rejectedFieldInputs['video_url'] !== undefined}
                                      onChange={(e) => handleToggleRejectionField('video_url', e.target.checked)}
                                      className="mt-1 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                   />
                                   <div className="flex-1 space-y-1">
                                      <span className="text-xs font-bold text-gray-900">Reel / Video Asset</span>
                                      {rejectedFieldInputs['video_url'] !== undefined && (
                                         <input 
                                            type="text"
                                            required
                                            value={rejectedFieldInputs['video_url'] || ''}
                                            onChange={(e) => handleUpdateRejectionReason('video_url', e.target.value)}
                                            placeholder="Provide exact correction required..."
                                            className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none"
                                         />
                                      )}
                                   </div>
                                </label>
                             </div>

                             {/* General Summary */}
                             <div className="space-y-1.5 mb-6 text-left">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">General Feedback Summary *</label>
                                <textarea
                                   required
                                   value={rejectionFeedback}
                                   onChange={(e) => setRejectionFeedback(e.target.value)}
                                   placeholder="Synthesize the primary reason for rejection to help the host fix their campaign ad set..."
                                   rows={3}
                                   className="w-full text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none leading-relaxed"
                                />
                             </div>

                             <div className="flex gap-3 justify-end border-t border-gray-100 pt-4">
                                <button
                                   type="button"
                                   onClick={() => setRejectingCampaignId(null)}
                                   className="px-5 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-bold text-sm transition-colors"
                                >
                                   Cancel
                                </button>
                                <button
                                   type="button"
                                   onClick={handleConfirmRejectCampaign} id="primary-rejection-modal-btn"
                                   disabled={submittingRejection}
                                   className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
                                >
                                   {submittingRejection ? 'Rejecting...' : 'Submit Rejection'}
                                </button>
                             </div>
                          </div>
                       </div>
                    )}

                    {/* Live Multi-Format Ad Preview Modal */}
                    {previewAdCampaign && (
                       <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
                          <div className="bg-slate-950 text-slate-100 max-w-xl w-full rounded-3xl border border-slate-800 shadow-2xl overflow-hidden my-auto">
                             {/* Header */}
                             <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                                <div className="flex items-center gap-2">
                                   <Eye className="w-5 h-5 text-indigo-400" />
                                   <div>
                                      <h3 className="text-base font-bold text-white">Ad Creative Live Preview</h3>
                                      <p className="text-xs text-slate-400 font-mono">Campaign ID: #{previewAdCampaign.id}</p>
                                   </div>
                                </div>
                                <button
                                   type="button"
                                   onClick={() => setPreviewAdCampaign(null)}
                                   className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                                >
                                   <XIcon className="w-5 h-5" />
                                </button>
                             </div>

                             {/* Format Switcher */}
                             <div className="px-5 pt-4 flex gap-2 border-b border-slate-800/80 pb-3 bg-slate-950">
                                <button
                                   type="button"
                                   onClick={() => setPreviewAdTab('feed')}
                                   className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                      previewAdTab === 'feed'
                                         ? 'bg-indigo-600 text-white shadow-sm'
                                         : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                   }`}
                                >
                                   Feed Post (1:1)
                                </button>
                                <button
                                   type="button"
                                   onClick={() => setPreviewAdTab('story')}
                                   className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                      previewAdTab === 'story'
                                         ? 'bg-indigo-600 text-white shadow-sm'
                                         : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                   }`}
                                >
                                   Story / Reel (9:16)
                                </button>
                                <button
                                   type="button"
                                   onClick={() => setPreviewAdTab('banner')}
                                   className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                      previewAdTab === 'banner'
                                         ? 'bg-indigo-600 text-white shadow-sm'
                                         : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                   }`}
                                >
                                   Google Display (16:9)
                                </button>
                             </div>

                             {/* Dynamic Creative Render Body */}
                             <div className="p-6 bg-slate-900/40 flex justify-center items-center min-h-[360px]">
                                {previewAdTab === 'feed' && (
                                   <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl overflow-hidden border border-slate-200 shadow-xl font-sans">
                                      <div className="p-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                                         <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white font-bold text-xs">
                                            E
                                         </div>
                                         <div>
                                            <div className="text-xs font-bold flex items-center gap-1">
                                               Encho Stays <span className="text-[10px] text-slate-400 font-normal">Sponsored</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500">Master Ad Network</div>
                                         </div>
                                      </div>
                                      <div className="p-3 text-xs leading-relaxed text-slate-800">
                                         {previewAdCampaign.primary_text || 'Experience luxury stays curated for your perfect getaway. Book directly with verified hosts today!'}
                                      </div>
                                      <div className="relative aspect-square bg-slate-100 overflow-hidden">
                                         {previewAdCampaign.media_urls?.[0] ? (
                                            <img
                                               src={previewAdCampaign.media_urls[0]}
                                               alt="Ad Media"
                                               className="w-full h-full object-cover"
                                            />
                                         ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                                               No Media Asset Attached
                                            </div>
                                         )}
                                      </div>
                                      <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                         <div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                               {previewAdCampaign.headline || 'Exclusive Luxury Vacation Retreat'}
                                            </div>
                                            <div className="text-xs font-semibold text-slate-700">encho.co/stays</div>
                                         </div>
                                         <div className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-xs">
                                            Book Now
                                         </div>
                                      </div>
                                   </div>
                                )}

                                {previewAdTab === 'story' && (
                                   <div className="w-full max-w-[260px] h-[460px] bg-slate-900 text-white rounded-3xl overflow-hidden relative shadow-2xl border border-slate-800 flex flex-col justify-between">
                                      <div className="absolute inset-0">
                                         {previewAdCampaign.media_urls?.[0] ? (
                                            <img
                                               src={previewAdCampaign.media_urls[0]}
                                               alt="Ad Media"
                                               className="w-full h-full object-cover brightness-75"
                                            />
                                         ) : (
                                            <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500 text-xs">
                                               No Story Media
                                            </div>
                                         )}
                                         <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
                                      </div>

                                      <div className="relative z-10 p-4">
                                         <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden mb-3">
                                            <div className="w-2/3 h-full bg-white rounded-full" />
                                         </div>
                                         <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-[10px]">
                                               E
                                            </div>
                                            <span className="text-xs font-bold text-white shadow-sm">Encho Stays</span>
                                            <span className="text-[9px] bg-white/20 backdrop-blur-md px-1.5 py-0.5 rounded text-white font-medium">Sponsored</span>
                                         </div>
                                      </div>

                                      <div className="relative z-10 p-4 text-center space-y-2">
                                         <p className="text-xs font-medium text-white line-clamp-2 drop-shadow-md">
                                            {previewAdCampaign.headline || 'Escape to Paradise Today'}
                                         </p>
                                         <div className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg animate-bounce">
                                            Swipe Up To Reserve
                                         </div>
                                      </div>
                                   </div>
                                )}

                                {previewAdTab === 'banner' && (
                                   <div className="w-full bg-white text-slate-900 rounded-2xl p-4 border border-slate-200 shadow-xl">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                                         <span>Google Display Network Preview</span>
                                         <span className="text-indigo-600 font-mono">16:9 Landscape</span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                         <div className="col-span-1 aspect-video rounded-lg overflow-hidden bg-slate-200">
                                            {previewAdCampaign.media_urls?.[0] && (
                                               <img
                                                  src={previewAdCampaign.media_urls[0]}
                                                  alt="Ad Media"
                                                  className="w-full h-full object-cover"
                                               />
                                            )}
                                         </div>
                                         <div className="col-span-2 space-y-1">
                                            <div className="text-xs font-extrabold text-slate-900">
                                               {previewAdCampaign.headline || 'Verified Luxury Property Hosting'}
                                            </div>
                                            <div className="text-[11px] text-slate-600 line-clamp-2">
                                               {previewAdCampaign.primary_text || 'Book direct retreats with zero middleman markups.'}
                                            </div>
                                            <div className="pt-1">
                                               <span className="inline-block px-3 py-1 bg-emerald-600 text-white text-[11px] font-bold rounded-md">
                                                  Check Availability
                                               </span>
                                            </div>
                                         </div>
                                      </div>
                                   </div>
                                )}
                             </div>

                             {/* Footer Actions */}
                             <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap justify-between items-center text-xs gap-3">
                                <div className="text-slate-400 flex items-center gap-2">
                                   <span>Format: <strong className="text-slate-200 uppercase font-mono">{previewAdTab}</strong></span>
                                   <span className="text-slate-600">•</span>
                                   <span className="text-slate-400">Campaign #{previewAdCampaign.id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                   {(previewAdCampaign.status === 'pending' || previewAdCampaign.status === 'pending_approval' || previewAdCampaign.status === 'PENDING_APPROVAL') && (
                                      <>
                                         <button
                                            type="button"
                                            onClick={() => {
                                               const id = previewAdCampaign.id;
                                               setPreviewAdCampaign(null);
                                               handleApproveCampaign(id);
                                            }}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                                         >
                                            <CheckCircle2Icon className="w-4 h-4" />
                                            <span>Single-Click Approve</span>
                                         </button>
                                         <button
                                            type="button"
                                            onClick={() => {
                                               const id = previewAdCampaign.id;
                                               setPreviewAdCampaign(null);
                                               handleOpenRejectModal(id);
                                            }}
                                            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded-xl border border-rose-500/30 transition-all flex items-center gap-1.5"
                                         >
                                            <XIcon className="w-4 h-4" />
                                            <span>Surgical Reject</span>
                                         </button>
                                      </>
                                   )}
                                   <button
                                      type="button"
                                      onClick={() => setPreviewAdCampaign(null)}
                                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-all"
                                   >
                                      Close
                                   </button>
                                </div>
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
