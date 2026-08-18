import React from 'react';
import {
  TrendingUp,
  Target,
  Eye,
  MousePointerClick,
  Users,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  PieChart,
  HelpCircle
} from 'lucide-react';

export interface FunnelMetricsData {
  impressions: number;
  clicks: number;
  listing_views: number;
  direct_leads: number;
  bookings_count: number;
  gross_booking_value: number;
  gross_booking_value_cents: number;
  click_rate: number;
  lead_rate: number;
  cost_per_lead: number;
  net_roas: number;
  currency: string;
}

export interface FinancialSafetyData {
  gross_host_charge: number;
  gross_host_charge_cents: number;
  encho_fee: number;
  encho_fee_cents: number;
  authorized_meta_spend: number;
  authorized_meta_spend_cents: number;
  actual_spend: number;
  actual_spend_cents: number;
  remaining_authorized_spend: number;
  remaining_authorized_spend_cents: number;
  escrow_status: string;
  escrow_state_display: string;
  currency: string;
}

interface HostFunnelRoasCardProps {
  funnelMetrics?: FunnelMetricsData;
  financialSafety?: FinancialSafetyData;
  currency?: string;
  isLoading?: boolean;
}

export const HostFunnelRoasCard: React.FC<HostFunnelRoasCardProps> = ({
  funnelMetrics,
  financialSafety,
  currency = 'USD',
  isLoading = false
}) => {
  const getCurrencySymbol = (curr: string) => {
    switch (curr?.toUpperCase()) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const symbol = getCurrencySymbol(currency);

  const impressions = funnelMetrics?.impressions || 0;
  const clicks = funnelMetrics?.clicks || 0;
  const leads = funnelMetrics?.direct_leads || 0;
  const bookings = funnelMetrics?.bookings_count || 0;
  const grossCharge = financialSafety?.gross_host_charge || 0;
  const fee = financialSafety?.encho_fee || 0;
  const mediaSpend = financialSafety?.authorized_meta_spend || 0;
  const actualSpend = financialSafety?.actual_spend || 0;
  const remaining = financialSafety?.remaining_authorized_spend || 0;
  const roas = funnelMetrics?.net_roas || 0;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="h-32 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Conversion Funnel and Financial Transparency"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Conversion Funnel & True ROAS
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                100% Transparent
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Direct pipeline from raw ad impressions to Encho bookings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <Sparkles className="w-4 h-4" />
          <span>ROAS: {roas > 0 ? `${roas.toFixed(1)}x` : 'Entering Warm-up'}</span>
        </div>
      </div>

      {/* Visual Conversion Funnel Flow */}
      <div className="pt-5 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative">
          {/* Step 1: Views */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-zinc-400" />
                1. Ad Views
              </span>
              <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1 block">
                {impressions.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">
              Verified Ad Impressions
            </span>
          </div>

          {/* Step 2: Clicks */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <MousePointerClick className="w-3.5 h-3.5 text-blue-500" />
                2. Link Clicks
              </span>
              <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1 block">
                {clicks.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-2">
              CTR: {funnelMetrics?.click_rate ? `${funnelMetrics.click_rate.toFixed(2)}%` : '0.00%'}
            </span>
          </div>

          {/* Step 3: Direct Inquiries */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-purple-500" />
                3. Direct Leads
              </span>
              <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1 block">
                {leads.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium mt-2">
              Conv: {funnelMetrics?.lead_rate ? `${funnelMetrics.lead_rate.toFixed(1)}%` : '0.0%'}
            </span>
          </div>

          {/* Step 4: Bookings */}
          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                4. Bookings
              </span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1 block">
                {bookings.toLocaleString()}
              </span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-2">
              Confirmed Reservations
            </span>
          </div>
        </div>
      </div>

      {/* 100% Financial Ledger Transparency Box */}
      <div className="mt-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/80 dark:border-zinc-700/60">
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            Clear Financial Accounting
          </span>
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            Encho Double-Entry Ledger
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Gross Charge</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">{symbol}{grossCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Pure Media Spend (85%)</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{symbol}{mediaSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Encho AI Fee (15%)</span>
            <span className="font-bold text-zinc-700 dark:text-zinc-300">{symbol}{fee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Remaining Ad Fuel</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">{symbol}{remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostFunnelRoasCard;
