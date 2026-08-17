import React from 'react';
import {
  Sparkles,
  Trophy,
  Activity,
  Pause,
  Layers,
  TrendingUp,
  Clock,
  Eye,
  MousePointerClick,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Lock
} from 'lucide-react';

interface DcoVariant {
  id?: number | string;
  media_url?: string;
  meta_creative_id?: string | null;
  meta_ad_id?: string | null;
  status?: string;
  is_published?: boolean;
  reach?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  spend?: number | null;
  ctr?: number | null;
  conversions?: number | null;
  dco_status?: string;
  dco_status_label?: string;
}

interface AdminDcoMatrixProps {
  dcoState?: {
    dco_status?: string;
    winner_variant_id?: number | string | null;
    variant_count?: number;
    decision_metric?: string;
    confidence?: number;
    evaluation_epoch?: string;
    relative_advantage?: number;
    decision_reason?: string;
    variants?: DcoVariant[];
  };
  isLoading?: boolean;
}

export const AdminDcoMatrix: React.FC<AdminDcoMatrixProps> = ({
  dcoState,
  isLoading = false
}) => {
  if (isLoading || !dcoState) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-3">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="h-24 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  const {
    dco_status = 'TESTING',
    winner_variant_id,
    decision_metric = 'CTR',
    confidence = 0.95,
    relative_advantage,
    decision_reason,
    variants = []
  } = dcoState;

  const renderBadge = (v: DcoVariant) => {
    const isWinner = winner_variant_id && String(winner_variant_id) === String(v.id);
    if (isWinner) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          WINNER
        </span>
      );
    }
    if (v.status === 'PRUNED' || v.status === 'PAUSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          <Pause className="w-3.5 h-3.5" />
          PAUSED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200">
        <Activity className="w-3.5 h-3.5" />
        TESTING
      </span>
    );
  };

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-5"
      role="region"
      aria-label="Dynamic Creative Optimization (DCO) Matrix"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Dynamic Creative Optimization (DCO) Matrix
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Multi-variant testing, statistical winner identification & allocation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            DCO State: <strong>{dco_status}</strong>
          </span>
        </div>
      </div>

      {/* DCO Safety & Statistical Governance Deck */}
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>DCO Safety & Statistical Verification Baseline</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium">Metric Hierarchy</span>
            <strong className="text-zinc-900 dark:text-zinc-100">{decision_metric || 'CTR'}</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium">Statistical Confidence</span>
            <strong className="text-emerald-700 dark:text-emerald-400">{((confidence || 0.95) * 100).toFixed(0)}% (Z ≥ 1.96)</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium">Financial Envelope</span>
            <strong className="text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-500" /> Unchanged (0% Expansion)
            </strong>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium">Min Sample Threshold</span>
            <strong className="text-zinc-900 dark:text-zinc-100">500 Impr / 25 Clicks</strong>
          </div>
        </div>

        {decision_reason && (
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 italic pt-1 border-t border-zinc-200/60 dark:border-zinc-800">
            Decision: {decision_reason}
          </p>
        )}
      </div>

      {variants.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-400 italic">
          Single creative configuration. No DCO variants detected.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {variants.map((v, idx) => (
            <div
              key={v.id || idx}
              className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {v.media_url ? (
                    <img
                      src={v.media_url}
                      alt="Creative Thumbnail"
                      className="w-14 h-14 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-400">
                      <Layers className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <strong className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                      Variant #{idx + 1} (ID: {v.id})
                    </strong>
                    <span className="text-[10px] font-mono text-zinc-400 block truncate max-w-xs">
                      Meta Ad: {v.meta_ad_id || 'Pending'}
                    </span>
                  </div>
                </div>
                {renderBadge(v)}
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-400 block">Impressions</span>
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {v.impressions !== null && v.impressions !== undefined ? v.impressions.toLocaleString() : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block">Clicks</span>
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {v.clicks !== null && v.clicks !== undefined ? v.clicks.toLocaleString() : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block">CTR</span>
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {v.ctr !== null && v.ctr !== undefined ? `${v.ctr.toFixed(2)}%` : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block">Spend</span>
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    ${v.spend !== null && v.spend !== undefined ? Number(v.spend).toFixed(2) : '0.00'}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDcoMatrix;
