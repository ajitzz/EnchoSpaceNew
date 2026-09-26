import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, Zap, ShieldCheck } from 'lucide-react';

interface TrippedEvent {
  id: string;
  campaignId: number;
  listingId: number;
  triggerReason: string;
  occupancyRatio: number;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
}

interface DeadLetter {
  id: string;
  sourceQueue: string;
  originalEventId: string;
  attempts: number;
  lastError: string;
  failedAt: string;
}

export function AdminCircuitBreakerWorkspace() {
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<{
    activeTrippedCount: number;
    trippedEvents: TrippedEvent[];
    deadLetterCount: number;
    recentDeadLetters: DeadLetter[];
  } | null>(null);
  const [overrideEventId, setOverrideEventId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/marketing/v2/circuit-breaker/status', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (err) {
      console.error('Failed to load circuit breaker status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const runEvaluation = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/marketing/v2/circuit-breaker/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setNotice(`Evaluation complete: ${data.trippedCount} campaign(s) tripped circuit breaker.`);
        fetchStatus();
      }
    } catch (err) {
      setNotice('Manual evaluation failed. Please check network.');
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideEventId || overrideReason.trim().length < 10) return;
    setOverrideBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/marketing/v2/circuit-breaker/override/${overrideEventId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: overrideReason.trim() }),
      });
      if (res.ok) {
        setNotice('Circuit breaker successfully overridden: Campaign resumed.');
        setOverrideEventId(null);
        setOverrideReason('');
        fetchStatus();
      } else {
        const err = await res.json();
        setNotice(`Override failed: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      setNotice('Network error while overriding circuit breaker.');
    } finally {
      setOverrideBusy(false);
    }
  };

  const resolveDlq = async (dlqId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/marketing/v2/circuit-breaker/dlq/${dlqId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ notes: 'Resolved by Admin operator via Control Plane' }),
      });
      if (res.ok) {
        setNotice('Dead letter item marked as resolved.');
        fetchStatus();
      }
    } catch (err) {
      setNotice('Failed to resolve dead letter item.');
    }
  };

  return (
    <section className="mt-8 p-6 bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-800 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Worker Daemon & Smart Auto-Pause Circuit Breaker
            </h3>
            <p className="text-xs text-zinc-500">
              Fly.io/ECS Persistent Daemon (Outbox 1s · Rollups 5s · Occupancy 10s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-neutral-800 hover:bg-zinc-50 dark:hover:bg-neutral-800 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={runEvaluation}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity"
          >
            Run Sweep Now
          </button>
        </div>
      </div>

      {notice && (
        <div className="my-4 p-3 rounded-xl bg-zinc-100 dark:bg-neutral-800 text-xs text-zinc-700 dark:text-zinc-200 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-zinc-400 hover:text-zinc-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Health Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-neutral-950/60 border border-zinc-200/60 dark:border-neutral-800/60">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span>Daemon Health</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active & Polling
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Zero HTTP request load</span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-neutral-950/60 border border-zinc-200/60 dark:border-neutral-800/60">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span>Active Tripped Breakers</span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-white">
            {statusData?.activeTrippedCount || 0}
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">100% full properties paused</span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-neutral-950/60 border border-zinc-200/60 dark:border-neutral-800/60">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span>Dead Letter Queue (DLQ)</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-white">
            {statusData?.deadLetterCount || 0}
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Preserved with full audit evidence</span>
        </div>
      </div>

      {/* Tripped Circuit Breakers Table */}
      <div className="mt-6">
        <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-3">
          Auto-Paused Campaigns (Occupancy & Budget Stop-Loss)
        </h4>

        {(!statusData?.trippedEvents || statusData.trippedEvents.length === 0) ? (
          <div className="py-8 text-center bg-zinc-50/50 dark:bg-neutral-950/40 rounded-xl border border-dashed border-zinc-200 dark:border-neutral-800">
            <ShieldCheck className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-zinc-500 font-medium">All active campaigns running within healthy occupancy & budget thresholds.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-neutral-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-neutral-950/80 text-zinc-500 font-semibold border-b border-zinc-200 dark:border-neutral-800">
                <tr>
                  <th className="p-3">Campaign ID</th>
                  <th className="p-3">Listing</th>
                  <th className="p-3">Trigger Reason</th>
                  <th className="p-3">Occupancy</th>
                  <th className="p-3">Tripped At</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-neutral-800">
                {statusData.trippedEvents.map(ev => (
                  <tr key={ev.id} className="hover:bg-zinc-50/50 dark:hover:bg-neutral-800/40">
                    <td className="p-3 font-mono font-medium text-zinc-900 dark:text-white">#{ev.campaignId}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-300">Listing #{ev.listingId}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                        {ev.triggerReason}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-zinc-700 dark:text-zinc-300">
                      {Math.round(ev.occupancyRatio * 100)}%
                    </td>
                    <td className="p-3 text-zinc-400">
                      {new Date(ev.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setOverrideEventId(ev.id)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      >
                        Override & Resume
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Override Modal */}
      {overrideEventId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-2">
              Confirm Circuit Breaker Override
            </h4>
            <p className="text-xs text-zinc-500 mb-4">
              Overriding this circuit breaker will resume ad spend on Meta/Google even if the listing is marked 100% occupied. State your operational justification:
            </p>
            <textarea
              rows={3}
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="e.g. Host opened additional offline luxury suites for this date flight."
              className="w-full text-xs p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-950 mb-4 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setOverrideEventId(null); setOverrideReason(''); }}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-neutral-800 text-zinc-600 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleOverride}
                disabled={overrideBusy || overrideReason.trim().length < 10}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {overrideBusy ? 'Overriding…' : 'Confirm & Resume Flight'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dead Letter Queue Desk */}
      {statusData?.recentDeadLetters && statusData.recentDeadLetters.length > 0 && (
        <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-neutral-800">
          <h4 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Unresolved Dead Letter Queue Items
          </h4>
          <div className="overflow-x-auto rounded-xl border border-red-200 dark:border-red-950/60 bg-red-50/20 dark:bg-red-950/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-red-50/50 dark:bg-red-950/30 text-red-900 dark:text-red-300 font-semibold border-b border-red-200 dark:border-red-950">
                <tr>
                  <th className="p-3">Source Queue</th>
                  <th className="p-3">Event ID</th>
                  <th className="p-3">Attempts</th>
                  <th className="p-3">Last Error</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-950/40">
                {statusData.recentDeadLetters.map(dlq => (
                  <tr key={dlq.id}>
                    <td className="p-3 font-mono font-medium">{dlq.sourceQueue}</td>
                    <td className="p-3 font-mono text-[11px] text-zinc-500">{dlq.originalEventId}</td>
                    <td className="p-3 font-bold text-red-600">{dlq.attempts}</td>
                    <td className="p-3 text-red-800 dark:text-red-300 font-mono text-[11px] truncate max-w-xs">{dlq.lastError}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => resolveDlq(dlq.id)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
