import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pause,
  Play,
  Clock,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';

interface HostMetaDeliveryStatusCardProps {
  operationalStatus: string;
  operationalStatusInfo?: {
    display_label: string;
    display_description: string;
    badge_color: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' | 'purple';
    operational_reason?: string | null;
    operational_owner?: string | null;
    recommended_action?: string | null;
    last_verified_at?: string | null;
  };
  delivery?: {
    configured_status?: string;
    effective_status?: string;
    delivery_reason?: string;
    is_delivering?: boolean;
    serving_status?: string;
  };
  freshness?: {
    external_freshness?: string;
    external_status_verified_at?: string | null;
  };
  metaLink?: {
    url: string;
    meta_campaign_id?: string;
  } | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const HostMetaDeliveryStatusCard: React.FC<HostMetaDeliveryStatusCardProps> = ({
  operationalStatus,
  operationalStatusInfo,
  delivery,
  freshness,
  metaLink,
  onRefresh,
  isRefreshing = false
}) => {
  const getBadgeStyle = (color?: string) => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'blue':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'rose':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'purple':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case 'slate':
      default:
        return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'LIVE':
        return <Activity className="w-5 h-5 text-emerald-500 animate-pulse" aria-hidden="true" />;
      case 'PAUSED':
      case 'ADSET_OFF':
      case 'CREATED_NOT_SERVING':
        return <Pause className="w-5 h-5 text-amber-500" aria-hidden="true" />;
      case 'PENDING_REVIEW':
      case 'UNDER_REVIEW':
      case 'DISPATCHING':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" aria-hidden="true" />;
      case 'DISAPPROVED':
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-rose-500" aria-hidden="true" />;
      default:
        return <Info className="w-5 h-5 text-zinc-400" aria-hidden="true" />;
    }
  };

  const getFreshnessBadge = (freshnessType?: string) => {
    const type = (freshnessType || 'UNKNOWN').toUpperCase();
    if (type === 'FRESH') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Fresh Truth
        </span>
      );
    }
    if (type === 'STALE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          Sync Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
        External Check
      </span>
    );
  };

  const formatVerifiedTime = (dateStr?: string | null) => {
    if (!dateStr) return 'Awaiting initial Meta verification';
    try {
      const date = new Date(dateStr);
      const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
      if (diffSeconds < 60) return `${diffSeconds}s ago`;
      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const label = operationalStatusInfo?.display_label || operationalStatus || 'State Unconfirmed';
  const description = operationalStatusInfo?.display_description || 'Authoritative delivery verification directly from Meta.';
  const badgeColor = operationalStatusInfo?.badge_color || 'slate';
  const verifiedAt = freshness?.external_status_verified_at || operationalStatusInfo?.last_verified_at;

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Live Meta Delivery Status"
    >
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            <Layers className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Meta Delivery Truth
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Direct verification from Meta Graph API
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getFreshnessBadge(freshness?.external_freshness)}
        </div>
      </div>

      {/* Primary Delivery Status Hero */}
      <div className="py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 shadow-xs mt-0.5">
            {getStatusIcon(operationalStatus)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${getBadgeStyle(
                  badgeColor
                )}`}
              >
                {label}
              </span>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-2 leading-relaxed max-w-xl">
              {description}
            </p>
          </div>
        </div>

        {/* Verification Timestamp & Source */}
        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center pt-3 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
            <span>Verified: <strong className="text-zinc-700 dark:text-zinc-200">{formatVerifiedTime(verifiedAt)}</strong></span>
          </div>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            Meta Graph API v20.0
          </span>
        </div>
      </div>

      {/* Non-serving or Pause Reason Context */}
      {operationalStatusInfo?.operational_reason && operationalStatus !== 'LIVE' && (
        <div className="mt-2 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold block text-amber-950 dark:text-amber-100">Delivery Notice:</span>
            <span className="opacity-90">{operationalStatusInfo.operational_reason}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostMetaDeliveryStatusCard;
