import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Eye,
  CheckCircle2,
  XCircle,
  Activity,
  Megaphone,
  Search,
  Lock,
  Info,
  Clock,
  Coins,
  Sparkles,
  Layers,
  FileText,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  HelpCircle,
  Radio,
  FileSearch,
  ArrowRight,
  Shield,
  Zap,
  DollarSign,
  TrendingUp,
  BarChart2,
  MessageSquare,
  ThumbsUp,
  Share2,
  Cpu,
  Trophy,
  Sliders,
  AlertCircle,
  HelpCircle as QuestionIcon
} from 'lucide-react';

interface HostCampaignControlCenterProps {
  campaignId: number | string;
  onBack?: () => void;
  onEditCampaign?: (campaignId: number | string) => void;
}

export interface HostActionPreview {
  action: string;
  current_state: string;
  what_will_happen: string;
  what_will_not_happen: string;
  why_allowed: string;
  expected_result: string;
  failure_or_unknown_outcome: string;
}

export const HostCampaignControlCenter: React.FC<HostCampaignControlCenterProps> = ({
  campaignId,
  onBack,
  onEditCampaign
}) => {
  const [truth, setTruth] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Action Preview Modal
  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);
  const [actionPreview, setActionPreview] = useState<HostActionPreview | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState<boolean>(false);

  // Active Tab for details
  const [activeTab, setActiveTab] = useState<'overview' | 'dco' | 'social' | 'financials' | 'timeline'>('overview');

  const token = localStorage.getItem('token') || '';

  const fetchCampaignTruth = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/control-center`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = res.headers.get('content-type')?.includes('json')
        ? await res.json()
        : { error: 'Server returned non-JSON response: ' + (await res.text()).slice(0, 150) };

      if (res.ok) {
        setTruth(data);
      } else {
        setError(data.error || 'Failed to load campaign truth.');
      }
    } catch (err: any) {
      console.error('Error fetching campaign truth:', err);
      setError(err.message || 'Network error while fetching campaign details.');
    } finally {
      if (showLoadingSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (campaignId) {
      fetchCampaignTruth(true);
    }
  }, [campaignId]);

  const handleManualResync = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/resync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: data.message || 'Campaign synchronized successfully.' });
        await fetchCampaignTruth(false);
      } else {
        setNotification({ type: 'error', message: data.error || 'Failed to resync with Meta.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error while resyncing.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenActionModal = (actionKey: string) => {
    if (truth?.action_previews && truth.action_previews[actionKey]) {
      setSelectedActionKey(actionKey);
      setActionPreview(truth.action_previews[actionKey]);
    } else {
      // Fallback preview
      setSelectedActionKey(actionKey);
      setActionPreview({
        action: actionKey,
        current_state: truth?.friendly_delivery_state || 'Current state',
        what_will_happen: `Execute ${actionKey} on this campaign.`,
        what_will_not_happen: 'No unauthorized funds will be transferred.',
        why_allowed: 'You have host permissions to manage this campaign.',
        expected_result: 'Campaign state will update accordingly.',
        failure_or_unknown_outcome: 'If the operation fails, existing state is safely retained.'
      });
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedActionKey) return;
    setIsExecutingAction(true);
    try {
      let endpoint = '';
      if (selectedActionKey === 'PAUSE') {
        endpoint = `/api/marketing/campaigns/${campaignId}/pause`;
      } else if (selectedActionKey === 'RESUME') {
        endpoint = `/api/marketing/campaigns/${campaignId}/resume`;
      } else if (selectedActionKey === 'RESYNC') {
        endpoint = `/api/marketing/campaigns/${campaignId}/resync`;
      } else if (selectedActionKey === 'CANCEL') {
        endpoint = `/api/marketing/campaigns/${campaignId}/cancel`;
      } else if (selectedActionKey === 'FIX_CAMPAIGN') {
        setSelectedActionKey(null);
        setActionPreview(null);
        if (onEditCampaign) {
          onEditCampaign(campaignId);
        }
        return;
      } else if (selectedActionKey === 'RESUBMIT') {
        endpoint = `/api/marketing/campaigns/${campaignId}/subscribe`;
      }

      if (!endpoint) {
        throw new Error('Unknown action endpoint.');
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: data.message || `Action ${selectedActionKey} completed.` });
        setSelectedActionKey(null);
        setActionPreview(null);
        await fetchCampaignTruth(false);
      } else {
        setNotification({ type: 'error', message: data.error || `Failed to execute ${selectedActionKey}.` });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error executing action.' });
    } finally {
      setIsExecutingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-gray-600">Connecting to Encho Campaign Control Center...</p>
      </div>
    );
  }

  if (error || !truth) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800 space-y-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-rose-600" />
          <h3 className="font-bold text-lg">Unable to Load Campaign Details</h3>
        </div>
        <p className="text-sm text-rose-700">{error || 'Campaign truth projection unavailable.'}</p>
        <div className="flex gap-3">
          <button
            onClick={() => fetchCampaignTruth(true)}
            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition"
          >
            Retry Connection
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white border border-rose-300 text-rose-800 rounded-xl text-xs font-semibold hover:bg-rose-100 transition"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  const opStatus = truth.operational_status || 'UNKNOWN';
  const opInfo = truth.operational_status_info || {};
  const isLive = opStatus === 'LIVE';
  const isActionRequired = truth.is_host_action_required || opStatus === 'DISAPPROVED' || opStatus === 'FAILED';
  const fin = truth.financial_safety || {};
  const perf = truth.performance_state || {};
  const eng = truth.engagement_state || {};
  const dco = truth.dco_state || {};
  const freshness = truth.freshness || {};
  const timeline = truth.timeline || [];
  const allowedActions = truth.allowed_actions || [];

  // Status Badge Styling
  const getBadgeStyle = (badgeColor: string) => {
    switch (badgeColor) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'amber':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'rose':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'blue':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'purple':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between text-sm shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-xl transition"
              >
                ← Back
              </button>
            )}
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-blue-600" />
              {truth.title || 'Campaign Control Center'}
            </h1>
          </div>
          <p className="text-xs text-zinc-500 font-medium">
            Campaign ID: #{truth.campaign_id} • Authoritative Meta Ad Monitoring
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualResync}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-700 shadow-sm transition disabled:opacity-50"
            title="Refresh latest status and telemetry directly from Meta"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync with Meta'}</span>
          </button>

          {allowedActions.includes('PAUSE') && (
            <button
              onClick={() => handleOpenActionModal('PAUSE')}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl transition shadow-sm"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Campaign</span>
            </button>
          )}

          {allowedActions.includes('RESUME') && (
            <button
              onClick={() => handleOpenActionModal('RESUME')}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Campaign</span>
            </button>
          )}

          {allowedActions.includes('FIX_CAMPAIGN') && (
            <button
              onClick={() => handleOpenActionModal('FIX_CAMPAIGN')}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Fix Campaign Details</span>
            </button>
          )}

          {allowedActions.includes('CANCEL') && (
            <button
              onClick={() => handleOpenActionModal('CANCEL')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
            >
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Primary Operational Status Hero Card */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-zinc-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${getBadgeStyle(opInfo.badge_color || 'slate')}`}>
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-ping' : 'bg-current'}`} />
                {opInfo.label || truth.friendly_delivery_state}
              </span>

              {truth.meta_link && (
                <a
                  href={truth.meta_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-2.5 py-1 rounded-full transition"
                >
                  <span>View on Meta Ads Manager</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              <span className="text-[11px] font-semibold text-zinc-400">
                Verified: {freshness.external_status_verified_at ? new Date(freshness.external_status_verified_at).toLocaleTimeString() : 'Recent'}
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-black text-zinc-900 tracking-tight">
              {opInfo.description || truth.plain_english_failure || 'Campaign is monitored and verified via Encho Master Engine.'}
            </h2>

            {opInfo.recommended_action && (
              <div className="flex items-start gap-2.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3.5 text-xs text-zinc-700">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-zinc-900">Recommended Step: </strong>
                  <span>{opInfo.recommended_action}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Escrow Shield Status */}
          <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-4 md:min-w-[240px] shrink-0 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{fin.escrow_state_display || 'Protected in Escrow'}</span>
            </div>
            <p className="text-[11px] text-emerald-950 font-medium leading-relaxed">
              Your funds are held securely. You are only billed for actual verified delivery on Meta.
            </p>
            <div className="pt-2 border-t border-emerald-200/40 flex justify-between text-xs font-mono font-bold text-emerald-900">
              <span>Authorized:</span>
              <span>${fin.meta_authorized_spend?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Action Required / Failure Intelligence Callout (if active problem) */}
      {isActionRequired && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-6 md:p-7 text-rose-950 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
            <h3 className="text-lg font-black text-rose-900">Action Required to Deliver Your Campaign</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-white/80 border border-rose-200/80 rounded-2xl p-4 space-y-1.5">
              <span className="font-extrabold uppercase text-[10px] tracking-wider text-rose-700">What Happened</span>
              <p className="text-rose-950 font-medium leading-relaxed">
                {truth.failure_intelligence?.what_happened || truth.plain_english_failure || 'Media or copy adjustment required to meet Meta advertising guidelines.'}
              </p>
            </div>

            <div className="bg-white/80 border border-rose-200/80 rounded-2xl p-4 space-y-1.5">
              <span className="font-extrabold uppercase text-[10px] tracking-wider text-rose-700">What You Should Do</span>
              <p className="text-rose-950 font-medium leading-relaxed">
                {truth.host_next_action || truth.failure_intelligence?.action_required || 'Click Fix Campaign Details to update flagged text or images.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-800">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>{truth.failure_intelligence?.financial_safety || 'Your ad budget remains 100% safe in escrow.'}</span>
            </div>

            <button
              onClick={() => handleOpenActionModal('FIX_CAMPAIGN')}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <span>Fix Campaign Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 overflow-x-auto pb-px">
        {[
          { key: 'overview', label: 'Performance & Reach', icon: TrendingUp },
          { key: 'dco', label: `Creative Variants (${dco.variant_count || 0})`, icon: Layers },
          { key: 'social', label: 'Social Signals', icon: MessageSquare },
          { key: 'financials', label: 'Budget & Escrow Safety', icon: Coins },
          { key: 'timeline', label: 'Lifecycle Timeline', icon: Clock }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t-xl'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview / Performance Telemetry */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Freshness banner */}
          <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 text-xs text-zinc-600">
            <div className="flex items-center gap-2">
              <Radio className={`w-3.5 h-3.5 ${perf.performance_freshness === 'FRESH' ? 'text-emerald-500 animate-pulse' : 'text-zinc-400'}`} />
              <span>
                Telemetry Status: <strong>{perf.performance_freshness || 'UNAVAILABLE'}</strong>
                {perf.performance_last_updated && ` (Last sync: ${new Date(perf.performance_last_updated).toLocaleTimeString()})`}
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">{perf.performance_source || 'Meta Graph API v20.0'}</span>
          </div>

          {!perf.has_performance_data ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                <BarChart2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-zinc-900">No Performance Data Yet</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                Live impressions, clicks, and conversions will stream directly from Meta once your advertisement begins serving to targeted users.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Ad Impressions</span>
                <p className="text-2xl font-black text-zinc-900">{perf.impressions?.toLocaleString() ?? '-'}</p>
                <span className="text-[10px] text-zinc-500">Total views on feeds</span>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Unique Reach</span>
                <p className="text-2xl font-black text-blue-600">{perf.reach?.toLocaleString() ?? '-'}</p>
                <span className="text-[10px] text-zinc-500">Individual people</span>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Form / Link Clicks</span>
                <p className="text-2xl font-black text-indigo-600">{perf.clicks?.toLocaleString() ?? '-'}</p>
                <span className="text-[10px] text-zinc-500">Interested guests</span>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Click Rate (CTR)</span>
                <p className="text-2xl font-black text-emerald-600">{perf.ctr ? `${(perf.ctr * 100).toFixed(2)}%` : '-'}</p>
                <span className="text-[10px] text-zinc-500">Engagement ratio</span>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Cost Per Click (CPC)</span>
                <p className="text-2xl font-black text-zinc-900">{perf.cpc ? `$${perf.cpc.toFixed(2)}` : '-'}</p>
                <span className="text-[10px] text-zinc-500">Efficiency</span>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Direct Inquiries</span>
                <p className="text-2xl font-black text-violet-600">{perf.conversions?.toLocaleString() ?? '-'}</p>
                <span className="text-[10px] text-zinc-500">CRM leads captured</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Dynamic Creative Optimization (DCO) */}
      {activeTab === 'dco' && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-lg text-zinc-900">Dynamic Creative Optimization Engine</h3>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold">
                {dco.dco_status || 'TESTING'}
              </span>
            </div>
            <p className="text-xs text-zinc-600 font-medium leading-relaxed">
              {dco.dco_status_label || 'ENCHO is comparing your approved creatives to identify and scale the highest-converting format automatically.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(dco.variants || []).map((variant: any, idx: number) => {
              const isWinner = dco.winner_variant_id && String(dco.winner_variant_id) === String(variant.id);
              return (
                <div
                  key={variant.id || idx}
                  className={`bg-white rounded-3xl border overflow-hidden shadow-sm transition ${
                    isWinner ? 'border-amber-400 ring-4 ring-amber-400/20' : 'border-zinc-200'
                  }`}
                >
                  <div className="relative h-48 bg-zinc-100 overflow-hidden">
                    <img
                      src={variant.media_url || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6'}
                      alt={`Variant #${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      <span className="px-2.5 py-1 bg-black/70 text-white backdrop-blur-md rounded-lg text-[10px] font-mono font-bold">
                        Variant #{idx + 1}
                      </span>
                      {isWinner && (
                        <span className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[10px] font-black flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> Winner
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-zinc-900">Optimization State:</span>
                      <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 font-bold rounded-md text-[11px]">
                        {variant.dco_status}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-500 font-medium">
                      {variant.dco_status_label}
                    </p>

                    <div className="pt-3 border-t border-zinc-100 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-zinc-50 p-2 rounded-xl">
                        <span className="text-[9px] font-extrabold uppercase text-zinc-400 block">Views</span>
                        <span className="font-black text-zinc-900">{variant.impressions ?? '-'}</span>
                      </div>
                      <div className="bg-zinc-50 p-2 rounded-xl">
                        <span className="text-[9px] font-extrabold uppercase text-zinc-400 block">Clicks</span>
                        <span className="font-black text-zinc-900">{variant.clicks ?? '-'}</span>
                      </div>
                      <div className="bg-zinc-50 p-2 rounded-xl">
                        <span className="text-[9px] font-extrabold uppercase text-zinc-400 block">Spend</span>
                        <span className="font-black text-zinc-900">{variant.spend ? `$${variant.spend}` : '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Social Engagement Signals */}
      {activeTab === 'social' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 text-xs text-zinc-600">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                Social Feed Signals: <strong>{eng.engagement_freshness || 'UNAVAILABLE'}</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">{eng.engagement_source}</span>
          </div>

          {!eng.has_engagement_data ? (
            <div className="bg-white border border-zinc-200 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-zinc-900">No Social Signals Recorded Yet</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                As users like, comment, and share your Facebook and Instagram post ads, direct social telemetry will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-zinc-200 rounded-3xl p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <ThumbsUp className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 block">Post Reactions</span>
                  <p className="text-2xl font-black text-zinc-900">{eng.reactions?.toLocaleString() ?? '-'}</p>
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-3xl p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 block">Comments</span>
                  <p className="text-2xl font-black text-zinc-900">{eng.comments?.toLocaleString() ?? '-'}</p>
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-3xl p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Share2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 block">Shares</span>
                  <p className="text-2xl font-black text-zinc-900">{eng.shares?.toLocaleString() ?? '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Financials & Escrow Breakdown */}
      {activeTab === 'financials' && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-zinc-900">Escrow & Financial Transparency</h3>
                <p className="text-xs text-zinc-500 font-medium">Clear breakdown of your campaign funds and platform fee.</p>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                100% Escrow Protected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-50 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Total Campaign Budget</span>
                <p className="text-2xl font-black text-zinc-900">${fin.total_paid?.toFixed(2) || '0.00'}</p>
                <span className="text-[10px] text-zinc-500">Funded upfront</span>
              </div>

              <div className="bg-blue-50/60 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-blue-600">Authorized Meta Ad Spend (85%)</span>
                <p className="text-2xl font-black text-blue-700">${fin.ad_spend_allocation?.toFixed(2) || '0.00'}</p>
                <span className="text-[10px] text-blue-600/80">Direct ad delivery</span>
              </div>

              <div className="bg-emerald-50/60 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-emerald-600">Actual Delivered Spend</span>
                <p className="text-2xl font-black text-emerald-700">${fin.actual_spend?.toFixed(2) || '0.00'}</p>
                <span className="text-[10px] text-emerald-600/80">Verified Meta charges</span>
              </div>

              <div className="bg-zinc-50 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-zinc-400">Remaining Budget</span>
                <p className="text-2xl font-black text-zinc-900">${fin.remaining_authorized_spend?.toFixed(2) || '0.00'}</p>
                <span className="text-[10px] text-zinc-500">Available for delivery</span>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-zinc-700 font-medium">Encho AI Optimization & Management Fee (15%):</span>
              </div>
              <span className="font-mono font-bold text-zinc-900">${fin.encho_fee?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Lifecycle Timeline */}
      {activeTab === 'timeline' && (
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 md:p-8 space-y-6">
          <h3 className="text-lg font-black text-zinc-900">Campaign Delivery Lifecycle</h3>

          <div className="space-y-4">
            {timeline.map((step: any, idx: number) => {
              const isCompleted = step.status === 'COMPLETED';
              const isCurrent = step.status === 'CURRENT';
              const isFailed = step.status === 'FAILED';

              return (
                <div key={step.key || idx} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCompleted
                          ? 'bg-emerald-500 text-white'
                          : isFailed
                          ? 'bg-rose-500 text-white'
                          : isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                          : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : isFailed ? <X className="w-4 h-4" /> : idx + 1}
                    </div>
                    {idx < timeline.length - 1 && (
                      <div className={`w-0.5 h-10 ${isCompleted ? 'bg-emerald-300' : 'bg-zinc-200'}`} />
                    )}
                  </div>

                  <div className="pt-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-zinc-900">{step.label}</h4>
                      {step.timestamp && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    {step.description && (
                      <p className="text-xs text-zinc-500 font-medium">{step.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Explanation Preview Modal */}
      {actionPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 space-y-6 shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-black text-zinc-900">{actionPreview.action}</h3>
              </div>
              <button
                onClick={() => {
                  setActionPreview(null);
                  setSelectedActionKey(null);
                }}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 p-3.5 rounded-2xl space-y-1">
                <span className="font-extrabold uppercase text-[10px] text-zinc-400">Current State</span>
                <p className="font-semibold text-zinc-800">{actionPreview.current_state}</p>
              </div>

              <div className="bg-emerald-50/60 p-3.5 rounded-2xl space-y-1 text-emerald-950">
                <span className="font-extrabold uppercase text-[10px] text-emerald-700">What WILL Happen</span>
                <p className="font-medium">{actionPreview.what_will_happen}</p>
              </div>

              <div className="bg-zinc-50 p-3.5 rounded-2xl space-y-1 text-zinc-700">
                <span className="font-extrabold uppercase text-[10px] text-zinc-500">What will NOT Happen</span>
                <p className="font-medium">{actionPreview.what_will_not_happen}</p>
              </div>

              <div className="bg-blue-50/60 p-3.5 rounded-2xl space-y-1 text-blue-950">
                <span className="font-extrabold uppercase text-[10px] text-blue-700">Expected Result</span>
                <p className="font-medium">{actionPreview.expected_result}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setActionPreview(null);
                  setSelectedActionKey(null);
                }}
                disabled={isExecutingAction}
                className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={isExecutingAction}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
              >
                {isExecutingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Confirm & Execute</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostCampaignControlCenter;
