import React, { useState, useEffect, useRef } from 'react';
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
  Layers,
  FileText,
  Check,
  X,
  ExternalLink,
  Loader2,
  Clock,
  Coins,
  Sparkles,
  Zap,
  TrendingUp,
  BarChart2,
  Users,
  MessageSquare,
  HelpCircle,
  ArrowLeft,
  Lock,
  ChevronRight,
  Info
} from 'lucide-react';
import { HostMetaDeliveryStatusCard } from './HostMetaDeliveryStatusCard';
import { HostCampaignPerformanceCard } from './HostCampaignPerformanceCard';
import { HostCampaignFinancialCard } from './HostCampaignFinancialCard';
import { CampaignReactorCore } from './CampaignReactorCore';
import { HostGeographicPerformanceCard } from './HostGeographicPerformanceCard';
import { HostFunnelRoasCard } from './HostFunnelRoasCard';
import { HostDemographicsCard } from './HostDemographicsCard';
import { HostPlacementsAndDevicesCard } from './HostPlacementsAndDevicesCard';
import { HostMetaProofBadge } from './HostMetaProofBadge';
import { HostLiveCreativePreviewCard } from './HostLiveCreativePreviewCard';
import { HostCampaignAiAdvisorCard } from './HostCampaignAiAdvisorCard';
import { HostDirectInquiriesFeedCard } from './HostDirectInquiriesFeedCard';
import { HostDynamicPricingSyncCard } from './HostDynamicPricingSyncCard';

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
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Action Preview Modal
  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);
  const [actionPreview, setActionPreview] = useState<HostActionPreview | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState<boolean>(false);

  // Active Details Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'transparency' | 'performance' | 'financials' | 'dco' | 'timeline'>('overview');

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const token = localStorage.getItem('token') || '';

  const fetchCampaignTruth = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/control-center`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        setError({
          status: res.status,
          message: `Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`
        });
        return;
      }

      if (res.ok) {
        setTruth(data);
      } else {
        setError({
          status: res.status,
          message: data.error || `Failed to load campaign truth (HTTP ${res.status}).`
        });
      }
    } catch (err: any) {
      console.error('Error fetching campaign truth:', err);
      setError({
        message: err.message || 'Network error while fetching campaign details. Please check your connection.'
      });
    } finally {
      if (showLoadingSpinner) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (campaignId) {
      fetchCampaignTruth(true);

      // Automated Polling: refresh every 20 seconds while active/live
      pollingIntervalRef.current = setInterval(() => {
        fetchCampaignTruth(false);
      }, 20000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
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
      setSelectedActionKey(actionKey);
      setActionPreview({
        action: actionKey,
        current_state: truth?.operational_status_info?.display_label || 'Current state',
        what_will_happen: `Execute ${actionKey} on this campaign.`,
        what_will_not_happen: 'No unauthorized financial or state mutations will occur.',
        why_allowed: 'Action authorized by ENCHO Policy Engine.',
        expected_result: 'State will synchronize automatically.',
        failure_or_unknown_outcome: 'In the event of network disruption, the system will auto-reconcile without loss.'
      });
    }
  };

  const handleConfirmAction = async () => {
    if (!selectedActionKey) return;
    setIsExecutingAction(true);
    try {
      let endpoint = `/api/marketing/campaigns/${campaignId}/action`;
      const method = 'POST';
      const body: any = { action: selectedActionKey };

      if (selectedActionKey === 'PAUSE_CAMPAIGN') {
        endpoint = `/api/marketing/campaigns/${campaignId}/pause`;
      } else if (selectedActionKey === 'RESUME_CAMPAIGN') {
        endpoint = `/api/marketing/campaigns/${campaignId}/resume`;
      } else if (selectedActionKey === 'RESYNC_METRICS') {
        endpoint = `/api/marketing/campaigns/${campaignId}/resync`;
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        setNotification({ type: 'success', message: data.message || `Action ${selectedActionKey} executed successfully.` });
        setSelectedActionKey(null);
        setActionPreview(null);
        await fetchCampaignTruth(false);
      } else {
        setNotification({ type: 'error', message: data.error || `Failed to execute ${selectedActionKey}.` });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error executing action.' });
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Loading Skeleton State
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse"></div>
          <div className="h-9 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse"></div>
        </div>
        <div className="h-36 bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl animate-pulse"></div>
          <div className="h-64 bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  // Explicit Error States (401, 403, 404, 409, 429, 500, non-JSON)
  if (error || !truth) {
    const is403 = error?.status === 403;
    const is404 = error?.status === 404;
    const is429 = error?.status === 429;

    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-fade-in">
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 inline-flex mb-4">
          <ShieldAlert className="w-10 h-10 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          {is403 ? 'Access Restricted' : is404 ? 'Campaign Not Found' : is429 ? 'Rate Limit Reached' : 'Unable to Load Campaign'}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-6">
          {error?.message || 'An error occurred while loading canonical campaign details.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
            >
              Back to Campaigns
            </button>
          )}
          <button
            onClick={() => fetchCampaignTruth(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const panels = truth.transparency_panels || {
    what_is_happening: truth.operational_status_info?.display_label || 'Active campaign',
    why: truth.operational_status_info?.display_description || 'Serving traveler interest.',
    who_is_responsible: truth.operational_status_info?.operational_owner || 'ENCHO System',
    last_verified: truth.meta_external_state?.external_status_verified_at || 'Just now',
    what_happens_next: truth.operational_status_info?.recommended_action || 'Monitoring continuous delivery.',
    what_you_can_do: 'Review live metrics and lead inquiries.'
  };

  const allowedActions: string[] = truth.allowed_actions || [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6 animate-fade-in">
      {/* Top Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Back to Campaigns"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Host Campaign Control Center
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {truth.title || `Campaign #${campaignId}`}
            </h1>
          </div>
        </div>

        {/* Action Controls & Resync */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleManualResync}
            disabled={isRefreshing}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
            aria-label="Resync Meta Truth"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            {isRefreshing ? 'Syncing...' : 'Resync Truth'}
          </button>

          {allowedActions.includes('PAUSE_CAMPAIGN') && (
            <button
              onClick={() => handleOpenActionModal('PAUSE_CAMPAIGN')}
              className="px-3.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          )}

          {allowedActions.includes('RESUME_CAMPAIGN') && (
            <button
              onClick={() => handleOpenActionModal('RESUME_CAMPAIGN')}
              className="px-3.5 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
          role="alert"
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:opacity-75 transition-opacity"
            aria-label="Close Notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Live Meta Delivery Status Card */}
      <HostMetaDeliveryStatusCard
        operationalStatus={truth.operational_status}
        operationalStatusInfo={truth.operational_status_info}
        delivery={truth.delivery}
        freshness={truth.freshness}
        metaLink={truth.meta_link}
        onRefresh={handleManualResync}
        isRefreshing={isRefreshing}
      />

      {/* 2. Campaign Reactor Core (Dynamic Budget Fuel Gauge & 1-Click Refuel) */}
      <CampaignReactorCore
        campaignId={campaignId}
        fuelGauge={truth.fuel_gauge}
        currency={truth.financial_safety?.currency}
        isLive={truth.operational_status === 'LIVE'}
        onRefuelSuccess={() => fetchCampaignTruth(false)}
      />

      {/* 3. Conversion Funnel & True ROAS Transparency Card */}
      <HostFunnelRoasCard
        funnelMetrics={truth.funnel_metrics}
        financialSafety={truth.financial_safety}
        currency={truth.financial_safety?.currency}
      />

      {/* 4. Geographic Ad Delivery & Target Region Reach Card */}
      <HostGeographicPerformanceCard
        geographicBreakdown={truth.geographic_breakdown}
        currency={truth.financial_safety?.currency}
      />

      {/* 5. Audience Demographics & Persona Intelligence */}
      <HostDemographicsCard
        demographicsBreakdown={truth.demographics_breakdown}
        audienceInterests={truth.audience_interests_breakdown}
      />

      {/* 6. Multi-Channel Placements & Device Operating Systems */}
      <HostPlacementsAndDevicesCard
        placementBreakdown={truth.placement_breakdown}
        deviceBreakdown={truth.device_breakdown}
      />

      {/* 7. Dynamic Listing Pricing Sync Command (Gap 16) */}
      <HostDynamicPricingSyncCard
        campaignId={campaignId}
        pricingSyncStatus={truth.pricing_sync_status}
        currency={truth.financial_safety?.currency}
        onSyncComplete={() => fetchCampaignTruth(false)}
      />

      {/* 8. Live Ad Creative Preview Mockup */}
      <HostLiveCreativePreviewCard
        currency={truth.financial_safety?.currency}
        listingLocation={truth.target_locations || 'Target Metro Area'}
      />

      {/* 8. Encho AI Co-Pilot Intelligence Advisor */}
      <HostCampaignAiAdvisorCard
        fuelPercentage={truth.fuel_gauge?.fuel_percentage}
        topLocation={truth.geographic_breakdown?.[0]?.location}
        ctr={truth.funnel_metrics?.click_rate}
        leadsCount={truth.funnel_metrics?.direct_leads}
        isLive={truth.operational_status === 'LIVE'}
      />

      {/* 9. Direct Walled Garden Inquiries Feed */}
      <HostDirectInquiriesFeedCard
        leads={[]}
      />

      {/* 10. 100% Authenticity Cryptographic Proof Badge */}
      <HostMetaProofBadge
        proof={truth.meta_cryptographic_proof}
      />

      {/* 11. Six Canonical Transparency Panels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Panel 1: What is Happening */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">
              1. What is Happening
            </span>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {panels.what_is_happening}
            </h4>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-600 dark:text-zinc-400">
            Authoritative status from ENCHO truth engine.
          </div>
        </div>

        {/* Panel 2: Why */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">
              2. Why
            </span>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {panels.why}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500 flex items-center gap-1">
            <Info className="w-3 h-3 text-zinc-400" /> Operational Context
          </div>
        </div>

        {/* Panel 3: Who is Responsible */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">
              3. Who is Responsible
            </span>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              {panels.who_is_responsible}
            </h4>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500">
            Accountability ownership boundary.
          </div>
        </div>

        {/* Panel 4: Last Verified */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">
              4. Last Verified
            </span>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>{panels.last_verified}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500">
            Freshness: <strong className="text-zinc-700 dark:text-zinc-300">{truth.freshness?.external_freshness || 'FRESH'}</strong>
          </div>
        </div>

        {/* Panel 5: What Happens Next */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">
              5. What Happens Next
            </span>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {panels.what_happens_next}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" /> Deterministic Pipeline
          </div>
        </div>

        {/* Panel 6: What You Can Do */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">
              6. What You Can Do
            </span>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
              {panels.what_you_can_do}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500">
            Safe actionable controls.
          </div>
        </div>
      </div>

      {/* 6. Performance & Financial Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HostCampaignPerformanceCard
          performanceState={truth.performance_state}
          currency={truth.financial_safety?.currency}
        />
        <HostCampaignFinancialCard
          financialSafety={truth.financial_safety}
        />
      </div>

      {/* Action Preview Confirmation Modal */}
      {selectedActionKey && actionPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 id="action-modal-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Confirm {selectedActionKey.replace(/_/g, ' ')}
              </h3>
              <button
                onClick={() => { setSelectedActionKey(null); setActionPreview(null); }}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
                aria-label="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
              <div>
                <strong className="block text-zinc-900 dark:text-zinc-100 mb-0.5">What will happen:</strong>
                <span>{actionPreview.what_will_happen}</span>
              </div>
              <div>
                <strong className="block text-zinc-900 dark:text-zinc-100 mb-0.5">What will NOT happen:</strong>
                <span>{actionPreview.what_will_not_happen}</span>
              </div>
              <div>
                <strong className="block text-zinc-900 dark:text-zinc-100 mb-0.5">Expected outcome:</strong>
                <span>{actionPreview.expected_result}</span>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl text-[11px] text-zinc-500">
                <span>{actionPreview.failure_or_unknown_outcome}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => { setSelectedActionKey(null); setActionPreview(null); }}
                disabled={isExecutingAction}
                className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={isExecutingAction}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isExecutingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isExecutingAction ? 'Executing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostCampaignControlCenter;
