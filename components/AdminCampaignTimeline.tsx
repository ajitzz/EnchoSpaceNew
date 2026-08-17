import React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Activity,
  Layers,
  Info
} from 'lucide-react';

interface TimelineEvent {
  id?: number | string;
  timestamp?: string;
  event_type?: string;
  from_state?: string | null;
  to_state?: string | null;
  actor_type?: string;
  reason?: string | null;
  correlation_id?: string | null;
}

interface AdminCampaignTimelineProps {
  timeline?: TimelineEvent[];
  isLoading?: boolean;
}

export const AdminCampaignTimeline: React.FC<AdminCampaignTimelineProps> = ({
  timeline = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-3">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'N/A';
    try {
      const d = new Date(ts);
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-4"
      role="region"
      aria-label="Forensic State Timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Forensic Incident & Transition Timeline
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Chronological immutable event ledger
            </p>
          </div>
        </div>
        <span className="text-xs text-zinc-400">
          {timeline.length} Total Events
        </span>
      </div>

      {timeline.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-400 italic">
          No state transition events recorded yet.
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1 text-xs">
          {timeline.map((evt, idx) => (
            <div
              key={evt.id || idx}
              className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                    {evt.event_type || 'TRANSITION'}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300 font-sans">
                    {evt.from_state || 'INITIAL'} → <strong className="text-zinc-900 dark:text-zinc-100">{evt.to_state || 'UNKNOWN'}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">
                  {formatTimestamp(evt.timestamp)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 gap-2 font-sans">
                <span>Actor: <strong className="text-zinc-700 dark:text-zinc-300">{evt.actor_type || 'system'}</strong></span>
                {evt.correlation_id && (
                  <span className="font-mono text-[10px] text-zinc-400 truncate max-w-xs" title={evt.correlation_id}>
                    CID: {evt.correlation_id}
                  </span>
                )}
              </div>
              {evt.reason && (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 italic">
                  Reason: {evt.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCampaignTimeline;
