import React, { useState } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Search
} from 'lucide-react';

interface MetaTrace {
  id?: number | string;
  endpoint?: string;
  method?: string;
  status?: string;
  response_code?: number | null;
  meta_error_type?: string | null;
  meta_error_message?: string | null;
  fbtrace_id?: string | null;
  duration_ms?: number | null;
  timestamp?: string;
  request_payload?: any;
  response_payload?: any;
}

interface AdminMetaTraceViewerProps {
  traces?: MetaTrace[];
  isLoading?: boolean;
}

export const AdminMetaTraceViewer: React.FC<AdminMetaTraceViewerProps> = ({
  traces = [],
  isLoading = false
}) => {
  const [expandedTraceId, setExpandedTraceId] = useState<number | string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-3">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  const formatPayload = (val: any) => {
    if (!val) return 'None';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return String(val);
      }
    }
    return String(val);
  };

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-4"
      role="region"
      aria-label="Meta API Trace Log Viewer"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Meta Graph API Forensic Traces
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Sanitized outbound API calls with masked tokens & credentials
            </p>
          </div>
        </div>
        <span className="text-xs text-zinc-400">
          {traces.length} Captured Traces
        </span>
      </div>

      {traces.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-400 italic">
          No external Meta API traces recorded for this campaign.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1 text-xs">
          {traces.map((trace, idx) => {
            const traceKey = trace.id || idx;
            const isExpanded = expandedTraceId === traceKey;
            const isSuccess = trace.status === 'SUCCESS' || (trace.response_code && trace.response_code < 400);

            return (
              <div
                key={traceKey}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedTraceId(isExpanded ? null : traceKey)}
                  className="w-full p-3.5 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="flex items-center gap-2.5 font-mono">
                    <span className={`p-1 rounded ${isSuccess ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}`}>
                      {isSuccess ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    </span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{trace.method || 'POST'}</span>
                    <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-xs md:max-w-md">{trace.endpoint}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-zinc-500 text-[11px]">
                      {trace.response_code ? `HTTP ${trace.response_code}` : 'No Status'}
                    </span>
                    {trace.duration_ms !== null && trace.duration_ms !== undefined && (
                      <span className="text-zinc-400 text-[10px]">{trace.duration_ms}ms</span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3 font-mono text-[11px] bg-white dark:bg-zinc-900">
                    <div className="flex flex-wrap gap-4 text-zinc-500 font-sans text-xs">
                      <span>fbtrace_id: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{trace.fbtrace_id || 'N/A'}</strong></span>
                      <span>Timestamp: <strong className="text-zinc-700 dark:text-zinc-300">{trace.timestamp || 'N/A'}</strong></span>
                    </div>

                    {trace.meta_error_message && (
                      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200">
                        <strong>Meta Error:</strong> {trace.meta_error_message}
                      </div>
                    )}

                    {trace.request_payload && (
                      <div className="space-y-1">
                        <span className="font-bold text-zinc-600 dark:text-zinc-400 font-sans text-xs">Request Payload (Sanitized):</span>
                        <pre className="p-2.5 rounded-lg bg-zinc-950 text-zinc-200 overflow-x-auto text-[10px]">
                          {formatPayload(trace.request_payload)}
                        </pre>
                      </div>
                    )}

                    {trace.response_payload && (
                      <div className="space-y-1">
                        <span className="font-bold text-zinc-600 dark:text-zinc-400 font-sans text-xs">Response Payload (Sanitized):</span>
                        <pre className="p-2.5 rounded-lg bg-zinc-950 text-zinc-200 overflow-x-auto text-[10px]">
                          {formatPayload(trace.response_payload)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminMetaTraceViewer;
