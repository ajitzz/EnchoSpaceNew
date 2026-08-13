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
  Cpu
} from 'lucide-react';

interface AdminMetaCampaignCommandCenterProps {
  onBack?: () => void;
}

export type ActionType = 'approve' | 'reject' | 'resync' | 'pause' | 'resume' | 'kill';

export interface ActionPreviewConfig {
  type: ActionType;
  title: string;
  campaignId: number;
  campaignTitle: string;
  currentState: {
    governance: string;
    financial: string;
    publishing: string;
    metaExternal: string;
  };
  whatWillHappen: string[];
  whatWillNotHappen: string[];
  whyAllowed: string;
  expectedResult: string;
  failureUnknownBehavior: string;
  apiEndpoint: string;
  apiMethod: 'POST';
  payload?: any;
}

export const AdminMetaCampaignCommandCenter: React.FC<AdminMetaCampaignCommandCenterProps> = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [truthMap, setTruthMap] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingTruth, setLoadingTruth] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'action_required' | 'unknown' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Action Explanation Preview Modal State
  const [actionPreview, setActionPreview] = useState<ActionPreviewConfig | null>(null);
  const [executingAction, setExecutingAction] = useState<boolean>(false);
  const [rejectionFeedback, setRejectionFeedback] = useState<string>('Ad content or targeting does not meet Meta policies.');

  // Expanded Sections State per Campaign
  const [expandedTraceId, setExpandedTraceId] = useState<number | null>(null);
  const [expandedTimelineId, setExpandedTimelineId] = useState<number | null>(null);
  const [expandedVariantsId, setExpandedVariantsId] = useState<number | null>(null);

  const token = localStorage.getItem('token') || '';

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/marketing/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
        if (data.length > 0 && !selectedCampaignId) {
          setSelectedCampaignId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching admin campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignTruth = async (campaignId: number) => {
    setLoadingTruth(prev => ({ ...prev, [campaignId]: true }));
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${campaignId}/control-center`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const truth = await res.json();
        setTruthMap(prev => ({ ...prev, [campaignId]: truth }));
      }
    } catch (err) {
      console.error(`Error fetching campaign ${campaignId} truth:`, err);
    } finally {
      setLoadingTruth(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignTruth(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  // Handle Tab Switch / Selection
  const handleSelectCampaign = (id: number) => {
    setSelectedCampaignId(id);
    if (!truthMap[id]) {
      fetchCampaignTruth(id);
    }
  };

  // Open Action Explanation Preview Modal
  const openActionPreview = (type: ActionType, campaign: any, truth: any) => {
    const currentState = {
      governance: truth?.governance_status || campaign.status?.toUpperCase() || 'UNKNOWN',
      financial: truth?.escrow_status || campaign.payment_status?.toUpperCase() || 'UNFUNDED',
      publishing: truth?.publish_status || 'IDLE',
      metaExternal: truth?.meta_external_state?.meta_status || 'UNPUBLISHED'
    };

    let config: ActionPreviewConfig;

    switch (type) {
      case 'approve':
        config = {
          type: 'approve',
          title: 'Approve & Dispatch Campaign to Meta API',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currentState,
          whatWillHappen: [
            'Governance State transition to ADMIN_APPROVED and policy cleared.',
            'Payment status verified and marked as paid/holding.',
            'Triggers Meta Ads Graph API 3-tier dispatch (Campaign, AdSet, Creative, Ad).',
            'Publishing transaction logged in meta_publishing_transactions with atomic correlation ID.'
          ],
          whatWillNotHappen: [
            'Will NOT double charge host credit card or wallet.',
            'Will NOT mutate Meta ad account settings outside this campaign boundary.',
            'Will NOT grant auto-approval to future non-compliant edits.'
          ],
          whyAllowed: 'Campaign is currently in PENDING_ADMIN_REVIEW or RECOVERY state with host budget secured in escrow.',
          expectedResult: 'Target State: Governance = ADMIN_APPROVED, Publishing = DISPATCHING -> SUCCESS, Meta = ACTIVE/PENDING_REVIEW.',
          failureUnknownBehavior: 'If Meta API times out, publishing status enters EXTERNAL_OUTCOME_UNKNOWN without dropping escrow funds.',
          apiEndpoint: `/api/admin/marketing/campaigns/${campaign.id}/approve`,
          apiMethod: 'POST'
        };
        break;

      case 'reject':
        config = {
          type: 'reject',
          title: 'Reject Campaign & Process Wallet Refund',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currentState,
          whatWillHappen: [
            'Governance State transition to ADMIN_REJECTED.',
            'Admin feedback recorded for host visibility.',
            'Double-entry escrow refund issued directly to host wallet balance.',
            'Immutable audit trail recorded in admin_audit_logs.'
          ],
          whatWillNotHappen: [
            'Will NOT invoke Meta API dispatch or create Meta Ad objects.',
            'Will NOT retain host budget; 100% unused budget is refunded.'
          ],
          whyAllowed: 'Campaign is currently pending admin review or in draft/failed review state.',
          expectedResult: 'Target State: Governance = ADMIN_REJECTED, Financial = REFUNDED_TO_WALLET, Publishing = IDLE.',
          failureUnknownBehavior: 'If wallet refund fails, transaction rolls back and campaign remains in review state.',
          apiEndpoint: `/api/admin/marketing/campaigns/${campaign.id}/reject`,
          apiMethod: 'POST',
          payload: { feedback: rejectionFeedback }
        };
        break;

      case 'resync':
        config = {
          type: 'resync',
          title: 'Re-sync & Reconcile Meta External State',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currentState,
          whatWillHappen: [
            'Executes authoritative GET request to Meta Graph API for Campaign, AdSet, and Ad objects.',
            'Updates external_status_verified_at timestamp and verification source.',
            'Reconciles local publish state with Meta effective status.',
            'Clears stale or degraded external state flags if Meta is healthy.'
          ],
          whatWillNotHappen: [
            'Will NOT alter financial escrow state or host wallet.',
            'Will NOT mutate Meta Ad status (read-only verification).'
          ],
          whyAllowed: 'State drift detected or campaign requires external status reconciliation.',
          expectedResult: 'Target State: Meta External State = FRESH, State Drift = CLEAR, Reconciliation = COMPLETE.',
          failureUnknownBehavior: 'If Meta API fails, freshness marks DEGRADED; local state remains safe.',
          apiEndpoint: `/api/admin/marketing/campaigns/${campaign.id}/resync-meta`,
          apiMethod: 'POST'
        };
        break;

      case 'pause':
        config = {
          type: 'pause',
          title: 'Pause Active Meta Campaign',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currentState,
          whatWillHappen: [
            'Sends POST request to Meta Graph API updating status to PAUSED.',
            'Updates campaign status to paused in database.',
            'Halts active ad impression accrual on Meta Ads Manager.',
            'Sends realtime socket notification to host.'
          ],
          whatWillNotHappen: [
            'Will NOT delete Meta Ad objects or archive campaign.',
            'Will NOT forfeit remaining budget.'
          ],
          whyAllowed: 'Campaign is currently ACTIVE on Meta.',
          expectedResult: 'Target State: Meta External State = PAUSED, Publishing = SUCCESS (PAUSED).',
          failureUnknownBehavior: 'If Meta API call fails, local state reflects pause attempt with warning.',
          apiEndpoint: `/api/admin/marketing/campaigns/${campaign.id}/pause-meta`,
          apiMethod: 'POST'
        };
        break;

      case 'resume':
        config = {
          type: 'resume',
          title: 'Resume Paused Meta Campaign',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currentState,
          whatWillHappen: [
            'Sends POST request to Meta Graph API updating status to ACTIVE.',
            'Updates campaign status to active in database.',
            'Resumes impression delivery and click optimization on Meta.'
          ],
          whatWillNotHappen: [
            'Will NOT charge additional fees beyond remaining budget.'
          ],
          whyAllowed: 'Campaign is currently PAUSED on Meta.',
          expectedResult: 'Target State: Meta External State = ACTIVE, Delivery = LIVE.',
          failureUnknownBehavior: 'If Meta API call fails, remains PAUSED with diagnostic log.',
          apiEndpoint: `/api/admin/marketing/campaigns/${campaign.id}/resume-meta`,
          apiMethod: 'POST'
        };
        break;

      case 'kill':
        config = {
          type: 'kill',
          title: 'Kill & Archive Campaign (Emergency Action)',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          currentState,
          whatWillHappen: [
            'Sends POST request to Meta Graph API archiving campaign on Meta Ads Manager.',
            'Transitions status to killed/archived in database.',
            'Calculates remaining unused budget and refunds to host wallet.',
            'Logs emergency kill event in admin_audit_logs.'
          ],
          whatWillNotHappen: [
            'Will NOT retain unused host budget.',
            'Will NOT allow future reactivation of this archived Meta campaign ID.'
          ],
          whyAllowed: 'Administrator emergency intervention authorized.',
          expectedResult: 'Target State: Governance = ADMIN_APPROVED (KILLED), Meta = ARCHIVED, Financial = REFUNDED.',
          failureUnknownBehavior: 'If Meta API fails, local state archives campaign and flags Meta for manual cleanup.',
          apiEndpoint: `/api/admin/marketing/campaigns/${campaign.id}/kill-meta`,
          apiMethod: 'POST'
        };
        break;
    }

    setActionPreview(config);
  };

  // Execute Confirmed Action
  const handleExecuteAction = async () => {
    if (!actionPreview) return;
    setExecutingAction(true);
    setNotification(null);

    try {
      const res = await fetch(actionPreview.apiEndpoint, {
        method: actionPreview.apiMethod,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: actionPreview.payload ? JSON.stringify(actionPreview.payload) : undefined
      });

      const data = await res.json();

      if (res.ok && data.success !== false) {
        setNotification({
          type: 'success',
          message: data.message || `Action ${actionPreview.type.toUpperCase()} executed successfully.`
        });
        setActionPreview(null);
        // Refresh campaigns & truth projection
        await fetchCampaigns();
        await fetchCampaignTruth(actionPreview.campaignId);
      } else {
        setNotification({
          type: 'error',
          message: data.error || data.message || 'Action execution failed.'
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Network exception during action execution.'
      });
    } finally {
      setExecutingAction(false);
    }
  };

  // Filter Logic
  const filteredCampaigns = campaigns.filter(c => {
    const truth = truthMap[c.id];
    const matchSearch = searchQuery.trim() === '' ||
      c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.host_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.host_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.listing_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.meta_campaign_id?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;

    if (filter === 'all') return true;
    if (filter === 'pending') return c.status === 'pending' || c.status === 'pending_approval' || truth?.governance_status === 'PENDING_ADMIN_REVIEW';
    if (filter === 'active') return c.status === 'active' || c.status === 'approved' || truth?.publish_status === 'SUCCESS';
    if (filter === 'action_required') return truth?.publish_status === 'FAILED_PUBLISH' || truth?.derived_operational_state?.includes('ACTION');
    if (filter === 'unknown') return truth?.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN';
    if (filter === 'rejected') return c.status === 'rejected' || truth?.governance_status === 'ADMIN_REJECTED';
    return true;
  });

  const activeTruth = selectedCampaignId ? truthMap[selectedCampaignId] : null;
  const activeCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl border border-indigo-800/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-emerald-400" /> Canonical Truth Engine (Phase 2.7 M6)
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Admin Command Center Active
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Meta Campaign Command Center</span>
          </h2>
          <p className="text-xs text-indigo-200/80 font-medium max-w-2xl">
            Authoritative, unified control center backed solely by <code className="text-emerald-300 font-mono">CampaignControlCenterService.getCampaignTruth()</code>. Zero client-side state reconstruction.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              fetchCampaigns();
              if (selectedCampaignId) fetchCampaignTruth(selectedCampaignId);
            }}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Re-Sync All Truth</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold animate-fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{notification.message}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* High-Level Stat Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Total Campaigns</span>
          <span className="text-2xl font-black text-gray-900">{campaigns.length}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Pending Review</span>
          <span className="text-2xl font-black text-amber-600">
            {campaigns.filter(c => c.status === 'pending' || c.status === 'pending_approval' || truthMap[c.id]?.governance_status === 'PENDING_ADMIN_REVIEW').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Live on Meta</span>
          <span className="text-2xl font-black text-emerald-600">
            {campaigns.filter(c => truthMap[c.id]?.publish_status === 'SUCCESS' || c.status === 'active').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Action Required</span>
          <span className="text-2xl font-black text-rose-600">
            {campaigns.filter(c => truthMap[c.id]?.publish_status === 'FAILED_PUBLISH' || truthMap[c.id]?.derived_operational_state?.includes('ACTION')).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Outcome Unknown</span>
          <span className="text-2xl font-black text-purple-600">
            {campaigns.filter(c => truthMap[c.id]?.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Escrow Funds Safe</span>
          <span className="text-2xl font-black text-sky-700">
            ₹{campaigns.reduce((sum, c) => sum + (Number(c.budget) || 0), 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-150">
          {[
            { id: 'all', label: 'All', count: campaigns.length },
            { id: 'pending', label: 'Pending Review', count: campaigns.filter(c => c.status === 'pending' || c.status === 'pending_approval' || truthMap[c.id]?.governance_status === 'PENDING_ADMIN_REVIEW').length },
            { id: 'active', label: 'Live / Active', count: campaigns.filter(c => truthMap[c.id]?.publish_status === 'SUCCESS' || c.status === 'active').length },
            { id: 'action_required', label: 'Failed / Action Needed', count: campaigns.filter(c => truthMap[c.id]?.publish_status === 'FAILED_PUBLISH' || truthMap[c.id]?.derived_operational_state?.includes('ACTION')).length },
            { id: 'unknown', label: 'Outcome Unknown', count: campaigns.filter(c => truthMap[c.id]?.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN').length },
            { id: 'rejected', label: 'Rejected / Archived', count: campaigns.filter(c => c.status === 'rejected' || truthMap[c.id]?.governance_status === 'ADMIN_REJECTED').length }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 focus:outline-none ${
                filter === tab.id
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                filter === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search campaigns, hosts, listing..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Split Layout: List Selector (Left) + Detailed Command Center (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Campaign Selection List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Campaign Queue ({filteredCampaigns.length})
          </h3>

          {loading ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-gray-200 space-y-2">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs text-gray-500 font-medium">Loading campaign command data...</p>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              <Megaphone className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500 font-medium">No campaigns match criteria.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[800px] overflow-y-auto pr-1">
              {filteredCampaigns.map(camp => {
                const truth = truthMap[camp.id];
                const isSelected = selectedCampaignId === camp.id;
                const isTruthLoading = loadingTruth[camp.id];

                const govStatus = truth?.governance_status || camp.status?.toUpperCase();
                const pubStatus = truth?.publish_status || 'IDLE';

                return (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => handleSelectCampaign(camp.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all relative ${
                      isSelected
                        ? 'bg-indigo-50/60 border-indigo-500 shadow-sm ring-1 ring-indigo-500/30'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="space-y-0.5">
                        <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{camp.title}</h4>
                        <p className="text-[11px] text-gray-500 font-medium truncate">
                          {camp.listing_title} • {camp.host_name}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-indigo-700 shrink-0">
                        ₹{Number(camp.budget || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                      <span className={`px-2 py-0.5 rounded-md font-bold uppercase border ${
                        govStatus === 'ADMIN_APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        govStatus === 'PENDING_ADMIN_REVIEW' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        govStatus === 'ADMIN_REJECTED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                        {govStatus}
                      </span>

                      <span className={`px-2 py-0.5 rounded-md font-bold uppercase border ${
                        pubStatus === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        pubStatus === 'FAILED_PUBLISH' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        pubStatus === 'EXTERNAL_OUTCOME_UNKNOWN' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        {pubStatus}
                      </span>

                      {isTruthLoading && <Loader2 className="w-3 h-3 text-indigo-600 animate-spin ml-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel: Detailed Command Center Card for Selected Campaign */}
        <div className="lg:col-span-8">
          {!selectedCampaignId || !activeCampaign ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center space-y-3">
              <Megaphone className="w-12 h-12 text-gray-300 mx-auto" />
              <h4 className="text-sm font-bold text-gray-700">Select a Campaign to Command</h4>
              <p className="text-xs text-gray-400">Choose a campaign from the queue to inspect canonical truth projection, diagnostics, and action controls.</p>
            </div>
          ) : loadingTruth[selectedCampaignId] && !activeTruth ? (
            <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-gray-600">Computing canonical truth projection for Campaign #{selectedCampaignId}...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Campaign Header & Title Box */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-gray-400">Campaign #{activeCampaign.id}</span>
                      <h3 className="text-xl font-bold text-gray-900">{activeCampaign.title}</h3>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                      Property: <strong className="text-gray-800">{activeCampaign.listing_title}</strong> • Host: <strong className="text-gray-800">{activeCampaign.host_name}</strong> ({activeCampaign.host_email})
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold block">Ad Budget</span>
                    <span className="text-2xl font-mono font-black text-sky-700">₹{Number(activeCampaign.budget || 0).toLocaleString()}</span>
                  </div>
                </div>

                {/* 3 PRIMARY STATE AXES BANNER */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                  {/* Axis 1: Governance Status */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">1. Governance Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase font-mono border ${
                        activeTruth?.governance_status === 'ADMIN_APPROVED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        activeTruth?.governance_status === 'PENDING_ADMIN_REVIEW' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        activeTruth?.governance_status === 'ADMIN_REJECTED' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                        'bg-gray-100 text-gray-800 border-gray-300'
                      }`}>
                        {activeTruth?.governance_status || 'UNKNOWN'}
                      </span>
                    </div>
                  </div>

                  {/* Axis 2: Financial State */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">2. Financial Escrow State</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase font-mono border ${
                        activeTruth?.escrow_status === 'HOLDING' ? 'bg-sky-100 text-sky-800 border-sky-300' :
                        activeTruth?.escrow_status === 'REFUNDED_TO_WALLET' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                        activeTruth?.escrow_status === 'RELEASED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {activeTruth?.escrow_status || 'UNFUNDED'}
                      </span>
                    </div>
                  </div>

                  {/* Axis 3: Publishing Status */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">3. Publishing Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase font-mono border ${
                        activeTruth?.publish_status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        activeTruth?.publish_status === 'FAILED_PUBLISH' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                        activeTruth?.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                        'bg-slate-200 text-slate-800 border-slate-300'
                      }`}>
                        {activeTruth?.publish_status || 'IDLE'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ACTION CONTROLS BUTTON BAR */}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 mr-2 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-indigo-600" /> Authorized Actions:
                  </span>

                  {/* Approve & Dispatch Button */}
                  {(activeTruth?.governance_status === 'PENDING_ADMIN_REVIEW' || activeTruth?.publish_status === 'FAILED_PUBLISH' || activeTruth?.publish_status === 'IDLE') && (
                    <button
                      type="button"
                      onClick={() => openActionPreview('approve', activeCampaign, activeTruth)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve & Dispatch</span>
                    </button>
                  )}

                  {/* Reject Button */}
                  {(activeTruth?.governance_status === 'PENDING_ADMIN_REVIEW' || activeTruth?.publish_status === 'IDLE') && (
                    <button
                      type="button"
                      onClick={() => openActionPreview('reject', activeCampaign, activeTruth)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-200 transition-all flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>Reject & Refund</span>
                    </button>
                  )}

                  {/* Sync / Reconcile Meta Button */}
                  {(activeTruth?.meta_external_state?.reconciliation_required || activeTruth?.meta_external_state?.meta_campaign_id) && (
                    <button
                      type="button"
                      onClick={() => openActionPreview('resync', activeCampaign, activeTruth)}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-indigo-200 transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-4 h-4 text-indigo-600" />
                      <span>Sync Meta Graph</span>
                    </button>
                  )}

                  {/* Pause Button */}
                  {activeTruth?.publish_status === 'SUCCESS' && activeTruth?.meta_external_state?.meta_status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => openActionPreview('pause', activeCampaign, activeTruth)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-amber-200 transition-all flex items-center gap-1.5"
                    >
                      <Pause className="w-4 h-4 text-amber-600" />
                      <span>Pause on Meta</span>
                    </button>
                  )}

                  {/* Resume Button */}
                  {activeTruth?.publish_status === 'SUCCESS' && activeTruth?.meta_external_state?.meta_status === 'PAUSED' && (
                    <button
                      type="button"
                      onClick={() => openActionPreview('resume', activeCampaign, activeTruth)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-emerald-200 transition-all flex items-center gap-1.5"
                    >
                      <Play className="w-4 h-4 text-emerald-600" />
                      <span>Resume on Meta</span>
                    </button>
                  )}

                  {/* Kill & Archive Button */}
                  {(activeTruth?.publish_status === 'SUCCESS' || activeTruth?.publish_status === 'FAILED_PUBLISH' || activeTruth?.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN') && (
                    <button
                      type="button"
                      onClick={() => openActionPreview('kill', activeCampaign, activeTruth)}
                      className="bg-zinc-900 hover:bg-black text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-sm ml-auto"
                    >
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>Kill & Archive</span>
                    </button>
                  )}
                </div>
              </div>

              {/* META EXTERNAL STATE & DRIFT DIAGNOSTICS PANEL */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-indigo-600" />
                    <span>Meta External State & Synchronization Lineage</span>
                  </h4>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Freshness:</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                      activeTruth?.meta_external_state?.external_freshness === 'FRESH' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      activeTruth?.meta_external_state?.external_freshness === 'STALE' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                      activeTruth?.meta_external_state?.external_freshness === 'DEGRADED' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                      'bg-gray-100 text-gray-800 border-gray-300'
                    }`}>
                      {activeTruth?.meta_external_state?.external_freshness || 'UNKNOWN'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase">Meta Status</span>
                    <span className="font-mono font-bold text-gray-900 text-sm">{activeTruth?.meta_external_state?.meta_status || 'UNPUBLISHED'}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase">Effective Status</span>
                    <span className="font-mono font-bold text-gray-900 text-sm">{activeTruth?.meta_external_state?.meta_effective_status || 'UNPUBLISHED'}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase">Verification Source</span>
                    <span className="font-mono font-bold text-gray-900 text-xs">{activeTruth?.meta_external_state?.external_status_verification_source || 'NONE'}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase">Verified At</span>
                    <span className="font-mono font-bold text-gray-900 text-xs">
                      {activeTruth?.meta_external_state?.external_status_verified_at ? new Date(activeTruth.meta_external_state.external_status_verified_at).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>

                {/* State Drift Alert if present */}
                {activeTruth?.meta_external_state?.has_drift && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="font-extrabold uppercase tracking-wide text-[11px] block">State Drift Warning Detected</strong>
                      <p className="font-medium">{activeTruth.meta_external_state.drift_details || 'Local campaign status differs from Meta Graph API effective state.'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* FAILURE INTELLIGENCE & SPECIFIC DIAGNOSTICS PANEL */}
              {(activeTruth?.publish_status === 'FAILED_PUBLISH' || activeTruth?.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN' || activeTruth?.root_error_code) && (
                <div className={`p-6 rounded-2xl border shadow-xs space-y-4 ${
                  activeTruth.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN'
                    ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center justify-between border-b border-purple-200/60 pb-3">
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-rose-600" />
                      <span>
                        {activeTruth.publish_status === 'EXTERNAL_OUTCOME_UNKNOWN'
                          ? 'Outcome Unknown on Meta API — Reconciliation Required'
                          : `Publishing Failure Diagnostic (${activeTruth.root_error_classification || 'ERROR'})`
                        }
                      </span>
                    </h4>

                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/80 border border-rose-200">
                      Correlation ID: {activeTruth.correlation_id}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white/80 p-3 rounded-xl border border-rose-100">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Failure Stage</span>
                      <span className="font-mono font-bold text-gray-900">{activeTruth.failure_stage || 'DISPATCH'}</span>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-rose-100">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Error Owner</span>
                      <span className="font-mono font-bold text-gray-900">{activeTruth.error_owner || 'UNKNOWN'}</span>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-rose-100">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Meta Error Code / Subcode</span>
                      <span className="font-mono font-bold text-gray-900">{activeTruth.root_error_code || 'N/A'} / {activeTruth.root_error_subcode || 'N/A'}</span>
                    </div>
                    <div className="bg-white/80 p-3 rounded-xl border border-rose-100">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Retry Eligible</span>
                      <span className="font-mono font-bold text-gray-900">{activeTruth.retry_eligible ? 'YES' : 'NO'}</span>
                    </div>
                  </div>

                  {/* Plain English Root Cause & Next Action */}
                  <div className="bg-white p-4 rounded-xl border border-rose-100 space-y-2 text-xs">
                    <div>
                      <strong className="text-[10px] font-bold text-gray-500 uppercase block mb-0.5">Plain English Failure Analysis:</strong>
                      <p className="text-gray-800 font-medium">{activeTruth.plain_english_failure || activeTruth.root_error_message || 'Unknown exception encountered.'}</p>
                    </div>
                    <div>
                      <strong className="text-[10px] font-bold text-gray-500 uppercase block mb-0.5">Admin Operator Guidance:</strong>
                      <p className="text-indigo-900 font-semibold">{activeTruth.admin_next_action}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* FINANCIAL SAFETY & ESCROW PANEL */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span>Financial Safety & Escrow Breakdown</span>
                  </h4>

                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Money Safe in Escrow</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Total Charged Host</span>
                    <p className="text-xl font-mono font-extrabold text-gray-900">
                      ₹{((activeTruth?.financial_safety?.total_charged_cents || 0) / 100).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Meta Ad Spend Allocated (85%)</span>
                    <p className="text-xl font-mono font-extrabold text-emerald-600">
                      ₹{((activeTruth?.financial_safety?.ad_spend_allocated_cents || 0) / 100).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Encho Optimization Fee (15%)</span>
                    <p className="text-xl font-mono font-extrabold text-indigo-600">
                      ₹{((activeTruth?.financial_safety?.encho_fee_cents || 0) / 100).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* PERFORMANCE & SOCIAL TELEMETRY PANEL */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-indigo-600" />
                    <span>Performance Telemetry & Social Engagement</span>
                  </h4>

                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-gray-400 font-bold uppercase">Perf Freshness:</span>
                    <span className="px-2 py-0.5 rounded font-bold uppercase bg-slate-100 text-slate-800 border">
                      {activeTruth?.performance_state?.performance_freshness || 'UNKNOWN'}
                    </span>
                  </div>
                </div>

                {/* Ads Insights Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center text-xs">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Impressions</span>
                    <strong className="text-gray-900 font-mono text-sm">{activeTruth?.performance_state?.impressions?.toLocaleString() || 0}</strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Reach</span>
                    <strong className="text-gray-900 font-mono text-sm">{activeTruth?.performance_state?.reach?.toLocaleString() || 0}</strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Clicks</span>
                    <strong className="text-gray-900 font-mono text-sm">{activeTruth?.performance_state?.clicks?.toLocaleString() || 0}</strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Spent</span>
                    <strong className="text-gray-900 font-mono text-sm">₹{activeTruth?.performance_state?.spend?.toFixed(2) || '0.00'}</strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">CTR</span>
                    <strong className="text-gray-900 font-mono text-sm">{(activeTruth?.performance_state?.ctr * 100)?.toFixed(2) || '0.00'}%</strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">CPC</span>
                    <strong className="text-gray-900 font-mono text-sm">₹{activeTruth?.performance_state?.cpc?.toFixed(2) || '0.00'}</strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Conversions</span>
                    <strong className="text-emerald-600 font-mono text-sm">{activeTruth?.performance_state?.conversions?.toLocaleString() || 0}</strong>
                  </div>
                </div>

                {/* Social Engagement Decoupled Lineage */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[10px] text-slate-500 uppercase tracking-wider">Social Engagement Metrics</span>
                    <span className="text-[10px] font-mono text-slate-400">Synced: {activeTruth?.engagement_state?.engagement_synced_at ? new Date(activeTruth.engagement_state.engagement_synced_at).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-center gap-2">
                      <MessageSquare className="w-4 h-4 text-sky-600" />
                      <span className="font-mono font-bold text-gray-900">{activeTruth?.engagement_state?.comments || 0} Comments</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-center gap-2">
                      <ThumbsUp className="w-4 h-4 text-emerald-600" />
                      <span className="font-mono font-bold text-gray-900">{activeTruth?.engagement_state?.reactions || 0} Reactions</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-center gap-2">
                      <Share2 className="w-4 h-4 text-purple-600" />
                      <span className="font-mono font-bold text-gray-900">{activeTruth?.engagement_state?.shares ?? 'N/A'} Shares</span>
                    </div>
                  </div>
                </div>

                {/* DCO CREATIVE VARIANT BREAKDOWN */}
                {activeTruth?.dco_state?.variant_count > 0 && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        <span>DCO Creative Variants ({activeTruth.dco_state.variant_count})</span>
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        Winner: Variant #{activeTruth.dco_state.winner_variant_id || 'Evaluating'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeTruth.dco_state.variants.map((v: any) => (
                        <div key={v.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 flex items-center gap-3 text-xs">
                          {v.media_url ? (
                            <img src={v.media_url} alt="Variant media" className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-200 border border-gray-300 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-500">
                              No Img
                            </div>
                          )}
                          <div className="space-y-0.5 truncate">
                            <span className="font-bold text-gray-900 block truncate">Variant #{v.id}</span>
                            <span className="text-[10px] text-gray-500 font-mono block truncate">Ad ID: {v.meta_ad_id || 'Pending'}</span>
                            <span className="text-[10px] font-mono font-bold text-emerald-600">{v.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* INCIDENT TIMELINE & TRACE DIAGNOSTICS */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    <span>Incident Timeline & Execution Events</span>
                  </h4>

                  <span className="text-xs font-mono text-gray-400">
                    Traces Logged: {activeTruth?.raw_traces_count || 0}
                  </span>
                </div>

                {activeTruth?.incident_timeline?.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {activeTruth.incident_timeline.map((evt: any) => (
                      <div key={evt.id} className="p-3 bg-gray-50 rounded-xl border border-gray-150 flex items-start justify-between gap-3 text-xs font-mono">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-indigo-900">{evt.event_type}</span>
                            <span className="text-[10px] text-gray-500">[{evt.actor_type}]</span>
                          </div>
                          {evt.reason && <p className="text-[11px] text-gray-700 font-sans">{evt.reason}</p>}
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No timeline events recorded yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ACTION EXPLANATION PREVIEW MODAL */}
      {actionPreview && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 space-y-5 text-left max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-4">
              <div className="space-y-1">
                <span className="bg-indigo-100 text-indigo-900 font-mono font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Mandatory Action Explanation Preview
                </span>
                <h3 className="text-lg font-bold text-gray-900">{actionPreview.title}</h3>
                <p className="text-xs text-gray-500">Campaign: <strong>{actionPreview.campaignTitle}</strong> (#{actionPreview.campaignId})</p>
              </div>
              <button
                type="button"
                onClick={() => setActionPreview(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Reject Reason Input (if rejecting) */}
            {actionPreview.type === 'reject' && (
              <div className="space-y-1.5 bg-rose-50 p-4 rounded-2xl border border-rose-200">
                <label className="block text-xs font-bold text-rose-900 uppercase">Rejection Feedback for Host:</label>
                <textarea
                  rows={2}
                  value={rejectionFeedback}
                  onChange={e => setRejectionFeedback(e.target.value)}
                  className="w-full p-2.5 bg-white border border-rose-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            )}

            {/* Current State Grid */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">1. Current Campaign State</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="bg-white p-2 rounded-lg border">
                  <span className="text-[9px] text-gray-400 block uppercase">Governance</span>
                  <span className="font-bold text-gray-900">{actionPreview.currentState.governance}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border">
                  <span className="text-[9px] text-gray-400 block uppercase">Financial</span>
                  <span className="font-bold text-gray-900">{actionPreview.currentState.financial}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border">
                  <span className="text-[9px] text-gray-400 block uppercase">Publishing</span>
                  <span className="font-bold text-gray-900">{actionPreview.currentState.publishing}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border">
                  <span className="text-[9px] text-gray-400 block uppercase">Meta External</span>
                  <span className="font-bold text-gray-900">{actionPreview.currentState.metaExternal}</span>
                </div>
              </div>
            </div>

            {/* What Will Happen */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>2. What Will Happen (State Mutations & API Calls)</span>
              </h4>
              <ul className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1 list-disc list-inside font-medium">
                {actionPreview.whatWillHappen.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            {/* What Will NOT Happen */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-sky-600" />
                <span>3. What Will NOT Happen (Safety Invariants)</span>
              </h4>
              <ul className="bg-sky-50/60 p-3.5 rounded-2xl border border-sky-200 text-xs text-sky-950 space-y-1 list-disc list-inside font-medium">
                {actionPreview.whatWillNotHappen.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            {/* Why Allowed & Expected Result */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-1">
                <strong className="text-[10px] font-bold text-gray-500 uppercase block">4. Why Action is Allowed:</strong>
                <p className="text-gray-800 font-medium">{actionPreview.whyAllowed}</p>
              </div>

              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-1">
                <strong className="text-[10px] font-bold text-gray-500 uppercase block">5. Expected Target State:</strong>
                <p className="text-indigo-900 font-semibold">{actionPreview.expectedResult}</p>
              </div>
            </div>

            {/* Failure & Timeout Behavior */}
            <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 text-xs text-purple-950 space-y-1">
              <strong className="text-[10px] font-bold text-purple-800 uppercase block">6. Failure & Timeout Behavior:</strong>
              <p className="font-medium">{actionPreview.failureUnknownBehavior}</p>
            </div>

            {/* Modal Action Buttons */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActionPreview(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={executingAction}
                onClick={handleExecuteAction}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {executingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-emerald-300" />}
                <span>Confirm & Execute {actionPreview.type.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
