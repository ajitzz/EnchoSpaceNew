import React, { useState, useEffect } from 'react';
import { MarketingCampaign, Listing } from '../types';
import { 
  Sparkles, CheckCircle, AlertTriangle, Play, Pause, BarChart3, 
  Tv, Eye, MousePointerClick, TrendingUp, DollarSign, Target, Plus, 
  Trash2, Send, Check, ShieldCheck, HelpCircle, Loader2, CreditCard, ExternalLink,
  Heart, MessageSquare, Bookmark, ChevronLeft, ChevronRight, Volume2, Share2, MoreHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';

interface HostMarketingProps {
  user: any;
  listings: Listing[];
}

export default function HostMarketing({ user, listings }: HostMarketingProps) {
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<MarketingCampaign | null>(null);
  const [selectedCampaignForAnalytics, setSelectedCampaignForAnalytics] = useState<MarketingCampaign | null>(null);

  // Form states for creating campaign
  const [formData, setFormData] = useState({
    listing_id: '',
    title: '',
    description: '',
    video_url: '',
    platforms: [] as string[],
    budget: 2500,
    target_locations: '',
    ad_format: 'post' as 'post' | 'reel' | 'carousel' | 'story',
    feed_description: '',
    media_urls: [] as string[]
  });

  // Track layout & alignment options (Scenario 1 advanced design!)
  const [mediaAlignment, setMediaAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [mediaAspect, setMediaAspect] = useState<'1:1' | '9:16' | '16:9'>('1:1');
  const [previewPlatform, setPreviewPlatform] = useState<'instagram' | 'facebook'>('instagram');
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [rejectedFieldsMap, setRejectedFieldsMap] = useState<Record<string, string>>({});
  const [newMediaUrl, setNewMediaUrl] = useState('');

  // AI precheck states
  const [runningAiCheckId, setRunningAiCheckId] = useState<number | null>(null);
  const [aiCheckResult, setAiCheckResult] = useState<any | null>(null);

  // Payment states
  const [isPaying, setIsPaying] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<'stripe' | 'razorpay'>('stripe');
  const [upiId, setUpiId] = useState('');

  const PLATFORM_OPTIONS = [
    { id: 'facebook_feed', label: 'Facebook Feed', icon: 'FB' },
    { id: 'facebook_stories', label: 'Facebook Stories & Reels', icon: 'FBR' },
    { id: 'instagram_feed', label: 'Instagram Feed', icon: 'IG' },
    { id: 'instagram_stories', label: 'Instagram Stories & Reels', icon: 'IGR' }
  ];

  const fetchCampaigns = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/marketing/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
        if (data.length > 0 && !selectedCampaignForAnalytics) {
          // Find first active campaign or default to first
          const active = data.find((c: any) => c.status === 'active') || data[0];
          setSelectedCampaignForAnalytics(active);
        }
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    // Poll analytics changes every 5 seconds for simulation liveliness!
    const interval = setInterval(() => {
      fetchCampaigns();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // When listing selection changes, auto-populate listing details! (Scenario 1 core requirement)
  const handleListingChange = (listingId: string) => {
    const listing = listings.find(l => String(l.id) === String(listingId));
    if (listing) {
      // Gather existing media URLs from the listing
      const existingMedia: string[] = [];
      if (listing.imageUrl) existingMedia.push(listing.imageUrl);
      if (listing.imageUrls && Array.isArray(listing.imageUrls)) {
        listing.imageUrls.forEach(url => {
          if (url && !existingMedia.includes(url)) existingMedia.push(url);
        });
      }

      setFormData(prev => ({
        ...prev,
        listing_id: listingId,
        title: prev.title || `Experience Luxury at ${listing.title}`,
        description: prev.description || listing.description || `Escape to a paradise of serenity. Book your exclusive getaway at ${listing.title} today!`,
        feed_description: prev.feed_description || `🔥 Special Booking Offer on ${listing.title}! Nestled in beautiful ${listing.city || 'scenic landscapes'}, this private luxury stay has everything you need for a restorative stay. Book now!`,
        video_url: prev.video_url || listing.video_url || '',
        media_urls: existingMedia.length > 0 ? existingMedia : prev.media_urls,
        target_locations: prev.target_locations || listing.city || 'Mumbai, Delhi, Bangalore'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        listing_id: listingId
      }));
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.listing_id || !formData.title || !formData.description) {
      addToast('Missing Fields', 'Please complete all required fields.', 'warning');
      return;
    }
    if (formData.platforms.length === 0) {
      addToast('Select Platforms', 'Please select at least one social media platform.', 'warning');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const method = editingCampaignId ? 'PUT' : 'POST';
      const url = editingCampaignId 
        ? `/api/marketing/campaigns/${editingCampaignId}`
        : '/api/marketing/campaigns';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        addToast('Success', editingCampaignId ? 'Campaign draft updated successfully!' : 'Marketing campaign draft created successfully!', 'success');
        setShowCreateModal(false);
        setEditingCampaignId(null);
        setRejectedFieldsMap({});
        setFormData({
          listing_id: '',
          title: '',
          description: '',
          video_url: '',
          platforms: [],
          budget: 2500,
          target_locations: '',
          ad_format: 'post',
          feed_description: '',
          media_urls: []
        });
        fetchCampaigns();
      } else {
        const errorData = await res.json();
        addToast('Error', errorData.error || 'Failed to create campaign draft', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'Something went wrong while saving draft', 'error');
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    if (!confirm('Are you sure you want to delete this campaign draft?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/marketing/campaigns/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('Deleted', 'Campaign deleted successfully.', 'info');
        if (selectedCampaignForAnalytics?.id === id) {
          setSelectedCampaignForAnalytics(null);
        }
        fetchCampaigns();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunAiCheck = async (campaign: MarketingCampaign) => {
    setRunningAiCheckId(campaign.id);
    setAiCheckResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}/ai-check`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAiCheckResult({ campaignId: campaign.id, ...data });
        addToast('AI Pre-Check Complete', `Ad score: ${data.score}/100. Read suggestions below.`, 'success');
      } else {
        addToast('AI Pre-Check Failed', 'Unable to run AI quality precheck.', 'error');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRunningAiCheckId(null);
    }
  };

  const handlePlatformToggle = (id: string) => {
    setFormData(prev => {
      const platforms = prev.platforms.includes(id)
        ? prev.platforms.filter(p => p !== id)
        : [...prev.platforms, id];
      return { ...prev, platforms };
    });
  };

  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;

    if (selectedGateway === 'stripe') {
      if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
        addToast('Missing Details', 'Please complete your Stripe card billing fields.', 'warning');
        return;
      }
    } else {
      if (!upiId && (!cardName || !cardNumber)) {
        addToast('Missing Details', 'Please enter a UPI ID or Card details for Razorpay checkout.', 'warning');
        return;
      }
    }

    setIsPaying(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/marketing/campaigns/${showPayModal.id}/subscribe`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          gateway: selectedGateway,
          amount: showPayModal.budget
        })
      });

      if (res.ok) {
        addToast('Checkout Initialized!', `Payment successfully processed via ${selectedGateway.toUpperCase()}! Your campaign draft is now sent for Admin Quality Control review. webhook dispatched!`, 'success');
        setShowPayModal(null);
        setCardName('');
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');
        setUpiId('');
        fetchCampaigns();
      } else {
        addToast('Payment Error', 'Failed to initialize subscription routing.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error', 'An unexpected error occurred during payment.', 'error');
    } finally {
      setIsPaying(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/50 shadow-emerald-100/30';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200/50 shadow-amber-100/30';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200/50 shadow-rose-100/30';
      default:
        return 'bg-zinc-50 text-zinc-600 border-zinc-200 shadow-zinc-100/30';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 animate-fade-in pb-40">
      
      {/* Upper Title & Brand Layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.25em] block font-mono">
              Encho Space Marketing
            </span>
            <span className="bg-blue-100 text-blue-700 text-[8.5px] font-bold uppercase px-2 py-0.5 rounded-full font-mono scale-90">Meta CAPI sandboxed</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">Host marketing</h1>
          <p className="text-gray-500 font-light mt-1 max-w-xl text-sm leading-relaxed">
            Market your stays on Facebook & Instagram directly from your Encho Space dashboard. Programmatically managed via sandboxed pixels to avoid Meta BM flags.
          </p>
        </div>

        <button 
          onClick={() => {
            if (listings.length === 0) {
              addToast('No Listings Found', 'Please host a property listing first before running campaigns.', 'warning');
              return;
            }
            setEditingCampaignId(null);
            setRejectedFieldsMap({});
            setFormData({
              listing_id: '',
              title: '',
              description: '',
              video_url: '',
              platforms: [],
              budget: 2500,
              target_locations: '',
              ad_format: 'post',
              feed_description: '',
              media_urls: []
            });
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Launch new campaign</span>
        </button>
      </div>

      {/* Meta Ad Account Sandboxing Safety Banner */}
      <div className="mb-10 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 border border-blue-100 rounded-3xl p-6 flex flex-col md:flex-row gap-5 items-start md:items-center">
        <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight mb-1">PROGRAMMATIC SANDBOX & DEATH PENALTY PROTECTION IN EFFECT</h4>
          <p className="text-xs text-gray-600 leading-relaxed font-light">
            Each resort utilizes programmatically partitioned System User Tokens and sandboxed Meta Conversions API (CAPI) endpoints. Stays are never co-mingled under a single Pixel, completely neutralizing the risk of a collective Meta Business Manager ban.
          </p>
        </div>
        <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50/50 border border-blue-100 px-3 py-1.5 rounded-xl uppercase">
          Status: Protected
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: Campaigns List */}
          <div className="lg:col-span-7 space-y-6">
            <h3 className="text-lg font-bold text-gray-900 uppercase tracking-tight text-[13px] text-gray-400">Your campaigns ({campaigns.length})</h3>
            
            {campaigns.length === 0 ? (
              <div className="bg-white border text-center p-12 rounded-3xl text-gray-500 border-dashed">
                <Target className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <h4 className="font-bold text-gray-900 mb-1">No marketing campaigns yet</h4>
                <p className="text-sm font-light text-gray-500 max-w-sm mx-auto mb-6">
                  Create a campaign draft, optimize it with our automated Gemini AI, and publish to Facebook & Instagram feeds.
                </p>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Create Draft
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div 
                    key={campaign.id}
                    onClick={() => setSelectedCampaignForAnalytics(campaign)}
                    className={`
                      bg-white p-5 rounded-3xl border transition-all duration-300 cursor-pointer text-left relative overflow-hidden
                      ${selectedCampaignForAnalytics?.id === campaign.id 
                        ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-md' 
                        : 'border-zinc-150 hover:border-zinc-300 hover:shadow-sm'}
                    `}
                  >
                    <div className="flex gap-4">
                      {/* Image */}
                      <img 
                        src={campaign.listing_image || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6'} 
                        className="w-16 h-16 rounded-2xl object-cover bg-gray-100 shrink-0 border"
                        alt="" 
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <h4 className="font-bold text-gray-900 truncate text-[15px]">{campaign.title}</h4>
                          <span className={`text-[9px] font-extrabold uppercase border px-2 py-0.5 rounded-md tracking-wider ${getStatusStyle(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </div>
                        <p className="text-xs font-light text-gray-500 truncate mb-3">Linked: {campaign.listing_title}</p>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-gray-700">
                          <span className="flex items-center gap-1 font-mono">
                            Budget: <span className="text-gray-900 font-bold">{formatPrice(campaign.budget, 'INR')}</span>/mo
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="flex items-center gap-1">
                            Platforms: <span className="text-gray-900 font-bold">{(campaign.platforms || []).length} active</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status Feedback Context */}
                    {campaign.status === 'draft' && (
                      <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50/50 border border-amber-100/30 px-2.5 py-1 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Ad is currently saved as a draft</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunAiCheck(campaign);
                            }}
                            disabled={runningAiCheckId === campaign.id}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100/20 px-3 py-1.5 rounded-xl flex items-center gap-1"
                          >
                            {runningAiCheckId === campaign.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            <span>AI Check</span>
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPayModal(campaign);
                            }}
                            className="text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>Pay & Launch</span>
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCampaign(campaign.id);
                            }}
                            className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 rounded-xl"
                            title="Delete draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {campaign.status === 'pending' && (
                      <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs text-amber-700 font-bold bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                          <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                          <span>Pending Quality Control Approval. Admin analyst team is reviewing.</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-light pl-1">
                          Ad review guarantees brand safety, copyright-compliant background music, and optimal visual formats.
                        </p>
                      </div>
                    )}

                    {campaign.status === 'rejected' && (
                      <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col gap-2 bg-rose-50/20 p-3 rounded-2xl border border-rose-100/50">
                        <div className="flex items-center gap-2 text-xs text-rose-700 font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Quality Control Review Rejected</span>
                        </div>
                        <p className="text-xs text-gray-600 font-light">
                          <strong className="font-bold text-gray-900">Feedback:</strong> {campaign.admin_feedback || 'The ad contains copyright-flagged music or claims that do not meet guidelines.'}
                        </p>
                        <div className="flex justify-end gap-2 mt-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCampaignId(campaign.id);
                              setRejectedFieldsMap(campaign.rejected_fields || {});
                              setFormData({
                                listing_id: String(campaign.listing_id),
                                title: campaign.title,
                                description: campaign.description,
                                video_url: campaign.video_url || '',
                                platforms: campaign.platforms || [],
                                budget: campaign.budget,
                                target_locations: campaign.target_locations || '',
                                ad_format: campaign.ad_format || 'post',
                                feed_description: campaign.feed_description || '',
                                media_urls: campaign.media_urls || []
                              });
                              setShowCreateModal(true);
                            }}
                            className="text-xs font-bold text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-50"
                          >
                            Revise Draft
                          </button>
                        </div>
                      </div>
                    )}

                    {campaign.status === 'active' && (
                      <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between bg-emerald-50/25 px-3 py-2 rounded-xl border border-emerald-100/50">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          <span>Live Campaign Running on Facebook & Instagram Feeds</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-700">Ad Account ID: #ENC_{campaign.id}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* AI PRECHECK PREVIEW CONTEXT */}
            <AnimatePresence>
              {aiCheckResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-zinc-900 text-white rounded-3xl p-6 shadow-xl border border-zinc-800 text-left"
                >
                  <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-500 text-white rounded-xl">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-sm uppercase tracking-wider">Gemini Automated Copy Optimizer</h4>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-400">Score:</span>
                      <span className="text-lg font-black text-blue-400 font-mono">{aiCheckResult.score}/100</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {aiCheckResult.checks?.map((check: any, idx: number) => (
                      <div key={idx} className="bg-zinc-850 p-3 rounded-2xl border border-zinc-800/50 flex gap-2.5 items-start">
                        {check.passed ? (
                          <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="text-xs font-bold text-zinc-100">{check.name}</div>
                          <div className="text-[10px] text-zinc-400 font-light mt-0.5 leading-relaxed">{check.feedback}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-850">
                    <div className="text-xs font-bold text-blue-400 mb-1 flex items-center gap-1">
                      <span>Copywriting Optimization Suggestion</span>
                    </div>
                    <p className="text-xs font-light text-zinc-300 leading-relaxed font-sans">
                      {aiCheckResult.suggestions}
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button 
                      onClick={() => setAiCheckResult(null)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Dismiss analysis
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT: Live Campaign Analytics Screen */}
          <div className="lg:col-span-5 bg-white p-6 md:p-8 rounded-3xl border border-zinc-150">
            {selectedCampaignForAnalytics ? (
              <div className="text-left space-y-6">
                <div>
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block font-mono">
                    Live Performance
                  </span>
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight mt-1 truncate">
                    {selectedCampaignForAnalytics.title}
                  </h3>
                  <p className="text-xs font-light text-gray-500">Linked stays: {selectedCampaignForAnalytics.listing_title}</p>
                </div>

                {selectedCampaignForAnalytics.status === 'active' ? (
                  <>
                    {/* Active Stats Panel */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-50 border p-4 rounded-2xl">
                        <div className="text-zinc-400 flex items-center gap-1.5 mb-1">
                          <Eye className="w-4 h-4 text-zinc-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Impressions</span>
                        </div>
                        <h4 className="text-2xl font-black text-gray-900 font-mono">
                          {selectedCampaignForAnalytics.analytics?.impressions.toLocaleString() || '0'}
                        </h4>
                      </div>

                      <div className="bg-zinc-50 border p-4 rounded-2xl">
                        <div className="text-zinc-400 flex items-center gap-1.5 mb-1">
                          <MousePointerClick className="w-4 h-4 text-zinc-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Link Clicks</span>
                        </div>
                        <h4 className="text-2xl font-black text-gray-900 font-mono">
                          {selectedCampaignForAnalytics.analytics?.clicks.toLocaleString() || '0'}
                        </h4>
                      </div>

                      <div className="bg-zinc-50 border p-4 rounded-2xl">
                        <div className="text-zinc-400 flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-4 h-4 text-zinc-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">CTR %</span>
                        </div>
                        <h4 className="text-2xl font-black text-gray-900 font-mono">
                          {selectedCampaignForAnalytics.analytics?.ctr.toFixed(2) || '0.00'}%
                        </h4>
                      </div>

                      <div className="bg-zinc-50 border p-4 rounded-2xl">
                        <div className="text-zinc-400 flex items-center gap-1.5 mb-1">
                          <Target className="w-4 h-4 text-zinc-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Conversions</span>
                        </div>
                        <h4 className="text-2xl font-black text-gray-900 font-mono text-blue-600">
                          {selectedCampaignForAnalytics.analytics?.conversions || '0'}
                        </h4>
                      </div>
                    </div>

                    {/* Spend Metrics */}
                    <div className="bg-gradient-to-br from-gray-900 to-zinc-850 p-5 rounded-2xl text-white">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Budget Spend Status</span>
                        </span>
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">Live Feed</span>
                      </div>
                      
                      <div className="flex justify-between items-baseline mb-2">
                        <h4 className="text-3xl font-black font-mono">
                          {formatPrice(selectedCampaignForAnalytics.analytics?.spent || 0, 'INR')}
                        </h4>
                        <span className="text-zinc-400 text-xs">spent of {formatPrice(selectedCampaignForAnalytics.budget, 'INR')}</span>
                      </div>

                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div 
                          className="bg-blue-400 h-2 rounded-full transition-all duration-1000" 
                          style={{ width: `${Math.min(100, ((selectedCampaignForAnalytics.analytics?.spent || 0) / selectedCampaignForAnalytics.budget) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Meta WA notification settings block */}
                    <div className="border border-zinc-150 p-4 rounded-2xl text-xs text-gray-500 font-light flex items-start gap-2.5 leading-relaxed">
                      <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <strong className="font-bold text-gray-900 block mb-0.5">Meta WA Marketing Feed connected</strong>
                        Every customer booking driven directly via this Instagram/Facebook ad automatically triggers verified WhatsApp booking receipts programmatically.
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-zinc-50 border border-dashed rounded-3xl p-8 text-center space-y-4">
                    <BarChart3 className="w-12 h-12 text-zinc-300 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-gray-900">Performance metrics not live yet</h4>
                      <p className="text-xs text-gray-500 font-light leading-relaxed max-w-xs mx-auto">
                        Once this marketing campaign passes Quality Control review and starts running on Meta, live metrics will stream here in real-time.
                      </p>
                    </div>
                    {selectedCampaignForAnalytics.status === 'draft' && (
                      <button 
                        onClick={() => setShowPayModal(selectedCampaignForAnalytics)}
                        className="bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 rounded-xl text-xs font-bold"
                      >
                        Subscribe & Launch Campaign
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 text-gray-500 space-y-3">
                <Target className="w-12 h-12 text-zinc-200 mx-auto" />
                <p className="text-sm font-light">Select or create a marketing campaign to view live feed insights.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE DRAFT MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-5xl w-full p-6 md:p-8 max-h-[95vh] overflow-y-auto shadow-2xl text-left"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                    {editingCampaignId ? 'Edit Ad Campaign Draft' : 'Draft Marketing Campaign'}
                  </h3>
                  <p className="text-xs text-gray-500 font-light mt-0.5">Customize your creative assets, formats, targets, and launch budget.</p>
                </div>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              {Object.keys(rejectedFieldsMap).length > 0 && (
                <div className="mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start gap-3 text-xs text-rose-700">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <strong className="font-bold block mb-1">Quality Control Rejected Areas Found</strong>
                    Please review the highlighted fields in red below and implement the specific corrections requested by the moderator team to queue your campaign for publication.
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateCampaign} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT COLUMN: Inputs */}
                <div className="lg:col-span-7 space-y-6">
                
                {/* Linked stay */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Select Stay Residence</label>
                  <select 
                    required
                    value={formData.listing_id}
                    onChange={(e) => handleListingChange(e.target.value)}
                    className="w-full bg-[#F4F4F6] border border-gray-100 rounded-2xl p-3.5 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:bg-white"
                  >
                    <option value="">-- Choose Listing --</option>
                    {listings.map(listing => (
                      <option key={listing.id} value={listing.id}>{listing.title} ({listing.city})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-400 font-light pl-1">
                    Selecting a stay residence will automatically fetch and load all its details, images, and videos into this form.
                  </p>
                </div>

                {/* Ad Format Selection (Advanced Scenario 1 requirement) */}
                <div className={`space-y-2 p-4 rounded-2xl border transition-all ${rejectedFieldsMap.ad_format ? 'border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : 'border-zinc-150'}`}>
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Creative Ad Format</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">Scenario Format Options</span>
                  </div>

                  {rejectedFieldsMap.ad_format && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl mb-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.ad_format}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: 'post', label: 'Single Post', desc: '1:1 Feed Image' },
                      { id: 'reel', label: 'Vertical Reel', desc: '9:16 Auto Play' },
                      { id: 'carousel', label: 'Carousel', desc: 'Swipeable Deck' },
                      { id: 'story', label: 'Story Ad', desc: '9:16 Full Screen' }
                    ].map(fmt => (
                      <div 
                        key={fmt.id}
                        onClick={() => setFormData(prev => ({ ...prev, ad_format: fmt.id as any }))}
                        className={`
                          p-3 rounded-xl border text-center cursor-pointer transition-all select-none flex flex-col justify-center items-center gap-1
                          ${formData.ad_format === fmt.id 
                            ? 'border-blue-500 bg-blue-50/10 font-bold text-blue-700' 
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}
                        `}
                      >
                        <span className="text-xs font-bold">{fmt.label}</span>
                        <span className="text-[9px] text-zinc-400 font-normal">{fmt.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ad Headline */}
                <div className={`space-y-1.5 p-3 rounded-2xl transition-all ${rejectedFieldsMap.title ? 'border border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : ''}`}>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span>Ad Headline / Title</span>
                    {rejectedFieldsMap.title && <span className="text-rose-600 font-bold font-mono text-[9px]">Fix Flagged</span>}
                  </label>

                  {rejectedFieldsMap.title && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl mb-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.title}</span>
                    </div>
                  )}

                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Private Luxury Resort Weekend Deal"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className={`w-full bg-[#F4F4F6] border rounded-2xl p-3.5 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:bg-white ${rejectedFieldsMap.title ? 'border-rose-300 focus:border-rose-500' : 'border-gray-100'}`}
                  />
                </div>

                {/* Target Locations */}
                <div className={`space-y-1.5 p-3 rounded-2xl transition-all ${rejectedFieldsMap.target_locations ? 'border border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : ''}`}>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span>Target Marketing Locations</span>
                    {rejectedFieldsMap.target_locations && <span className="text-rose-600 font-bold font-mono text-[9px]">Fix Flagged</span>}
                  </label>

                  {rejectedFieldsMap.target_locations && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl mb-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.target_locations}</span>
                    </div>
                  )}

                  <input 
                    type="text" 
                    placeholder="e.g. Mumbai, Bangalore, Pune, Delhi NCR"
                    value={formData.target_locations}
                    onChange={(e) => setFormData(prev => ({ ...prev, target_locations: e.target.value }))}
                    className={`w-full bg-[#F4F4F6] border rounded-2xl p-3.5 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:bg-white ${rejectedFieldsMap.target_locations ? 'border-rose-300 focus:border-rose-500' : 'border-gray-100'}`}
                  />
                  <p className="text-[10px] text-zinc-400 font-light pl-1">Specify target cities or states for Meta ad distribution network algorithms.</p>
                </div>

                {/* Ad Copy Description */}
                <div className={`space-y-1.5 p-3 rounded-2xl transition-all ${rejectedFieldsMap.description ? 'border border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : ''}`}>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span>Primary Ad Copy / Stay Description</span>
                    {rejectedFieldsMap.description && <span className="text-rose-600 font-bold font-mono text-[9px]">Fix Flagged</span>}
                  </label>

                  {rejectedFieldsMap.description && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl mb-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.description}</span>
                    </div>
                  )}

                  <textarea 
                    rows={3}
                    required
                    placeholder="Describe your resort, details, location, amenities, and why customers should book now!"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className={`w-full bg-[#F4F4F6] border rounded-2xl p-3.5 text-sm font-medium outline-none font-sans transition-all focus:border-blue-500 focus:bg-white ${rejectedFieldsMap.description ? 'border-rose-300 focus:border-rose-500' : 'border-gray-100'}`}
                  />
                </div>

                {/* Feed Description */}
                <div className={`space-y-1.5 p-3 rounded-2xl transition-all ${rejectedFieldsMap.feed_description ? 'border border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : ''}`}>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span>Ad Feed Description (Bottom Tagline)</span>
                    {rejectedFieldsMap.feed_description && <span className="text-rose-600 font-bold font-mono text-[9px]">Fix Flagged</span>}
                  </label>

                  {rejectedFieldsMap.feed_description && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl mb-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.feed_description}</span>
                    </div>
                  )}

                  <input 
                    type="text" 
                    placeholder="e.g. 🔥 20% discount on bookings this weekend! Only 3 slots remaining."
                    value={formData.feed_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, feed_description: e.target.value }))}
                    className={`w-full bg-[#F4F4F6] border rounded-2xl p-3.5 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:bg-white ${rejectedFieldsMap.feed_description ? 'border-rose-300 focus:border-rose-500' : 'border-gray-100'}`}
                  />
                </div>

                {/* Advanced Visual Media Designer & Arrangement Panel */}
                <div className={`p-4 bg-zinc-50 border rounded-2xl space-y-4 transition-all ${rejectedFieldsMap.media ? 'border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : 'border-zinc-200'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Visual Media arrangement & Alignment</h4>
                      <p className="text-[10px] text-zinc-400 font-light">Rearrange ad media assets order or upload custom links.</p>
                    </div>
                    <span className="text-[9px] bg-blue-100 text-blue-700 font-extrabold uppercase px-2 py-0.5 rounded-full font-mono">Modern designer</span>
                  </div>

                  {rejectedFieldsMap.media && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.media}</span>
                    </div>
                  )}

                  {/* Media arrangement list */}
                  {formData.media_urls.length === 0 ? (
                    <div className="text-center py-4 bg-zinc-100 border border-dashed rounded-xl text-zinc-400 text-xs">
                      No media loaded. Choose a stay residence above to import images or add a link below.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {formData.media_urls.map((url, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-zinc-200 bg-white aspect-square flex flex-col">
                          <img src={url} alt="" className="w-full h-2/3 object-cover" />
                          <div className="p-1 text-[10px] font-mono text-center font-bold text-gray-700 bg-zinc-50 flex items-center justify-between border-t gap-1">
                            <span>Ad Asset #{idx + 1}</span>
                            <button 
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  media_urls: prev.media_urls.filter((_, i) => i !== idx)
                                }));
                              }}
                              className="text-rose-600 hover:bg-rose-50 p-0.5 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          
                          {/* Arrange Controls */}
                          <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1.5 bg-black/40 backdrop-blur-xs py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {idx > 0 && (
                              <button 
                                type="button"
                                onClick={() => {
                                  const arr = [...formData.media_urls];
                                  const temp = arr[idx];
                                  arr[idx] = arr[idx - 1];
                                  arr[idx - 1] = temp;
                                  setFormData(prev => ({ ...prev, media_urls: arr }));
                                }}
                                className="text-[10px] font-bold bg-white text-gray-800 px-1 py-0.5 rounded hover:bg-zinc-100"
                              >
                                ◀ Move
                              </button>
                            )}
                            {idx < formData.media_urls.length - 1 && (
                              <button 
                                type="button"
                                onClick={() => {
                                  const arr = [...formData.media_urls];
                                  const temp = arr[idx];
                                  arr[idx] = arr[idx + 1];
                                  arr[idx + 1] = temp;
                                  setFormData(prev => ({ ...prev, media_urls: arr }));
                                }}
                                className="text-[10px] font-bold bg-white text-gray-800 px-1 py-0.5 rounded hover:bg-zinc-100"
                              >
                                Move ▶
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add additional media URL option */}
                  <div className="flex gap-2">
                    <input 
                      type="url"
                      placeholder="Add another photo or direct MP4 video link..."
                      value={newMediaUrl}
                      onChange={(e) => setNewMediaUrl(e.target.value)}
                      className="flex-1 bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newMediaUrl) return;
                        if (!newMediaUrl.startsWith('http')) {
                          addToast('Invalid Link', 'Please provide a valid HTTP image or video link.', 'warning');
                          return;
                        }
                        setFormData(prev => ({
                          ...prev,
                          media_urls: [...prev.media_urls, newMediaUrl]
                        }));
                        setNewMediaUrl('');
                        addToast('Asset Added', 'New creative asset added to the campaign queue.', 'success');
                      }}
                      className="bg-gray-900 text-white px-3 py-2 rounded-xl text-xs font-bold shrink-0 hover:bg-gray-800"
                    >
                      Add Media
                    </button>
                  </div>

                  {/* Aligning/Aspect ratio options for modern visual ad design */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200/50">
                    <div className="space-y-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">Content overlay Alignment</label>
                      <div className="flex bg-white rounded-lg p-0.5 border">
                        {['left', 'center', 'right'].map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => setMediaAlignment(align as any)}
                            className={`flex-1 text-[10px] py-1 capitalize rounded transition-all ${mediaAlignment === align ? 'bg-zinc-900 text-white font-bold' : 'text-zinc-600 hover:bg-zinc-50'}`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">Visual Feed Aspect Ratio</label>
                      <div className="flex bg-white rounded-lg p-0.5 border">
                        {['1:1', '9:16', '16:9'].map((aspect) => (
                          <button
                            key={aspect}
                            type="button"
                            onClick={() => setMediaAspect(aspect as any)}
                            className={`flex-1 text-[10px] py-1 rounded transition-all ${mediaAspect === aspect ? 'bg-zinc-900 text-white font-bold' : 'text-zinc-600 hover:bg-zinc-50'}`}
                          >
                            {aspect}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vertical Reels URL */}
                <div className={`space-y-1.5 p-3 rounded-2xl transition-all ${rejectedFieldsMap.video_url ? 'border border-rose-300 bg-rose-50/10 ring-2 ring-rose-500/10' : ''}`}>
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Vertical Video Reel URL (Optional)</label>
                    <span className="text-[10px] text-zinc-400">YouTube, Vimeo, MP4</span>
                  </div>

                  {rejectedFieldsMap.video_url && (
                    <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2 rounded-xl mb-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Fix Requested:</strong> {rejectedFieldsMap.video_url}</span>
                    </div>
                  )}

                  <input 
                    type="url" 
                    placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    value={formData.video_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, video_url: e.target.value }))}
                    className={`w-full bg-[#F4F4F6] border rounded-2xl p-3.5 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:bg-white ${rejectedFieldsMap.video_url ? 'border-rose-300 focus:border-rose-500' : 'border-gray-100'}`}
                  />
                  <p className="text-[10px] text-zinc-400 font-light pl-1">
                    Connecting a high-converting video reel automatically syncs it directly to your Stays details page for visual tour play!
                  </p>
                </div>

                {/* Platforms selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Select Ad Feeds</label>
                  <div className="grid grid-cols-2 gap-3">
                    {PLATFORM_OPTIONS.map(opt => {
                      const isSelected = formData.platforms.includes(opt.id);
                      return (
                        <div 
                          key={opt.id}
                          onClick={() => handlePlatformToggle(opt.id)}
                          className={`
                            border p-3 rounded-2xl cursor-pointer transition-all flex items-center gap-2.5 select-none
                            ${isSelected 
                              ? 'border-blue-500 bg-blue-50/20 font-bold text-blue-700' 
                              : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}
                          `}
                        >
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 bg-white'}`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span className="text-xs">{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Marketing Budget controller */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold uppercase tracking-wider text-gray-400">Monthly Ad Budget</span>
                    <span className="font-bold font-mono text-gray-900 bg-zinc-100 px-2.5 py-1 rounded-md">
                      {formatPrice(formData.budget, 'INR')} /mo
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min={2500} 
                    max={10000} 
                    step={2500}
                    value={formData.budget}
                    onChange={(e) => setFormData(prev => ({ ...prev, budget: parseInt(e.target.value) }))}
                    className="w-full accent-gray-900 h-1 bg-gray-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                    <span>₹2,500 (Standard)</span>
                    <span>₹5,000 (Premium)</span>
                    <span>₹7,500 (Pro)</span>
                    <span>₹10,000 (Enterprise)</span>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white p-4 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-[0.98] mt-4"
                >
                  {editingCampaignId ? 'Update & Save Revisions' : 'Save campaign draft'}
                </button>
              </div>

              {/* RIGHT COLUMN: Live Social Media Preview inside realistic idle iPhone Mockup */}
              <div className="lg:col-span-5 lg:sticky lg:top-0 h-fit self-start bg-zinc-50 border border-zinc-150 rounded-3xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-150 pb-3">
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-500">Live Device Simulation</h4>
                    <p className="text-[9px] text-zinc-400 font-light mt-0.5">Real-time Ad rendering on iOS</p>
                  </div>
                  {/* Toggle Switch */}
                  <div className="flex bg-zinc-200/50 p-1 rounded-xl border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewPlatform('instagram');
                        setActiveSlideIndex(0);
                      }}
                      className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-all ${
                        previewPlatform === 'instagram'
                          ? 'bg-white text-gray-900 shadow-sm font-black'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      Instagram
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewPlatform('facebook');
                        setActiveSlideIndex(0);
                      }}
                      className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-all ${
                        previewPlatform === 'facebook'
                          ? 'bg-white text-gray-900 shadow-sm font-black'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      Facebook
                    </button>
                  </div>
                </div>

                {/* iPhone Frame Container */}
                <div className="flex justify-center items-center py-2">
                  <div className="relative w-[295px] h-[610px] bg-black rounded-[48px] p-2.5 shadow-2xl border-[6px] border-zinc-900 ring-4 ring-zinc-200/50 flex flex-col select-none overflow-hidden transition-all">
                    
                    {/* Apple Dynamic Island / Notch */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-5.5 bg-black rounded-full z-50 flex items-center justify-between px-3.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    </div>

                    {/* Apple Speaker Grill */}
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-zinc-800 rounded-full z-50" />

                    {/* iPhone Display Content */}
                    <div className="relative w-full h-full rounded-[38px] bg-white overflow-hidden flex flex-col z-30">
                      
                      {/* iOS Status Bar */}
                      <div className={`absolute top-0 inset-x-0 h-10 px-5 flex justify-between items-center z-50 text-[10px] font-semibold tracking-tight transition-colors ${
                        (formData.ad_format === 'reel' || formData.ad_format === 'story')
                          ? 'text-white' 
                          : 'text-gray-900 bg-white/70 backdrop-blur-xs'
                      }`}>
                        {/* Time */}
                        <span className="font-bold">9:41</span>
                        {/* Notch filler spacer */}
                        <div className="w-24" />
                        {/* Status Icons */}
                        <div className="flex items-center gap-1">
                          {/* Signal */}
                          <div className="flex items-end gap-[1px] h-2">
                            <span className="w-[1.5px] h-0.5 bg-current rounded-3xs" />
                            <span className="w-[1.5px] h-1 bg-current rounded-3xs" />
                            <span className="w-[1.5px] h-1.5 bg-current rounded-3xs" />
                            <span className="w-[1.5px] h-2 bg-current rounded-3xs" />
                          </div>
                          <span>5G</span>
                          {/* Battery indicator */}
                          <div className="w-4.5 h-2.5 border border-current rounded-sm p-0.5 flex items-center">
                            <div className="h-full w-[85%] bg-current rounded-3xs" />
                          </div>
                        </div>
                      </div>

                      {/* Resolved Media Array Fallbacks */}
                      {(() => {
                        const mediaList = formData.media_urls.length > 0 
                          ? formData.media_urls 
                          : ['https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80'];
                        const activeImage = mediaList[activeSlideIndex % mediaList.length] || mediaList[0];

                        const handlePrevSlide = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setActiveSlideIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
                        };

                        const handleNextSlide = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setActiveSlideIndex((prev) => (prev + 1) % mediaList.length);
                        };

                        {/* Rendering Platform Screens */}
                        if (previewPlatform === 'instagram') {
                          /* -----------------------------------------------
                             INSTAGRAM AD DESIGNS
                             ----------------------------------------------- */
                          if (formData.ad_format === 'story') {
                            /* INSTAGRAM STORY AD */
                            return (
                              <div className="absolute inset-0 bg-zinc-950 flex flex-col justify-between pt-10 pb-6 text-white text-xs select-none">
                                {/* Segmented top progress indicators */}
                                <div className="absolute top-11 inset-x-2.5 flex gap-1 z-40">
                                  {mediaList.map((_, i) => {
                                    const currentIdx = activeSlideIndex % mediaList.length;
                                    const widthPct = i === currentIdx ? '100%' : i < currentIdx ? '100%' : '0%';
                                    return (
                                      <div key={i} className="h-[2px] flex-1 bg-white/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-white transition-all duration-300" style={{ width: widthPct }} />
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Header with Sponsor and User Name */}
                                <div className="p-3 pt-4 flex items-center justify-between z-30 relative bg-gradient-to-b from-black/50 to-transparent">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full p-[1px] bg-gradient-to-tr from-yellow-500 to-pink-500">
                                      <img 
                                        src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                        className="w-full h-full rounded-full object-cover border border-black" 
                                        referrerPolicy="no-referrer"
                                        alt="" 
                                      />
                                    </div>
                                    <div className="text-[10px]">
                                      <span className="font-extrabold text-white block leading-none">{user?.name || 'LuxuryHost'}</span>
                                      <span className="text-[9px] text-zinc-300 font-light mt-0.5 block">Sponsored</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5 text-zinc-300 text-sm">
                                    <MoreHorizontal className="w-4 h-4 cursor-pointer" />
                                    <span className="cursor-pointer font-bold select-none text-[13px] px-1">✕</span>
                                  </div>
                                </div>

                                {/* Immersive Interactive Core Media area */}
                                <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden">
                                  {/* Blurred Background Plate */}
                                  <div className="absolute inset-0 bg-cover bg-center blur-2xl opacity-40" style={{ backgroundImage: `url(${activeImage})` }} />
                                  
                                  {/* Central Creative Image */}
                                  <img 
                                    src={activeImage} 
                                    className={`relative max-h-full max-w-full object-cover z-20 ${
                                      mediaAlignment === 'left' ? 'object-left' : mediaAlignment === 'right' ? 'object-right' : 'object-center'
                                    }`} 
                                    referrerPolicy="no-referrer"
                                    alt="Story ad" 
                                  />

                                  {/* Interactive Story Tapping triggers */}
                                  <div className="absolute inset-y-0 left-0 w-1/4 z-30 cursor-west-resize" onClick={handlePrevSlide} />
                                  <div className="absolute inset-y-0 right-0 w-1/4 z-30 cursor-east-resize" onClick={handleNextSlide} />

                                  {/* Dynamic Ad Overlays */}
                                  <div className="absolute inset-x-4 bottom-14 z-30 bg-black/40 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-left">
                                    <h5 className="font-black text-[12px] text-white tracking-wide uppercase line-clamp-1">{formData.title || 'Paradise Getaway'}</h5>
                                    <p className="text-[10px] text-zinc-200 mt-1 font-light line-clamp-2 leading-relaxed">{formData.description || 'Experience verified luxury rentals.'}</p>
                                  </div>
                                </div>

                                {/* Story Bottom Call-to-action Deck */}
                                <div className="absolute bottom-6 inset-x-3 z-40 bg-white/15 backdrop-blur-lg border border-white/20 p-2.5 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/25 transition-all text-center">
                                  <span className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-1">
                                    Book Stay <span>✈️</span>
                                  </span>
                                  <span className="text-[9px] text-blue-300 font-bold tracking-wider mt-0.5 font-mono">nestpick.luxury</span>
                                </div>
                              </div>
                            );
                          } else if (formData.ad_format === 'reel') {
                            /* INSTAGRAM REEL AD */
                            return (
                              <div className="absolute inset-0 bg-zinc-950 flex flex-col justify-between pt-10 pb-6 text-white text-xs select-none">
                                {/* Reels Header Area */}
                                <div className="p-3 flex justify-between items-center z-30 bg-gradient-to-b from-black/60 to-transparent">
                                  <span className="font-bold text-[13px] tracking-wide text-white">Reels</span>
                                  <Volume2 className="w-4.5 h-4.5 text-white/80 cursor-pointer hover:text-white" />
                                </div>

                                {/* Full screen Background Reel Asset */}
                                <div className="absolute inset-0 z-10 bg-zinc-900 flex items-center justify-center overflow-hidden">
                                  <img 
                                    src={activeImage} 
                                    className={`w-full h-full object-cover ${
                                      mediaAlignment === 'left' ? 'object-left' : mediaAlignment === 'right' ? 'object-right' : 'object-center'
                                    }`} 
                                    referrerPolicy="no-referrer"
                                    alt="Reel ad" 
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/40" />
                                </div>

                                {/* Bouncing Indicator */}
                                <div className="absolute top-12 left-3 z-30 bg-red-600 backdrop-blur-xs text-[8px] text-white font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 shadow-md">
                                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                                  <span>REELS AD</span>
                                </div>

                                {/* RIGHT VERTICAL TOOLBAR: Action items */}
                                <div className="absolute right-2 bottom-12 z-30 flex flex-col items-center gap-4 text-white">
                                  <div className="flex flex-col items-center gap-1 cursor-pointer group">
                                    <div className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-xs flex items-center justify-center border border-white/10 shadow-lg group-active:scale-90 transition-transform">
                                      <Heart className="w-4.5 h-4.5 text-rose-500 fill-rose-500 animate-pulse" />
                                    </div>
                                    <span className="text-[9px] font-bold text-zinc-200">24.5K</span>
                                  </div>

                                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                                    <div className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-xs flex items-center justify-center border border-white/10 shadow-lg">
                                      <MessageSquare className="w-4.5 h-4.5 text-white" />
                                    </div>
                                    <span className="text-[9px] font-bold text-zinc-200">128</span>
                                  </div>

                                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                                    <div className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-xs flex items-center justify-center border border-white/10 shadow-lg">
                                      <Share2 className="w-4.5 h-4.5 text-white" />
                                    </div>
                                    <span className="text-[9px] font-bold text-zinc-200">Share</span>
                                  </div>

                                  <div className="cursor-pointer">
                                    <div className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-xs flex items-center justify-center border border-white/10 shadow-lg text-[13px] font-black">
                                      •••
                                    </div>
                                  </div>

                                  {/* Spinning Audio Album Cover */}
                                  <div className="w-7 h-7 rounded-full bg-zinc-950 border-2 border-white/30 p-0.5 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                                    <img 
                                      src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                      className="w-full h-full rounded-full object-cover" 
                                      referrerPolicy="no-referrer"
                                      alt="" 
                                    />
                                  </div>
                                </div>

                                {/* BOTTOM LEFT OVERLAY: Profile & Caption details */}
                                <div className="absolute left-3 bottom-6 right-14 z-30 text-left space-y-2">
                                  <div className="flex items-center gap-2">
                                    <img 
                                      src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                      className="w-6.5 h-6.5 rounded-full object-cover border border-white/40" 
                                      referrerPolicy="no-referrer"
                                      alt="" 
                                    />
                                    <div className="leading-none">
                                      <span className="font-extrabold text-[11px] block">{user?.name || 'LuxuryHost'}</span>
                                      <span className="text-[8.5px] text-blue-400 font-bold mt-0.5 block uppercase tracking-wider">Sponsored</span>
                                    </div>
                                    <span className="text-[9px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-md hover:bg-blue-700 cursor-pointer">Book Now</span>
                                  </div>

                                  <div className="space-y-1">
                                    <h4 className="font-extrabold text-white text-[11px] leading-tight">{formData.title || 'Escape with Nestpick'}</h4>
                                    <p className="text-zinc-200 text-[10px] leading-relaxed font-light line-clamp-2">{formData.description || 'Your private paradise stay is waiting.'}</p>
                                  </div>

                                  {/* Simulated Audio Track line */}
                                  <div className="flex items-center gap-1 text-[9px] text-zinc-300 font-medium">
                                    <span>🎵 Original Audio •</span>
                                    <span className="text-zinc-400">{user?.name || 'LuxuryHost'}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            /* INSTAGRAM FEED SINGLE POST & CAROUSEL */
                            return (
                              <div className="absolute inset-0 bg-white flex flex-col justify-between pt-10 pb-5 text-gray-900 text-xs select-none">
                                
                                {/* Instagram Feed Header app-bar */}
                                <div className="h-10 border-b border-zinc-100 flex items-center justify-between px-3 bg-white/95 backdrop-blur-xs">
                                  <span className="font-extrabold tracking-tight text-[13px] font-serif text-gray-900">Instagram</span>
                                  <div className="flex items-center gap-3.5 text-zinc-700">
                                    <Plus className="w-4 h-4 cursor-pointer hover:text-zinc-900" />
                                    <Heart className="w-4 h-4 cursor-pointer hover:text-zinc-900" />
                                    <MessageSquare className="w-4 h-4 cursor-pointer hover:text-zinc-900" />
                                  </div>
                                </div>

                                {/* Feed Content Scroll-area */}
                                <div className="flex-1 overflow-y-auto no-scrollbar bg-white">
                                  {/* User Row Info */}
                                  <div className="p-2.5 flex items-center justify-between border-b border-zinc-50">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-[1.2px]">
                                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-[0.5px]">
                                          <img 
                                            src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                            className="w-full h-full rounded-full object-cover" 
                                            referrerPolicy="no-referrer"
                                            alt="" 
                                          />
                                        </div>
                                      </div>
                                      <div className="text-left leading-none">
                                        <span className="font-bold text-[10.5px] block text-gray-900">{user?.name || 'LuxuryHost'}</span>
                                        <span className="text-[8.5px] text-gray-500 mt-0.5 block">Sponsored</span>
                                      </div>
                                    </div>
                                    <MoreHorizontal className="w-4 h-4 text-zinc-400 cursor-pointer hover:text-zinc-700" />
                                  </div>

                                  {/* Media Block Area */}
                                  <div 
                                    className="relative bg-zinc-950 overflow-hidden flex items-center justify-center border-t border-b border-zinc-100"
                                    style={{
                                      aspectRatio: mediaAspect === '9:16' ? '9/16' : mediaAspect === '16:9' ? '16/9' : '1/1',
                                      maxHeight: '260px'
                                    }}
                                  >
                                    <img 
                                      src={activeImage} 
                                      alt="Insta Media" 
                                      referrerPolicy="no-referrer"
                                      className={`w-full h-full object-cover transition-all duration-300 ${
                                        mediaAlignment === 'left' ? 'object-left' : mediaAlignment === 'right' ? 'object-right' : 'object-center'
                                      }`}
                                    />

                                    {/* Format overlays / Carousel Arrows */}
                                    {formData.ad_format === 'carousel' && (
                                      <>
                                        {/* Left Arrow */}
                                        <button 
                                          type="button" 
                                          onClick={handlePrevSlide}
                                          className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-xs hover:bg-black/80 transition-colors z-30"
                                        >
                                          <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        {/* Right Arrow */}
                                        <button 
                                          type="button" 
                                          onClick={handleNextSlide}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-xs hover:bg-black/80 transition-colors z-30"
                                        >
                                          <ChevronRight className="w-4 h-4" />
                                        </button>
                                        {/* Index overlay indicator */}
                                        <div className="absolute top-2 right-2 bg-black/50 text-[8px] font-mono font-bold text-white px-2 py-0.5 rounded-full">
                                          {(activeSlideIndex % mediaList.length) + 1} / {mediaList.length}
                                        </div>
                                      </>
                                    )}
                                  </div>

                                  {/* Instantly recognisable Instagram Sponsored Action Bar CTA */}
                                  <div className="bg-blue-600/5 hover:bg-blue-600/10 transition-all border-b border-zinc-100 p-2.5 flex justify-between items-center cursor-pointer">
                                    <span className="text-blue-700 font-extrabold text-[10px] uppercase tracking-wider">Book Now</span>
                                    <div className="flex items-center gap-1 text-blue-700">
                                      <span className="text-[9px] font-bold font-mono">nestpick.luxury</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </div>
                                  </div>

                                  {/* Interactivity engagement row */}
                                  <div className="p-2.5 pb-1 flex justify-between items-center text-gray-700 text-[14px]">
                                    <div className="flex items-center gap-3.5">
                                      <Heart className="w-4.5 h-4.5 hover:scale-110 transition-transform cursor-pointer" />
                                      <MessageSquare className="w-4.5 h-4.5 hover:scale-110 transition-transform cursor-pointer" />
                                      <Send className="w-4 h-4 hover:scale-110 transition-transform cursor-pointer rotate-45" />
                                    </div>

                                    {/* Carousel dots pagination indicator */}
                                    {formData.ad_format === 'carousel' && (
                                      <div className="flex gap-1">
                                        {mediaList.map((_, idx) => (
                                          <div 
                                            key={idx} 
                                            className={`w-1.5 h-1.5 rounded-full transition-all ${
                                              (activeSlideIndex % mediaList.length) === idx ? 'bg-blue-500 scale-110' : 'bg-zinc-200'
                                            }`} 
                                          />
                                        ))}
                                      </div>
                                    )}

                                    <Bookmark className="w-4.5 h-4.5 hover:scale-110 transition-transform cursor-pointer" />
                                  </div>

                                  {/* Likes and caption blocks */}
                                  <div className="px-3 pb-3 text-left space-y-1">
                                    <div className="font-extrabold text-[10.5px] text-gray-900">
                                      1,294 likes
                                    </div>
                                    <div className="leading-normal text-[10.5px]">
                                      <span className="font-extrabold text-gray-900 mr-1.5">{user?.name || 'LuxuryHost'}</span>
                                      <span className="font-bold text-blue-700 mr-1">{formData.title || 'Stay Paradise Resort'}</span>
                                      <span className="text-gray-700 font-light font-sans">{formData.description || 'Book this amazing private space now.'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 text-[9px] text-blue-600 font-semibold pt-1">
                                      <span>#NestpickLuxury</span>
                                      <span>#VillaGetaway</span>
                                      {formData.target_locations && (
                                        formData.target_locations.split(',').slice(0, 2).map((loc, i) => (
                                          <span key={i}>#{loc.trim().replace(/\s+/g, '')}</span>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                        } else {
                          /* -----------------------------------------------
                             FACEBOOK AD DESIGNS
                             ----------------------------------------------- */
                          if (formData.ad_format === 'story') {
                            /* FACEBOOK STORY AD */
                            return (
                              <div className="absolute inset-0 bg-zinc-950 flex flex-col justify-between pt-10 pb-6 text-white text-xs select-none">
                                {/* Thin top progress story indicators */}
                                <div className="absolute top-11 inset-x-2 flex gap-1 z-40">
                                  {mediaList.map((_, i) => {
                                    const currentIdx = activeSlideIndex % mediaList.length;
                                    const widthPct = i === currentIdx ? '100%' : i < currentIdx ? '100%' : '0%';
                                    return (
                                      <div key={i} className="h-[2px] flex-1 bg-white/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: widthPct }} />
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* FB Story Header Row */}
                                <div className="p-3 pt-4 flex items-center justify-between z-30 relative bg-gradient-to-b from-black/60 to-transparent">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full border-2 border-blue-500 p-[1px]">
                                      <img 
                                        src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                        className="w-full h-full rounded-full object-cover" 
                                        referrerPolicy="no-referrer"
                                        alt="" 
                                      />
                                    </div>
                                    <div className="text-left leading-none">
                                      <span className="font-extrabold text-white block text-[10px]">{user?.name || 'LuxuryHost'}</span>
                                      <span className="text-[8.5px] text-zinc-300 font-medium block mt-0.5">Sponsored • 🌐</span>
                                    </div>
                                  </div>
                                  <div className="text-zinc-300 text-lg font-bold cursor-pointer">✕</div>
                                </div>

                                {/* Center Media Section with blurred background */}
                                <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden">
                                  <div className="absolute inset-0 bg-cover bg-center blur-2xl opacity-40" style={{ backgroundImage: `url(${activeImage})` }} />
                                  <img 
                                    src={activeImage} 
                                    className={`relative max-h-full max-w-full object-cover z-20 ${
                                      mediaAlignment === 'left' ? 'object-left' : mediaAlignment === 'right' ? 'object-right' : 'object-center'
                                    }`} 
                                    referrerPolicy="no-referrer"
                                    alt="FB Story" 
                                  />

                                  {/* Tap handlers for navigation */}
                                  <div className="absolute inset-y-0 left-0 w-1/4 z-30 cursor-west-resize" onClick={handlePrevSlide} />
                                  <div className="absolute inset-y-0 right-0 w-1/4 z-30 cursor-east-resize" onClick={handleNextSlide} />

                                  {/* FB Text Plate Overlay */}
                                  <div className="absolute inset-x-3 bottom-14 z-30 bg-zinc-950/70 backdrop-blur-md rounded-xl p-3 border border-zinc-800 text-left">
                                    <span className="text-[8.5px] bg-blue-600 font-extrabold px-1.5 py-0.5 rounded-sm uppercase tracking-wide inline-block mb-1">Featured Stay</span>
                                    <h5 className="font-black text-white text-[11px] leading-tight">{formData.title || 'Ultimate Retreat Booking'}</h5>
                                    <p className="text-zinc-300 text-[9.5px] font-light mt-0.5 line-clamp-2">{formData.description || 'Verified luxury bookings with premium amenities.'}</p>
                                  </div>
                                </div>

                                {/* FB story swipe-up action */}
                                <div className="absolute bottom-6 inset-x-3 z-40 bg-blue-600 hover:bg-blue-700 border border-blue-500 p-2.5 rounded-xl flex items-center justify-center cursor-pointer transition-all">
                                  <span className="text-[10px] font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <span>Book Stay Now</span> <span>⚡</span>
                                  </span>
                                </div>
                              </div>
                            );
                          } else if (formData.ad_format === 'reel') {
                            /* FACEBOOK REEL AD */
                            return (
                              <div className="absolute inset-0 bg-zinc-950 flex flex-col justify-between pt-10 pb-6 text-white text-xs select-none">
                                {/* Reels Header */}
                                <div className="p-3 flex items-center gap-2 z-30 bg-gradient-to-b from-black/60 to-transparent">
                                  <span className="text-zinc-300 font-bold text-sm cursor-pointer">←</span>
                                  <span className="font-bold text-[12.5px] tracking-wide text-white">Facebook Reels</span>
                                </div>

                                {/* Immersive background visual asset */}
                                <div className="absolute inset-0 z-10 bg-zinc-900 flex items-center justify-center overflow-hidden">
                                  <img 
                                    src={activeImage} 
                                    className={`w-full h-full object-cover ${
                                      mediaAlignment === 'left' ? 'object-left' : mediaAlignment === 'right' ? 'object-right' : 'object-center'
                                    }`} 
                                    referrerPolicy="no-referrer"
                                    alt="FB Reel" 
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/30" />
                                </div>

                                {/* Facebook interactive right tools stack */}
                                <div className="absolute right-2 bottom-12 z-30 flex flex-col items-center gap-4 text-white">
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="w-8.5 h-8.5 rounded-full bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center border border-zinc-800">
                                      <span className="text-sm">👍</span>
                                    </div>
                                    <span className="text-[8.5px] font-bold text-zinc-300">1.8K</span>
                                  </div>

                                  <div className="flex flex-col items-center gap-1">
                                    <div className="w-8.5 h-8.5 rounded-full bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center border border-zinc-800">
                                      <span className="text-sm">💬</span>
                                    </div>
                                    <span className="text-[8.5px] font-bold text-zinc-300">92</span>
                                  </div>

                                  <div className="flex flex-col items-center gap-1">
                                    <div className="w-8.5 h-8.5 rounded-full bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center border border-zinc-800">
                                      <span className="text-sm">↗️</span>
                                    </div>
                                    <span className="text-[8.5px] font-bold text-zinc-300">Share</span>
                                  </div>
                                </div>

                                {/* Overlaid stay copy and metadata */}
                                <div className="absolute left-3 bottom-6 right-12 z-30 text-left space-y-2">
                                  <div className="flex items-center gap-2">
                                    <img 
                                      src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                      className="w-6 h-6 rounded-full object-cover border border-blue-500" 
                                      referrerPolicy="no-referrer"
                                      alt="" 
                                    />
                                    <div>
                                      <span className="font-extrabold text-[10.5px] block">{user?.name || 'LuxuryHost'}</span>
                                      <span className="text-[8px] text-zinc-400 block mt-0.5 font-bold">Sponsored • 🌐</span>
                                    </div>
                                  </div>

                                  <div className="bg-black/40 backdrop-blur-md rounded-lg p-2.5 border border-zinc-800/50 space-y-1">
                                    <h4 className="font-extrabold text-white text-[10.5px] leading-tight">{formData.title || 'Premium Villa Deals'}</h4>
                                    <p className="text-zinc-200 text-[9.5px] leading-relaxed line-clamp-2 font-light">{formData.description || 'Verified luxury resort listings.'}</p>
                                    <button type="button" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-[9.5px] py-1.5 rounded-md mt-1 uppercase tracking-wider">Book Stay Now</button>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            /* FACEBOOK FEED SINGLE POST & CAROUSEL */
                            return (
                              <div className="absolute inset-0 bg-zinc-100 flex flex-col justify-between pt-10 pb-5 text-gray-900 text-xs select-none">
                                
                                {/* FB Brand Header bar */}
                                <div className="h-10 bg-white border-b border-zinc-200 flex items-center justify-between px-3 bg-white/95 backdrop-blur-xs">
                                  <span className="font-black text-[15px] text-blue-600 tracking-tight">facebook</span>
                                  <div className="flex gap-2.5 text-zinc-600">
                                    <span className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-xs cursor-pointer">🔍</span>
                                    <span className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-xs cursor-pointer">💬</span>
                                  </div>
                                </div>

                                {/* Facebook feed scroll view */}
                                <div className="flex-1 overflow-y-auto no-scrollbar bg-white">
                                  {/* User Row Header block */}
                                  <div className="p-3 flex items-start gap-2.5">
                                    <img 
                                      src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'} 
                                      className="w-8.5 h-8.5 rounded-full border border-zinc-200 object-cover" 
                                      referrerPolicy="no-referrer"
                                      alt="" 
                                    />
                                    <div className="flex-1 min-w-0 text-left">
                                      <div className="flex items-center gap-1">
                                        <span className="font-extrabold text-gray-900 text-[11px] hover:underline cursor-pointer">
                                          {user?.name || 'LuxuryHost'}
                                        </span>
                                        <span className="text-[10px] text-blue-500 font-extrabold leading-none">✓</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-gray-500 text-[9px] font-medium mt-0.5">
                                        <span>Sponsored</span>
                                        <span>•</span>
                                        <span>🌐</span>
                                      </div>
                                    </div>
                                    <span className="text-zinc-400 font-extrabold text-sm cursor-pointer hover:text-zinc-700 px-1 leading-none">•••</span>
                                  </div>

                                  {/* Primary Copy Area (FB displays text BEFORE media!) */}
                                  <div className="px-3 pb-2 text-left text-[10.5px] leading-relaxed text-gray-800 font-light font-sans">
                                    <p className="line-clamp-3">{formData.description || 'Escape to stunning luxury vacation stays at guaranteed prices.'}</p>
                                  </div>

                                  {/* Media Section block */}
                                  <div 
                                    className="relative bg-zinc-950 overflow-hidden flex items-center justify-center border-t border-b border-zinc-100"
                                    style={{
                                      aspectRatio: mediaAspect === '9:16' ? '9/16' : mediaAspect === '16:9' ? '16/9' : '1.91/1',
                                      maxHeight: '220px'
                                    }}
                                  >
                                    <img 
                                      src={activeImage} 
                                      alt="FB Media" 
                                      referrerPolicy="no-referrer"
                                      className={`w-full h-full object-cover transition-all duration-300 ${
                                        mediaAlignment === 'left' ? 'object-left' : mediaAlignment === 'right' ? 'object-right' : 'object-center'
                                      }`}
                                    />

                                    {/* Format overlays / Carousel Navigation */}
                                    {formData.ad_format === 'carousel' && (
                                      <>
                                        <button 
                                          type="button" 
                                          onClick={handlePrevSlide}
                                          className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-xs hover:bg-black/80 transition-colors z-30"
                                        >
                                          <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button 
                                          type="button" 
                                          onClick={handleNextSlide}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-xs hover:bg-black/80 transition-colors z-30"
                                        >
                                          <ChevronRight className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>

                                  {/* Sponsored Meta-Card description block */}
                                  <div className="bg-zinc-50 border-b border-zinc-100 p-2.5 px-3 flex items-center justify-between gap-3 text-left">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-[8px] text-zinc-400 uppercase tracking-wider block font-mono">NESTPICK.LUXURY</span>
                                      <h5 className="font-extrabold text-[11px] text-gray-900 truncate mt-0.5">
                                        {formData.title || 'Experience Certified Paradise'}
                                      </h5>
                                      <p className="text-[9.5px] text-gray-500 font-light truncate mt-0.5">
                                        {formData.feed_description || 'Reserve premium vacation rentals.'}
                                      </p>
                                    </div>
                                    <button 
                                      type="button"
                                      className="bg-zinc-200 hover:bg-zinc-300 text-gray-800 font-black px-2.5 py-1 rounded-sm text-[10px] shrink-0 border border-zinc-300 transition-all uppercase tracking-wide"
                                    >
                                      Book Now
                                    </button>
                                  </div>

                                  {/* Reactions & engagement line */}
                                  <div className="px-3 py-2 flex items-center justify-between text-[10px] text-gray-500 border-b border-zinc-100">
                                    <div className="flex items-center gap-1.5">
                                      <span className="flex items-center justify-center w-3.5 h-3.5 bg-blue-500 text-white rounded-full text-[8px] font-bold">👍</span>
                                      <span className="flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] font-bold">❤️</span>
                                      <span className="font-medium">You and 1.2K others</span>
                                    </div>
                                    <div className="flex gap-1.5 font-light">
                                      <span>32 Comments</span>
                                      <span>•</span>
                                      <span>9 Shares</span>
                                    </div>
                                  </div>

                                  {/* Facebook Interactive engagement deck */}
                                  <div className="grid grid-cols-3 text-center py-0.5 text-gray-500 font-extrabold text-[10.5px] border-b border-zinc-100">
                                    <button type="button" className="py-2 hover:bg-zinc-50 transition-all flex items-center justify-center gap-1 cursor-pointer">
                                      <span className="text-zinc-400 text-xs">👍</span> <span>Like</span>
                                    </button>
                                    <button type="button" className="py-2 hover:bg-zinc-50 transition-all flex items-center justify-center gap-1 cursor-pointer">
                                      <span className="text-zinc-400 text-xs">💬</span> <span>Comment</span>
                                    </button>
                                    <button type="button" className="py-2 hover:bg-zinc-50 transition-all flex items-center justify-center gap-1 cursor-pointer">
                                      <span className="text-zinc-400 text-xs">↗️</span> <span>Share</span>
                                    </button>
                                  </div>

                                  {/* Carousel Indicator Dots for Feed Carousel */}
                                  {formData.ad_format === 'carousel' && (
                                    <div className="flex justify-center gap-1 py-2">
                                      {mediaList.map((_, idx) => (
                                        <div 
                                          key={idx} 
                                          className={`w-1.5 h-1.5 rounded-full transition-all ${
                                            (activeSlideIndex % mediaList.length) === idx ? 'bg-blue-600 scale-110' : 'bg-zinc-200'
                                          }`} 
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        }
                      })()}

                      {/* iPhone Home Indicator bar */}
                      <div className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 rounded-full z-50 transition-colors ${
                        (formData.ad_format === 'reel' || formData.ad_format === 'story')
                          ? 'bg-white/80' 
                          : 'bg-zinc-800'
                      }`} />

                    </div>
                  </div>
                </div>

                {/* Real-time sync informational metadata card */}
                <div className="bg-zinc-100/80 border border-zinc-200 p-3 rounded-2xl text-[10.5px] text-zinc-600 leading-relaxed font-light text-left">
                  <span className="font-extrabold text-zinc-700 block mb-0.5 uppercase tracking-wider text-[9px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" /> Live Device Sync Active
                  </span>
                  Your media layout alignment is <strong>{mediaAlignment}</strong> and the active ad format is <strong>{formData.ad_format}</strong>. Click inside the phone mockup to test interactive swipe & navigation controls.
                </div>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PAYMENT AND SUBSCRIPTION CHECKOUT MODAL */}
      <AnimatePresence>
        {showPayModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl text-left"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-gray-900 tracking-tight text-sans">Secure Checkout Gateway</h3>
                <button 
                  type="button"
                  onClick={() => {
                    if (!isPaying) setShowPayModal(null);
                  }}
                  className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="mb-6 bg-zinc-50 border border-zinc-150 p-4 rounded-2xl flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-900 text-[14px]">Campaign Ad Subscription</h4>
                  <p className="text-xs text-gray-500 font-light truncate max-w-[200px]">Listing: {showPayModal.listing_title}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-gray-900 font-mono">
                    {formatPrice(showPayModal.budget, 'INR')}
                  </div>
                  <span className="text-[10px] text-zinc-400 uppercase font-mono">Setup budget</span>
                </div>
              </div>

              {/* Gateway Selection Tabs */}
              <div className="mb-5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">Choose Payment Gateway</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('stripe')}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                      selectedGateway === 'stripe'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-700 ring-2 ring-blue-600/10 font-bold'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600'
                    }`}
                  >
                    <span className="text-sm font-black font-sans">Stripe</span>
                    <span className="text-[9px] opacity-75 mt-0.5">International Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('razorpay')}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                      selectedGateway === 'razorpay'
                        ? 'border-indigo-600 bg-indigo-50/40 text-indigo-700 ring-2 ring-indigo-600/10 font-bold'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600'
                    }`}
                  >
                    <span className="text-sm font-black font-sans">Razorpay</span>
                    <span className="text-[9px] opacity-75 mt-0.5">UPI, Cards, Netbanking</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSimulatePayment} className="space-y-4">
                {selectedGateway === 'stripe' ? (
                  /* STRIPE CARD FORM */
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cardholder Name</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. John Doe"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        className="w-full bg-[#F4F4F6] border border-gray-100 rounded-xl p-3 text-sm font-medium outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Card Number</label>
                      <input 
                        type="text" 
                        required
                        maxLength={19}
                        placeholder="4111 2222 3333 4444"
                        value={cardNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\s?/g, '').replace(/(\d{4})/g, '$1 ').trim();
                          setCardNumber(val);
                        }}
                        className="w-full bg-[#F4F4F6] border border-gray-100 rounded-xl p-3 text-sm font-medium outline-none font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Expiry Date</label>
                        <input 
                          type="text" 
                          required
                          maxLength={5}
                          placeholder="MM/YY"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full bg-[#F4F4F6] border border-gray-100 rounded-xl p-3 text-sm font-medium outline-none font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CVV / Code</label>
                        <input 
                          type="password" 
                          required
                          maxLength={3}
                          placeholder="123"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          className="w-full bg-[#F4F4F6] border border-gray-100 rounded-xl p-3 text-sm font-medium outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* RAZORPAY UPI & CARD FORM */
                  <div className="space-y-4">
                    <div className="bg-amber-50/50 border border-amber-100/30 p-3 rounded-xl">
                      <span className="text-[10px] text-amber-700 font-bold uppercase block mb-1">Razorpay Secured Engine</span>
                      <p className="text-[11px] text-gray-600 leading-relaxed">
                        Complete checkout immediately using UPI ID or fallback card details.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">UPI ID (Recommended)</label>
                        <span className="text-[10px] text-gray-400">e.g. username@okhdfcbank</span>
                      </div>
                      <input 
                        type="text" 
                        placeholder="e.g. user@paytm"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full bg-[#F4F4F6] border border-gray-100 rounded-xl p-3 text-sm font-medium outline-none"
                      />
                    </div>

                    <div className="relative flex py-2 items-center">
                      <div className="flex-grow border-t border-zinc-150"></div>
                      <span className="flex-shrink mx-4 text-[10px] text-zinc-400 font-bold uppercase">OR USE CARD</span>
                      <div className="flex-grow border-t border-zinc-150"></div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Card Number</label>
                      <input 
                        type="text" 
                        maxLength={19}
                        placeholder="4111 2222 3333 4444"
                        value={cardNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\s?/g, '').replace(/(\d{4})/g, '$1 ').trim();
                          setCardNumber(val);
                        }}
                        className="w-full bg-[#F4F4F6] border border-gray-100 rounded-xl p-3 text-sm font-medium outline-none font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-gray-400 leading-normal pt-2">
                  🛡️ This checkout operates in Sandbox/Simulation mode. Submitting payment will trigger a secure webhook to <code className="bg-zinc-100 px-1 py-0.5 rounded font-mono">/api/payments/webhook</code> on our servers to update the campaign status.
                </div>

                <button 
                  type="submit"
                  disabled={isPaying}
                  className={`w-full text-white p-4 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2 ${
                    selectedGateway === 'stripe' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isPaying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Contacting Gateway...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Authorize Payment & Send to Admin</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
