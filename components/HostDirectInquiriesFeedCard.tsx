import React from 'react';
import {
  MessageSquare,
  Sparkles,
  Flame,
  ArrowRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Lock
} from 'lucide-react';

export interface AdLeadItem {
  id: number | string;
  traveler_origin: string;
  dates_requested?: string;
  intent_score: 'HOT' | 'WARM' | 'NEW';
  created_at: string;
  is_converted: boolean;
}

interface HostDirectInquiriesFeedCardProps {
  leads?: AdLeadItem[];
  campaignTitle?: string;
  onOpenInbox?: () => void;
}

export const HostDirectInquiriesFeedCard: React.FC<HostDirectInquiriesFeedCardProps> = ({
  leads = [],
  campaignTitle = 'Campaign Listing',
  onOpenInbox
}) => {
  const hasLeads = leads.length > 0;

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Direct Ad Inquiries & CRM Leads"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Direct Walled Garden Inquiries
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                100% Verified Leads
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              High-intent traveler inquiries captured inside Encho directly from ad clicks
            </p>
          </div>
        </div>

        {onOpenInbox && (
          <button
            onClick={onOpenInbox}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 border border-purple-200 dark:border-purple-800/60 text-xs font-semibold transition-colors"
          >
            <span>Open Encho Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Feed Content */}
      <div className="mt-4 space-y-2.5">
        {!hasLeads ? (
          <div className="py-8 text-center bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <Lock className="w-6 h-6 text-zinc-400 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Awaiting Direct Guest Inquiries
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
              When travelers click your ad and initiate booking inquiries or ask questions about dates, they will appear here with high-intent scoring.
            </p>
          </div>
        ) : (
          leads.map((lead) => (
            <div
              key={lead.id}
              className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Flame className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Traveler from {lead.traveler_origin}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      🔥 HOT LEAD
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Interested in: {lead.dates_requested || 'Upcoming Weekend Stay'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {lead.is_converted ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Booked
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400 font-medium">
                    Pending Reply
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HostDirectInquiriesFeedCard;
