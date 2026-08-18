import React, { useState } from 'react';
import {
  Zap,
  Fuel,
  TrendingDown,
  Clock,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowUpRight,
  Flame,
  Activity
} from 'lucide-react';

interface FuelGaugeData {
  total_authorized: number;
  total_authorized_cents: number;
  actual_spend: number;
  actual_spend_cents: number;
  remaining_fuel: number;
  remaining_fuel_cents: number;
  fuel_percentage: number;
  is_low_fuel: boolean;
  daily_burn_rate: number;
  daily_burn_rate_cents: number;
  projected_days_remaining: number | null;
  currency: string;
  status_label: string;
}

interface CampaignReactorCoreProps {
  campaignId: number | string;
  fuelGauge?: FuelGaugeData;
  currency?: string;
  isLive?: boolean;
  onRefuelSuccess?: () => void;
}

export const CampaignReactorCore: React.FC<CampaignReactorCoreProps> = ({
  campaignId,
  fuelGauge,
  currency = 'USD',
  isLive = true,
  onRefuelSuccess
}) => {
  const [showRefuelModal, setShowRefuelModal] = useState(false);
  const [refuelAmount, setRefuelAmount] = useState<number>(2500);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refuelStatus, setRefuelStatus] = useState<string | null>(null);

  const getCurrencySymbol = (curr: string) => {
    switch (curr?.toUpperCase()) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const symbol = getCurrencySymbol(currency);
  const fuelPct = fuelGauge ? fuelGauge.fuel_percentage : 100;
  const isLow = fuelGauge ? fuelGauge.is_low_fuel : false;
  const remaining = fuelGauge ? fuelGauge.remaining_fuel : 0;
  const total = fuelGauge ? fuelGauge.total_authorized : 0;
  const spent = fuelGauge ? fuelGauge.actual_spend : 0;

  // Determine core glow and color theme based on fuel percentage
  const getTheme = () => {
    if (fuelPct <= 20) {
      return {
        bgGradient: 'from-rose-500/10 via-amber-500/5 to-transparent',
        border: 'border-rose-500/30 dark:border-rose-500/40',
        glow: 'shadow-[0_0_25px_rgba(244,63,94,0.2)]',
        bar: 'bg-gradient-to-r from-rose-500 to-amber-500',
        badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        textColor: 'text-rose-600 dark:text-rose-400'
      };
    }
    if (fuelPct <= 45) {
      return {
        bgGradient: 'from-amber-500/10 via-yellow-500/5 to-transparent',
        border: 'border-amber-500/30 dark:border-amber-500/40',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
        bar: 'bg-gradient-to-r from-amber-500 to-emerald-400',
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        textColor: 'text-amber-600 dark:text-amber-400'
      };
    }
    return {
      bgGradient: 'from-emerald-500/10 via-cyan-500/5 to-transparent',
      border: 'border-emerald-500/20 dark:border-emerald-500/30',
      glow: 'shadow-[0_0_25px_rgba(16,185,129,0.15)]',
      bar: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
      badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    };
  };

  const theme = getTheme();

  const handleRefuelSubmit = async () => {
    setIsProcessing(true);
    setRefuelStatus(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/refuel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: refuelAmount, currency })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to initiate campaign refuel.');
      }

      setRefuelStatus('SUCCESS');
      setTimeout(() => {
        setShowRefuelModal(false);
        if (onRefuelSuccess) onRefuelSuccess();
      }, 1200);
    } catch (err: any) {
      setRefuelStatus(err.message || 'Refuel encountered an issue.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border ${theme.border} ${theme.glow} p-6 transition-all duration-300`}>
      {/* Background Reactor Core Glow */}
      <div className={`absolute -right-16 -top-16 w-56 h-56 rounded-full bg-gradient-to-br ${theme.bgGradient} blur-3xl pointer-events-none`} />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Campaign Reactor Core
              </h3>
              {isLive && (
                <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Flow
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              100% genuine budget fuel telemetry synchronized with ad networks
            </p>
          </div>
        </div>

        {/* Refuel Action Trigger */}
        <button
          onClick={() => setShowRefuelModal(true)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all duration-200 ${
            isLow
              ? 'bg-rose-600 hover:bg-rose-700 text-white animate-bounce'
              : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          Refuel Budget
        </button>
      </div>

      {/* Fuel Gauge Visual Meter */}
      <div className="pt-5 pb-3">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
              {fuelPct.toFixed(1)}%
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${theme.badge}`}>
              {fuelGauge?.status_label || 'FULLY CHARGED'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Available Runway
            </span>
            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {symbol}{remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {symbol}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* The Animated Energy Bar */}
        <div className="w-full h-3.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-200 dark:border-zinc-700/50">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${theme.bar}`}
            style={{ width: `${Math.max(2, Math.min(100, fuelPct))}%` }}
          />
        </div>
      </div>

      {/* Auxiliary Reactor Core Diagnostics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Ad Spend Cap
          </span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
            {symbol}{total.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
            Actual Network Spend
          </span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
            {symbol}{spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            Est. Daily Burn
          </span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
            {fuelGauge?.daily_burn_rate && fuelGauge.daily_burn_rate > 0
              ? `${symbol}${fuelGauge.daily_burn_rate.toFixed(2)}/day`
              : 'Entering Auction'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            Projected Runway
          </span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
            {fuelGauge?.projected_days_remaining !== null && fuelGauge?.projected_days_remaining !== undefined
              ? `${fuelGauge.projected_days_remaining} Days`
              : 'Optimal Runway'}
          </span>
        </div>
      </div>

      {/* Refuel Modal */}
      {showRefuelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Refuel Campaign Budget
                </h4>
              </div>
              <button
                onClick={() => setShowRefuelModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="py-5">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Instantly top up your ad budget with 100% idempotency protection. 85% goes directly to active ad auctions; 15% covers Encho AI creative optimization & management.
              </p>

              {/* Preset Buttons */}
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                {[1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRefuelAmount(amt)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      refuelAmount === amt
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    {symbol}{amt.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Financial Transparency Calculation */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1.5">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Gross Refuel Charge:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{symbol}{refuelAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Direct Ad Media Spend (85%):</span>
                  <span className="font-bold">+{symbol}{(refuelAmount * 0.85).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-[11px]">
                  <span>AI Optimization Fee (15%):</span>
                  <span>{symbol}{(refuelAmount * 0.15).toLocaleString()}</span>
                </div>
              </div>

              {refuelStatus && refuelStatus !== 'SUCCESS' && (
                <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs">
                  {refuelStatus}
                </div>
              )}

              {refuelStatus === 'SUCCESS' && (
                <div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Campaign refueled successfully! Updating reactor core...
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRefuelModal(false)}
                className="w-1/2 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRefuelSubmit}
                className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5"
              >
                {isProcessing ? 'Processing...' : `Refuel ${symbol}${refuelAmount.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignReactorCore;
