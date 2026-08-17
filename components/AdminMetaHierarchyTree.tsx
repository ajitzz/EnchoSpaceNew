import React from 'react';
import {
  Layers,
  FolderTree,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Clock,
  Zap,
  Image as ImageIcon
} from 'lucide-react';

interface HierarchyNodeProps {
  type?: 'CAMPAIGN' | 'ADSET' | 'AD' | 'CREATIVE';
  object_type?: 'CAMPAIGN' | 'ADSET' | 'AD' | 'CREATIVE';
  id?: string | null;
  name?: string;
  status?: string;
  effectiveStatus?: string;
  effective_status?: string;
  reviewStatus?: string;
  review_status?: string;
  parentId?: string | null;
  parent_id?: string | null;
  accountId?: string | null;
  account_id?: string | null;
  creative_id?: string | null;
  creativeId?: string | null;
  verifiedAt?: string | null;
  verified_at?: string | null;
  freshness?: string;
  flags?: string[];
  mediaUrl?: string | null;
  media_url?: string | null;
}

interface AdminMetaHierarchyTreeProps {
  hierarchy?: {
    campaign?: HierarchyNodeProps;
    adset?: HierarchyNodeProps;
    ads?: HierarchyNodeProps[];
    creatives?: HierarchyNodeProps[];
    hierarchy_integrity?: {
      is_valid: boolean;
      integrity_status: string;
      failure_reasons: string[];
      orphan_count: number;
      mismatch_count: number;
    };
  };
  isLoading?: boolean;
}

export const AdminMetaHierarchyTree: React.FC<AdminMetaHierarchyTreeProps> = ({
  hierarchy,
  isLoading = false
}) => {
  if (isLoading || !hierarchy) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
        <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="h-32 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  const { campaign, adset, ads = [], creatives = [], hierarchy_integrity } = hierarchy;
  const isValid = hierarchy_integrity?.is_valid ?? true;

  const renderFlagBadge = (flag: string) => {
    switch (flag.toUpperCase()) {
      case 'ORPHAN':
      case 'PARENT_MISMATCH':
      case 'FOREIGN_ACCOUNT':
      case 'MISSING':
        return (
          <span key={flag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            {flag}
          </span>
        );
      case 'DISAPPROVED':
        return (
          <span key={flag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-500" />
            DISAPPROVED
          </span>
        );
      case 'STALE':
      case 'UNKNOWN':
        return (
          <span key={flag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200">
            {flag}
          </span>
        );
      default:
        return (
          <span key={flag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200">
            {flag}
          </span>
        );
    }
  };

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-6"
      role="region"
      aria-label="Meta Object Hierarchy Tree"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <FolderTree className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Meta Object Hierarchy & Integrity Tree
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Canonical object linkage: Campaign → AdSet → Ad → Creative
            </p>
          </div>
        </div>

        {/* Integrity Status Badge */}
        <div>
          {isValid ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Hierarchy Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              HIERARCHY INTEGRITY FAILURE
            </span>
          )}
        </div>
      </div>

      {/* Hierarchy Failure Notice */}
      {!isValid && hierarchy_integrity?.failure_reasons && hierarchy_integrity.failure_reasons.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-200 space-y-1.5">
          <div className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            Integrity Violations Detected ({hierarchy_integrity.failure_reasons.length}):
          </div>
          <ul className="list-disc pl-5 space-y-1 opacity-90 font-mono text-[11px]">
            {hierarchy_integrity.failure_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Visual Tree Structure */}
      <div className="space-y-4 font-mono text-xs">
        {/* Node 1: Campaign */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold">
                CAMPAIGN
              </span>
              <strong className="text-zinc-900 dark:text-zinc-100">
                {campaign?.id || <span className="text-rose-500">[MISSING_CAMPAIGN_ID]</span>}
              </strong>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {campaign?.flags?.map(renderFlagBadge)}
              <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                Status: {campaign?.status || 'UNKNOWN'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                Eff: {campaign?.effectiveStatus || 'UNKNOWN'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 font-sans flex flex-wrap gap-4">
            <span>Account: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{campaign?.accountId || 'N/A'}</strong></span>
            <span>Review: <strong className="text-zinc-700 dark:text-zinc-300">{campaign?.reviewStatus || 'N/A'}</strong></span>
            <span>Verified: <strong className="text-zinc-700 dark:text-zinc-300">{campaign?.verifiedAt || 'Pending'}</strong></span>
          </div>

          {/* Node 2: AdSet (Nested) */}
          <div className="ml-4 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700 mt-3 space-y-3">
            <div className="p-3.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                    ADSET
                  </span>
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {adset?.id || <span className="text-rose-500">[MISSING_ADSET_ID]</span>}
                  </strong>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {adset?.flags?.map(renderFlagBadge)}
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    Status: {adset?.status || 'UNKNOWN'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                    Eff: {adset?.effectiveStatus || 'UNKNOWN'}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 font-sans flex flex-wrap gap-4">
                <span>Parent ID: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{adset?.parentId || 'N/A'}</strong></span>
                <span>Account: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{adset?.accountId || 'N/A'}</strong></span>
              </div>

              {/* Node 3: Ads (Nested under AdSet) */}
              <div className="ml-4 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800/60 space-y-2 mt-3">
                {ads.length === 0 ? (
                  <div className="p-2 text-xs text-zinc-400 font-sans italic">
                    No active Meta Ads attached to this AdSet.
                  </div>
                ) : (
                  ads.map((ad, idx) => (
                    <div key={idx} className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            AD #{idx + 1}
                          </span>
                          <strong className="text-zinc-900 dark:text-zinc-100">
                            {ad.id || '[PENDING_AD_ID]'}
                          </strong>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ad.flags?.map(renderFlagBadge)}
                          <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            {ad.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-sans flex flex-wrap gap-3">
                        <span>Creative ID: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{ad.creative_id || 'N/A'}</strong></span>
                        <span>Parent AdSet: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{ad.parentId || 'N/A'}</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMetaHierarchyTree;
