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
  Search,
  Lock,
  Info,
  Clock,
  Coins,
  Sparkles,
  Zap,
  DollarSign,
  TrendingUp,
  FolderTree,
  Terminal,
  Trophy,
  ArrowLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { AdminDeliveryTruthPanel } from './AdminDeliveryTruthPanel';
import { AdminMetaHierarchyTree } from './AdminMetaHierarchyTree';
import { AdminFailureIntelligencePanel } from './AdminFailureIntelligencePanel';
import { AdminFinancialControlPanel } from './AdminFinancialControlPanel';
import { AdminActionControlPanel } from './AdminActionControlPanel';
import { AdminCampaignTimeline } from './AdminCampaignTimeline';
import { AdminMetaTraceViewer } from './AdminMetaTraceViewer';
import { AdminDcoMatrix } from './AdminDcoMatrix';

interface AdminMetaCampaignCommandCenterProps {
  onBack?: () => void;
}

export const AdminMetaCampaignCommandCenter: React.FC<AdminMetaCampaignCommandCenterProps> = ({
  onBack
}) => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [truthMap, setTruthMap] = useState<Record<number, any>>({});
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingTruth, setLoadingTruth] = useState<boolean>(false);
  const [filter, setFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const token = localStorage.getItem('token') || '';

  const fetchCampaigns = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/marketing/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = res.headers.get('content-type')?.includes('json')
          ? await res.json()
          : [];
        setCampaigns(data);
        if (data.length > 0 && !selectedCampaignId) {
          setSelectedCampaignId(data[0].id);
        }
      } else {
        setError(`Failed to fetch campaigns (HTTP ${res.status})`);
      }
    } catch (err: any) {
      console.error('Error fetching admin campaigns:', err);
      setError(err.message || 'Network error fetching campaigns.');
    } finally {
      setLoadingList(false);
    }
  };

  const fetchCampaignTruth = async (id: number, showSpinner = true) => {
    if (showSpinner) setLoadingTruth(true);
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${id}/control-center`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = res.headers.get('content-type')?.includes('json')
          ? await res.json()
          : null;
        if (data) {
          setTruthMap(prev => ({ ...prev, [id]: data }));
        }
      }
    } catch (err) {
      console.error(`Error fetching truth for campaign ${id}:`, err);
    } finally {
      if (showSpinner) setLoadingTruth(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignTruth(selectedCampaignId, true);

      // Automated Polling: refresh every 20 seconds
      pollingRef.current = setInterval(() => {
        fetchCampaignTruth(selectedCampaignId, false);
      }, 20000);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedCampaignId]);

  const handleManualResync = async () => {
    if (!selectedCampaignId) return;
    setIsRefreshing(true);
    await fetchCampaignTruth(selectedCampaignId, false);
  };

  // Compute Canonical Counts Across Loaded Truths
  const canonicalStats = campaigns.reduce(
    (acc, camp) => {
      acc.total++;
      const truth = truthMap[camp.id];
      const op = truth?.operational_status || 'UNKNOWN';

      if (op === 'LIVE') acc.live++;
      else if (op === 'PAUSED' || op === 'ADSET_OFF') acc.paused++;
      else if (op === 'PENDING_REVIEW' || camp.governance_status === 'PENDING_ADMIN_REVIEW') acc.reviewing++;
      else if (op === 'DISPATCHING') acc.dispatching++;
      else if (op === 'FAILED' || op === 'DISAPPROVED') acc.failed++;
      else if (op === 'RECONCILIATION_REQUIRED') acc.reconciliation++;
      else if (truth?.financial?.is_financial_blocked) acc.financially_blocked++;
      else acc.unknown++;

      return acc;
    },
    { total: 0, live: 0, paused: 0, reviewing: 0, dispatching: 0, failed: 0, reconciliation: 0, financially_blocked: 0, unknown: 0 }
  );

  const filteredCampaigns = campaigns.filter(c => {
    const truth = truthMap[c.id];
    const op = truth?.operational_status || 'UNKNOWN';
    const matchesSearch = c.title?.toLowerCase().includes(searchQuery.toLowerCase()) || String(c.id).includes(searchQuery);

    if (!matchesSearch) return false;
    if (filter === 'ALL') return true;
    if (filter === 'LIVE') return op === 'LIVE';
    if (filter === 'PAUSED') return op === 'PAUSED' || op === 'ADSET_OFF';
    if (filter === 'REVIEWING') return op === 'PENDING_REVIEW' || c.governance_status === 'PENDING_ADMIN_REVIEW';
    if (filter === 'DISPATCHING') return op === 'DISPATCHING';
    if (filter === 'FAILED') return op === 'FAILED' || op === 'DISAPPROVED';
    if (filter === 'RECONCILIATION_REQUIRED') return op === 'RECONCILIATION_REQUIRED';
    if (filter === 'FINANCIAL_BLOCKED') return Boolean(truth?.financial?.is_financial_blocked);
    return true;
  });

  const activeTruth = selectedCampaignId ? truthMap[selectedCampaignId] : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Admin Ops Command Center
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Meta Campaign Operations & Hierarchy
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleManualResync}
            disabled={isRefreshing}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-500' : ''}`} />
            {isRefreshing ? 'Syncing...' : 'Resync Engine'}
          </button>
        </div>
      </div>

      {/* Canonical Stats Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-zinc-400">Total</span>
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{canonicalStats.total}</span>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400">Live</span>
          <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{canonicalStats.live}</span>
        </div>
        <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400">Reviewing</span>
          <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{canonicalStats.reviewing}</span>
        </div>
        <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-blue-600 dark:text-blue-400">Dispatching</span>
          <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{canonicalStats.dispatching}</span>
        </div>
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-zinc-500">Paused</span>
          <span className="text-lg font-bold text-zinc-700 dark:text-zinc-300">{canonicalStats.paused}</span>
        </div>
        <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-rose-600 dark:text-rose-400">Failed</span>
          <span className="text-lg font-bold text-rose-700 dark:text-rose-300">{canonicalStats.failed}</span>
        </div>
        <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400">Reconcile</span>
          <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{canonicalStats.reconciliation}</span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Campaign List & Filters (4 Cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3">
          {/* Search & Filter Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search campaign by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
              {['ALL', 'LIVE', 'REVIEWING', 'DISPATCHING', 'PAUSED', 'FAILED', 'RECONCILIATION_REQUIRED'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${filter === f ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'}`}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredCampaigns.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 italic">
                No campaigns match selected filter.
              </div>
            ) : (
              filteredCampaigns.map(c => {
                const isSelected = selectedCampaignId === c.id;
                const truth = truthMap[c.id];
                const op = truth?.operational_status || 'UNKNOWN';

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={`w-full p-3 rounded-xl text-left border transition-all space-y-1.5 ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50/30 dark:bg-purple-950/20 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs text-zinc-900 dark:text-zinc-100 truncate">
                        {c.title || `Campaign #${c.id}`}
                      </strong>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        #{c.id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Status: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{op}</strong></span>
                      <span>Budget: <strong>${c.budget}</strong></span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Campaign Command Deck (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedCampaignId ? (
            <div className="p-12 text-center text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              Select a campaign to inspect command hierarchy and ground truth.
            </div>
          ) : (
            <>
              {/* Action Controls Bar */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2.5">
                  Authorized Admin Actions
                </span>
                <AdminActionControlPanel
                  campaignId={selectedCampaignId}
                  allowedActions={activeTruth?.allowed_actions}
                  actionPreviews={activeTruth?.action_previews}
                  onActionComplete={() => fetchCampaignTruth(selectedCampaignId, false)}
                />
              </div>

              {/* 1. Delivery Truth Panel */}
              <AdminDeliveryTruthPanel
                deliveryTruth={activeTruth?.delivery_truth}
                isLoading={loadingTruth}
              />

              {/* 2. Meta Object Hierarchy Tree */}
              <AdminMetaHierarchyTree
                hierarchy={activeTruth?.object_hierarchy}
                isLoading={loadingTruth}
              />

              {/* 3. Financial Control & Ledger */}
              <AdminFinancialControlPanel
                financial={activeTruth?.financial}
                isLoading={loadingTruth}
              />

              {/* 4. Failure Intelligence & Forensics */}
              <AdminFailureIntelligencePanel
                failureIntelligence={activeTruth?.failure_intelligence}
                isLoading={loadingTruth}
              />

              {/* 5. DCO Matrix */}
              <AdminDcoMatrix
                dcoState={activeTruth?.dco_state}
                isLoading={loadingTruth}
              />

              {/* 6. Timeline & API Traces Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AdminCampaignTimeline
                  timeline={activeTruth?.audit_history}
                  isLoading={loadingTruth}
                />
                <AdminMetaTraceViewer
                  traces={activeTruth?.traces}
                  isLoading={loadingTruth}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMetaCampaignCommandCenter;
