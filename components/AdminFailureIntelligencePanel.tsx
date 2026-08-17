import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Terminal,
  RotateCcw,
  Clock,
  Info,
  Layers,
  Sparkles
} from 'lucide-react';

interface AdminFailureIntelligencePanelProps {
  failureIntelligence?: {
    is_failed?: boolean;
    root_error_code?: string | number | null;
    root_error_subcode?: string | number | null;
    root_error_classification?: string | null;
    failure_stage?: string | null;
    pipeline_stage?: string | null;
    error_owner?: string | null;
    retry_eligible?: boolean;
    retryable?: boolean;
    safe_host_message?: string | null;
    host_guidance?: string | null;
    admin_guidance?: string | null;
    admin_resolution?: string | null;
    correlation_id?: string | null;
    forensic_details?: any;
  };
  isLoading?: boolean;
}

export const AdminFailureIntelligencePanel: React.FC<AdminFailureIntelligencePanelProps> = ({
  failureIntelligence,
  isLoading = false
}) => {
  const [showRawDetails, setShowRawDetails] = useState<boolean>(false);

  if (isLoading || !failureIntelligence) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  const isFailed = Boolean(
    failureIntelligence.is_failed ||
    failureIntelligence.root_error_code ||
    failureIntelligence.root_error_classification ||
    (failureIntelligence.error_owner && failureIntelligence.error_owner !== 'NONE')
  );

  const code = failureIntelligence.root_error_code || 'N/A';
  const subcode = failureIntelligence.root_error_subcode || 'N/A';
  const stage = failureIntelligence.failure_stage || failureIntelligence.pipeline_stage || 'DISPATCH';
  const owner = failureIntelligence.error_owner || 'NONE';
  const retryable = failureIntelligence.retry_eligible ?? failureIntelligence.retryable ?? false;
  const hostMsg = failureIntelligence.safe_host_message || failureIntelligence.host_guidance || 'No host action required.';
  const adminRes = failureIntelligence.admin_resolution || failureIntelligence.admin_guidance || 'System operating nominally.';
  const correlationId = failureIntelligence.correlation_id || 'N/A';

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-5"
      role="region"
      aria-label="Failure Intelligence & Forensic Diagnostics"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${isFailed ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'}`}>
            {isFailed ? <ShieldAlert className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Failure Intelligence & Root Cause Attribution
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Deterministic error lineage and operational resolution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {retryable ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200">
              <RotateCcw className="w-3.5 h-3.5" />
              Auto-Retry Eligible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              Non-Retryable
            </span>
          )}
        </div>
      </div>

      {/* Primary Diagnostic Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 font-mono text-xs">
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col font-sans">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Error Code / Subcode
          </span>
          <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {code} {subcode !== 'N/A' && `(${subcode})`}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col font-sans">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Pipeline Stage
          </span>
          <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
            {stage}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col font-sans">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Error Domain Owner
          </span>
          <span className={`text-sm font-bold font-mono mt-1 ${owner.includes('HOST') ? 'text-amber-600' : owner.includes('META') ? 'text-rose-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
            {owner}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col font-sans">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Correlation ID
          </span>
          <span className="text-xs font-bold font-mono text-zinc-700 dark:text-zinc-300 mt-1 truncate" title={correlationId}>
            {correlationId}
          </span>
        </div>
      </div>

      {/* Resolution Instructions */}
      <div className="space-y-3">
        <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs space-y-1">
          <span className="font-semibold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-600" /> Admin Operational Resolution:
          </span>
          <p className="text-blue-900 dark:text-blue-300 leading-relaxed font-sans">
            {adminRes}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            Safe Host-Facing Message:
          </span>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans italic">
            "{hostMsg}"
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminFailureIntelligencePanel;
