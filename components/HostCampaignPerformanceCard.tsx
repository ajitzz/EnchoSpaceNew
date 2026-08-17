import React from 'react';
import {
  TrendingUp,
  Eye,
  MousePointerClick,
  DollarSign,
  Target,
  Users,
  BarChart2,
  Clock,
  Info,
  Sparkles
} from 'lucide-react';

interface HostCampaignPerformanceCardProps {
  performanceState?: {
    has_performance_data: boolean;
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm?: number | null;
    spend: number | null;
    conversions: number | null;
    leads?: number | null;
    performance_freshness?: string;
    performance_last_updated?: string | null;
    message?: string | null;
  };
  currency?: string;
  isLoading?: boolean;
}

export const HostCampaignPerformanceCard: React.FC<HostCampaignPerformanceCardProps> = ({
  performanceState,
  currency = 'USD',
  isLoading = false
}) => {
  const hasData = Boolean(performanceState?.has_performance_data);

  const formatMetric = (
    val: number | null | undefined,
    formatter: (n: number) => string = (n) => n.toLocaleString()
  ) => {
    if (val === null || val === undefined) {
      return <span className="text-zinc-400 dark:text-zinc-500 font-normal text-xs uppercase tracking-wider">No Data</span>;
    }
    return formatter(val);
  };

  const getCurrencySymbol = (curr: string) => {
    switch (curr?.toUpperCase()) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const symbol = getCurrencySymbol(currency);

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return 'Awaiting initial telemetry poll';
    try {
      const date = new Date(dateStr);
      return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative"
      role="region"
      aria-label="Campaign Performance Metrics"
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Verified Ad Performance
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Aggregated directly from Meta Insights rollups
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{formatTimestamp(performanceState?.performance_last_updated)}</span>
        </div>
      </div>

      {/* Metrics Grid */}
      {!hasData ? (
        <div className="py-10 text-center flex flex-col items-center justify-center">
          <div className="p-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mb-3">
            <BarChart2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            No Performance Telemetry Yet
          </h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-1">
            {performanceState?.message || 'Live impressions, clicks, and leads will populate once Meta begins active ad delivery.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 pt-5">
          {/* Impressions */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              Impressions
            </span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatMetric(performanceState?.impressions)}
            </span>
          </div>

          {/* Reach */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              Unique Reach
            </span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatMetric(performanceState?.reach)}
            </span>
          </div>

          {/* Clicks */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              Link Clicks
            </span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatMetric(performanceState?.clicks)}
            </span>
          </div>

          {/* CTR */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              Click-Through Rate
            </span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatMetric(performanceState?.ctr, (n) => `${n.toFixed(2)}%`)}
            </span>
          </div>

          {/* CPC */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              Avg. Cost Per Click
            </span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatMetric(performanceState?.cpc, (n) => `${symbol}${n.toFixed(2)}`)}
            </span>
          </div>

          {/* Total Spend */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
              Actual Ad Spend
            </span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatMetric(performanceState?.spend, (n) => `${symbol}${n.toFixed(2)}`)}
            </span>
          </div>

          {/* Inquiries / Conversions */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />
              Direct Leads
            </span>
            <span className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-1">
              {formatMetric(performanceState?.conversions || performanceState?.leads)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostCampaignPerformanceCard;
