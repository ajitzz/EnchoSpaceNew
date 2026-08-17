import React from 'react';
import {
  ShieldCheck,
  Coins,
  DollarSign,
  Lock,
  CheckCircle,
  Clock,
  Sparkles,
  PieChart,
  HelpCircle
} from 'lucide-react';

interface HostCampaignFinancialCardProps {
  financialSafety?: {
    is_money_safe?: boolean;
    gross_host_charge?: number;
    total_paid?: number;
    encho_fee?: number;
    authorized_meta_spend?: number;
    ad_spend_allocation?: number;
    configured_meta_spend?: number;
    actual_spend?: number;
    actual_meta_spend?: number;
    remaining_authorized_spend?: number;
    remaining_authorization?: number;
    escrow_status?: string;
    escrow_state_display?: string;
    currency?: string;
    is_financial_blocked?: boolean;
    friendly_financial_guidance?: string | null;
  };
  isLoading?: boolean;
}

export const HostCampaignFinancialCard: React.FC<HostCampaignFinancialCardProps> = ({
  financialSafety,
  isLoading = false
}) => {
  const currency = financialSafety?.currency || 'USD';

  const getCurrencySymbol = (curr: string) => {
    switch (curr?.toUpperCase()) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const symbol = getCurrencySymbol(currency);

  const gross = financialSafety?.gross_host_charge ?? financialSafety?.total_paid ?? 0;
  const fee = financialSafety?.encho_fee ?? 0;
  const authorized = financialSafety?.authorized_meta_spend ?? financialSafety?.ad_spend_allocation ?? 0;
  const actualSpend = financialSafety?.actual_meta_spend ?? financialSafety?.actual_spend ?? 0;
  const remaining = financialSafety?.remaining_authorization ?? financialSafety?.remaining_authorized_spend ?? Math.max(0, authorized - actualSpend);
  const escrowStatus = (financialSafety?.escrow_status || 'HOLDING').toUpperCase();

  const spentPercentage = authorized > 0 ? Math.min(100, Math.round((actualSpend / authorized) * 100)) : 0;

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
      aria-label="Financial Contract & Budget Transparency"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Coins className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Budget & Financial Ledger
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              100% transparent fee structure & authorized ad spend
            </p>
          </div>
        </div>

        {/* Escrow Status Badge */}
        <div className="flex items-center gap-2">
          {escrowStatus === 'RELEASED' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
              Escrow Cleared (100% Dispatched)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <Lock className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              Fraud Escrow Protected
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar of Budget Utilization */}
      <div className="pt-5 pb-3">
        <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-2">
          <span>Ad Spend Delivered: <strong className="text-zinc-900 dark:text-zinc-100">{symbol}{actualSpend.toFixed(2)}</strong></span>
          <span>Budget Cap: <strong className="text-zinc-900 dark:text-zinc-100">{symbol}{authorized.toFixed(2)}</strong> ({spentPercentage}%)</span>
        </div>
        <div className="w-full h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${spentPercentage}%` }}
            role="progressbar"
            aria-valuenow={spentPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
          ></div>
        </div>
      </div>

      {/* Financial Breakdown Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-4">
        {/* Gross Paid */}
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Total Funded
          </span>
          <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-1">
            {symbol}{gross.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">Gross host payment</span>
        </div>

        {/* Encho 15% Optimization Fee */}
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Encho AI Fee (15%)
          </span>
          <span className="text-base font-bold text-zinc-700 dark:text-zinc-300 mt-1">
            {symbol}{fee.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">Optimization & CRM</span>
        </div>

        {/* Authorized Meta Spend (85%) */}
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Authorized Ad Spend
          </span>
          <span className="text-base font-bold text-blue-600 dark:text-blue-400 mt-1">
            {symbol}{authorized.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">85% direct Meta budget</span>
        </div>

        {/* Remaining Liquidity */}
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Remaining Budget
          </span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {symbol}{remaining.toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5">Active reserve</span>
        </div>
      </div>

      {/* Financial Blocked Notice */}
      {financialSafety?.is_financial_blocked && (
        <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold block text-rose-950 dark:text-rose-100">Financial Authorization Guard:</span>
            <span>{financialSafety.friendly_financial_guidance}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostCampaignFinancialCard;
