import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  Info,
  Pause
} from 'lucide-react';

interface AdminDeliveryTruthPanelProps {
  deliveryTruth?: {
    operational_status?: string;
    operational_status_info?: {
      display_label: string;
      display_description: string;
      badge_color: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'purple';
      operational_reason?: string | null;
      operational_owner?: string | null;
      recommended_action?: string | null;
      last_verified_at?: string | null;
    };
    configured_status?: string;
    effective_status?: string;
    review_status?: string;
    delivery_reason?: string;
    freshness?: string;
    verified_at?: string | null;
  };
  isLoading?: boolean;
}

export const AdminDeliveryTruthPanel: React.FC<AdminDeliveryTruthPanelProps> = ({
  deliveryTruth,
  isLoading = false
}) => {
  if (isLoading || !deliveryTruth) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  const op = deliveryTruth.operational_status || 'UNKNOWN';
  const info = deliveryTruth.operational_status_info;
  const configured = deliveryTruth.configured_status || 'UNKNOWN';
  const effective = deliveryTruth.effective_status || 'UNKNOWN';
  const review = deliveryTruth.review_status || 'UNKNOWN';
  const reason = deliveryTruth.delivery_reason || info?.operational_reason || info?.display_description;
  const freshness = deliveryTruth.freshness || 'UNKNOWN';
  const verified = deliveryTruth.verified_at || info?.last_verified_at;

  const getBadgeStyle = (color?: string) => {
    switch (color) {
      case 'emerald': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'amber': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'blue': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'rose': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'purple': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case 'slate':
      default: return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-5"
      role="region"
      aria-label="Admin Live Delivery Truth"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Meta Delivery & Ground Truth
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Direct verification from Meta Graph API telemetry reducer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            Freshness: <strong>{freshness}</strong>
          </span>
        </div>
      </div>

      {/* Main Status Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Canonical Status
          </span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border mt-1.5 w-fit ${getBadgeStyle(info?.badge_color)}`}>
            {info?.display_label || op}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Configured Status
          </span>
          <span className="text-sm font-bold font-mono text-zinc-800 dark:text-zinc-200 mt-1">
            {configured}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Effective Status
          </span>
          <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
            {effective}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Review Status
          </span>
          <span className="text-sm font-bold font-mono text-zinc-800 dark:text-zinc-200 mt-1">
            {review}
          </span>
        </div>
      </div>

      {/* Delivery Explanation & Context */}
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-xs space-y-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Responsible Owner: <strong className="text-zinc-800 dark:text-zinc-200">{info?.operational_owner || 'ENCHO System'}</strong></span>
          <span>Last Verified: <strong className="text-zinc-800 dark:text-zinc-200">{verified || 'Pending'}</strong></span>
        </div>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {reason}
        </p>
      </div>
    </div>
  );
};

export default AdminDeliveryTruthPanel;
