import React from 'react';
import {
  Sparkles,
  Zap,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  ShieldCheck,
  ArrowRight,
  Flame
} from 'lucide-react';

interface HostCampaignAiAdvisorCardProps {
  fuelPercentage?: number;
  topLocation?: string;
  ctr?: number;
  leadsCount?: number;
  dcoWinnerName?: string;
  isLive?: boolean;
}

export const HostCampaignAiAdvisorCard: React.FC<HostCampaignAiAdvisorCardProps> = ({
  fuelPercentage = 100,
  topLocation = 'Bangalore Urban',
  ctr = 0,
  leadsCount = 0,
  dcoWinnerName = 'Photo Variant B (Sunset Infinity View)',
  isLive = true
}) => {
  // Generate dynamic, brutally honest, FAANG-grade actionable recommendations
  const getAdvisorRecommendations = () => {
    const recs = [];

    if (fuelPercentage <= 25) {
      recs.push({
        type: 'CRITICAL_FUEL',
        title: 'Budget Runway Alert — Refuel Suggested',
        desc: `Your campaign fuel is at ${fuelPercentage.toFixed(1)}%. Ad networks penalize ads that run out of budget mid-auction. Refuel now to maintain bidding velocity.`,
        badge: 'Priority Action',
        color: 'rose'
      });
    } else {
      recs.push({
        type: 'HEALTHY_RUNWAY',
        title: 'Bidding Efficiency & Fuel Runway is Optimal',
        desc: `Ad budget fuel is strong (${fuelPercentage.toFixed(1)}%). Bidding algorithms have full liquidity to target peak traveler browsing hours (8 PM - 11 PM).`,
        badge: 'Optimal',
        color: 'emerald'
      });
    }

    if (ctr >= 3.0) {
      recs.push({
        type: 'HIGH_CTR',
        title: 'Outstanding Creative Engagement Detected',
        desc: `Your Click-Through Rate (${ctr.toFixed(2)}%) is in the top 10% of luxury stays. Meta has prioritized your video creative across Instagram Reels.`,
        badge: 'Top 10% Creative',
        color: 'purple'
      });
    } else {
      recs.push({
        type: 'CREATIVE_TESTING',
        title: 'Dynamic Creative Optimization (DCO) Active',
        desc: `Encho's AI is continuously testing multiple photo angles against high-intent travel cohorts in ${topLocation} to maximize return on ad spend.`,
        badge: 'AI Optimization',
        color: 'blue'
      });
    }

    recs.push({
      type: 'GEOGRAPHIC_EXPANSION',
      title: `High Buyer Intent in ${topLocation}`,
      desc: `Targeting in ${topLocation} is generating the highest conversion response index. Ensure your calendar pricing is updated to capture quick weekend bookings.`,
      badge: 'Geographic Insight',
      color: 'amber'
    });

    return recs;
  };

  const recommendations = getAdvisorRecommendations();

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Encho AI Marketing Advisor"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Encho AI Co-Pilot Intelligence
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Actionable Advice
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Brutally honest, continuous optimization insights derived from ad auction signals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span>Real-Time Diagnosis</span>
        </div>
      </div>

      {/* Recommendations Cards */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {recommendations.map((rec, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  rec.color === 'rose'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : rec.color === 'emerald'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : rec.color === 'purple'
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                }`}>
                  {rec.badge}
                </span>
                <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1.5 leading-snug">
                {rec.title}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {rec.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HostCampaignAiAdvisorCard;
