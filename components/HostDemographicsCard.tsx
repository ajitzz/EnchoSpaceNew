import React from 'react';
import {
  Users,
  PieChart,
  Sparkles,
  TrendingUp,
  Eye,
  MousePointerClick,
  ShieldCheck,
  Award
} from 'lucide-react';

export interface DemographicBracket {
  age_group: string;
  share_percentage: number;
  impressions: number;
  clicks: number;
  ctr: number;
  gender_distribution: {
    female_percentage: number;
    male_percentage: number;
  };
  status: 'ACTIVE_SERVING' | 'TARGETED_ACTIVE';
}

export interface AudienceInterest {
  interest_name: string;
  affinity_score: number;
  response_index: string;
  targeting_status: string;
}

interface HostDemographicsCardProps {
  demographicsBreakdown?: DemographicBracket[];
  audienceInterests?: AudienceInterest[];
  isLoading?: boolean;
}

export const HostDemographicsCard: React.FC<HostDemographicsCardProps> = ({
  demographicsBreakdown = [],
  audienceInterests = [],
  isLoading = false
}) => {
  const hasImpressions = demographicsBreakdown.some(d => d.impressions > 0);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm animate-pulse">
        <div className="h-4 w-44 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="h-32 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Audience Demographics and Interest Intelligence"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Audience Demographics & Persona
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                100% Meta Direct
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Age groups, gender ratios, and high-intent buyer personas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Verified Age Cohorts</span>
        </div>
      </div>

      {/* Age Brackets Distribution */}
      <div className="mt-5 space-y-3.5">
        <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
          Age Distribution & Gender Ratios
        </h4>

        {demographicsBreakdown.map((item, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/80"
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {item.age_group} Years
                </span>
                {item.share_percentage >= 40 && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Award className="w-3 h-3" />
                    Top Converting Cohort
                  </span>
                )}
              </div>
              <div className="text-zinc-500 dark:text-zinc-400 text-[11px] font-medium">
                {item.share_percentage}% of total reach
              </div>
            </div>

            {/* Visual Bar */}
            <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700/50 rounded-full overflow-hidden mb-2.5">
              <div
                className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, item.share_percentage)}%` }}
              />
            </div>

            {/* Gender Sub-bar */}
            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/40">
              <span>
                👩 {item.gender_distribution.female_percentage}% Women · 👨 {item.gender_distribution.male_percentage}% Men
              </span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {hasImpressions ? `${item.impressions.toLocaleString()} views · ${item.clicks.toLocaleString()} clicks` : 'Targeting Active'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Target Interest Personas */}
      {audienceInterests.length > 0 && (
        <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-2.5">
            Active High-Intent Interest Personas
          </h4>
          <div className="flex flex-wrap gap-2">
            {audienceInterests.map((interest, i) => (
              <div
                key={i}
                className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-medium">{interest.interest_name}</span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                  {interest.affinity_score}% Affinity
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HostDemographicsCard;
