import React from 'react';
import {
  Coins,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lock,
  DollarSign,
  TrendingUp,
  HelpCircle
} from 'lucide-react';

interface AdminFinancialControlPanelProps {
  financial?: {
    gross_host_charge?: number;
    encho_fee?: number;
    authorized_meta_spend?: number;
    configured_meta_spend?: number;
    actual_meta_spend?: number;
    remaining_authorization?: number;
    escrow_status?: string;
    currency?: string;
    safety_verdict?: 'SAFE' | 'BLOCKED' | 'RECONCILIATION_REQUIRED' | string;
    is_financial_blocked?: boolean;
    financial_block_reason?: string | null;
  };
  isLoading?: boolean;
}

export const AdminFinancialControlPanel: React.FC<AdminFinancialControlPanelProps> = ({
  financial,
  isLoading = false
}) => {
  if (isLoading || !financial) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  const currency = financial.currency || 'USD';
  const getSymbol = (c: string) => {
    switch (c?.toUpperCase()) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };
  const sym = getSymbol(currency);

  const gross = financial.gross_host_charge ?? 0;
  const fee = financial.encho_fee ?? 0;
  const authorized = financial.authorized_meta_spend ?? 0;
  const configured = financial.configured_meta_spend ?? authorized;
  const actual = financial.actual_meta_spend ?? 0;
  const remaining = financial.remaining_authorization ?? Math.max(0, authorized - actual);
  const escrow = (financial.escrow_status || 'HOLDING').toUpperCase();
  const verdict = financial.safety_verdict || (financial.is_financial_blocked ? 'BLOCKED' : 'SAFE');

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs relative space-y-5"
      role="region"
      aria-label="Admin Financial Controls & Audit"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Coins className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Financial Contract & Authorization Ledger
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Immutable 15/85 fee allocation & escrow safety boundaries
            </p>
          </div>
        </div>

        {/* Safety Verdict Badge */}
        <div>
          {verdict === 'SAFE' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Contract Verdict: SAFE
            </span>
          ) : verdict === 'BLOCKED' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              FINANCIAL BLOCKED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              RECONCILIATION REQUIRED
            </span>
          )}
        </div>
      </div>

      {/* Grid of Ledger Values */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Gross Host Charge
          </span>
          <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-1">
            {sym}{gross.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">Funded Amount</span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Encho Fee (15%)
          </span>
          <span className="text-base font-bold text-zinc-700 dark:text-zinc-300 mt-1">
            {sym}{fee.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">Platform Margin</span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Authorized Meta Spend
          </span>
          <span className="text-base font-bold text-blue-600 dark:text-blue-400 mt-1">
            {sym}{authorized.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">85% Contract Cap</span>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Actual Delivered Spend
          </span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {sym}{actual.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">Meta Insights Rollup</span>
        </div>
      </div>

      {/* Financial Block Reason Notice */}
      {financial.is_financial_blocked && financial.financial_block_reason && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Financial Activation Block:</span>
            <span>{financial.financial_block_reason}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFinancialControlPanel;
