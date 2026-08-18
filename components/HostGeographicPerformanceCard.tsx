import React from 'react';
import {
  MapPin,
  Eye,
  MousePointerClick,
  Sparkles,
  Users,
  Compass,
  CheckCircle2,
  Clock,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';

export interface GeographicLocationData {
  location: string;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  delivery_status: 'ACTIVE_SERVING' | 'ACTIVE_IN_AUCTION' | 'PAUSED';
  share_percentage: number;
}

interface HostGeographicPerformanceCardProps {
  geographicBreakdown?: GeographicLocationData[];
  currency?: string;
  isLoading?: boolean;
}

export const HostGeographicPerformanceCard: React.FC<HostGeographicPerformanceCardProps> = ({
  geographicBreakdown = [],
  currency = 'USD',
  isLoading = false
}) => {
  const hasLocations = geographicBreakdown.length > 0;
  const hasImpressions = geographicBreakdown.some(g => g.impressions > 0);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Geographic Performance Breakdown"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Geographic Ad Delivery & Reach
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                100% Genuine
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Real-time regional distribution across target buyer locations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Direct Network Sync</span>
        </div>
      </div>

      {/* Notice for newly launched campaigns */}
      {!hasImpressions && (
        <div className="mt-4 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-300">
            <p className="font-semibold">Target Locations Active in Ad Auction</p>
            <p className="mt-0.5 text-blue-700/80 dark:text-blue-400/80">
              Your campaign is actively targeting the high-intent metropolitan hubs listed below. As soon as Meta/Google auctions begin serving your ad, genuine regional view and click telemetry will stream here in real time.
            </p>
          </div>
        </div>
      )}

      {/* Locations List */}
      <div className="mt-4 space-y-3">
        {!hasLocations ? (
          <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No geographic target locations configured.
          </div>
        ) : (
          geographicBreakdown.map((loc, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/80 transition-all hover:border-zinc-200 dark:hover:border-zinc-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {loc.location}
                    </span>
                    <span className="ml-2 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      {loc.share_percentage}% Target Weight
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {loc.delivery_status === 'ACTIVE_SERVING' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Serving
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      In Auction
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Distribution Bar */}
              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700/50 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, loc.share_percentage)}%` }}
                />
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/50">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Eye className="w-3 h-3 text-zinc-400" />
                    Impressions
                  </span>
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                    {loc.impressions.toLocaleString()}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/50">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <MousePointerClick className="w-3 h-3 text-zinc-400" />
                    Link Clicks
                  </span>
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                    {loc.clicks.toLocaleString()}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/50">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-500" />
                    Click-Through
                  </span>
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                    {loc.ctr > 0 ? `${loc.ctr.toFixed(2)}%` : '0.00%'}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-100 dark:border-zinc-700/50">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Users className="w-3 h-3 text-emerald-500" />
                    Direct Leads
                  </span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                    {loc.leads.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HostGeographicPerformanceCard;
