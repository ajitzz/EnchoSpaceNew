import React from 'react';
import {
  Smartphone,
  Layers,
  Sparkles,
  ShieldCheck,
  Video,
  Monitor,
  Eye,
  MousePointerClick
} from 'lucide-react';

export interface PlacementData {
  platform: string;
  share_percentage: number;
  impressions: number;
  clicks: number;
  format: string;
}

export interface DeviceData {
  device_name: string;
  device_key: string;
  share_percentage: number;
  impressions: number;
  clicks: number;
  ctr: number;
  status: string;
}

interface HostPlacementsAndDevicesCardProps {
  placementBreakdown?: PlacementData[];
  deviceBreakdown?: DeviceData[];
  isLoading?: boolean;
}

export const HostPlacementsAndDevicesCard: React.FC<HostPlacementsAndDevicesCardProps> = ({
  placementBreakdown = [],
  deviceBreakdown = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="h-4 w-44 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-28 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
          <div className="h-28 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Placements and Device Telemetry"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Placements & Device Distribution
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                Multi-Channel
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Instagram Reels, Feeds, and iOS vs. Android traveler device split
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Meta Advantage+ Placements</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
        {/* Column 1: Placements */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-pink-500" />
            Ad Network Placements
          </h4>

          {placementBreakdown.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/80"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {item.platform}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                  {item.format} · {item.share_percentage}%
                </span>
              </div>

              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700/50 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${item.share_percentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                <span>{item.impressions.toLocaleString()} views</span>
                <span>{item.clicks.toLocaleString()} clicks</span>
              </div>
            </div>
          ))}
        </div>

        {/* Column 2: Devices */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-blue-500" />
            Visitor Device Operating Systems
          </h4>

          {deviceBreakdown.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/80"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {item.device_name}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                  {item.share_percentage}% of traffic
                </span>
              </div>

              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700/50 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${item.share_percentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                <span>{item.impressions.toLocaleString()} impressions</span>
                <span>CTR: {item.ctr > 0 ? `${item.ctr.toFixed(2)}%` : '0.00%'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HostPlacementsAndDevicesCard;
