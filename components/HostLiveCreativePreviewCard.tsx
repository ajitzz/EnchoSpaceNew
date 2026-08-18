import React, { useState } from 'react';
import {
  Smartphone,
  Sparkles,
  Video,
  Layers,
  ExternalLink,
  Eye,
  CheckCircle2,
  Play,
  Volume2
} from 'lucide-react';

interface HostLiveCreativePreviewCardProps {
  title?: string;
  heroImageUrl?: string;
  adFormat?: string;
  listingLocation?: string;
  currency?: string;
  pricePerNight?: number | string;
}

export const HostLiveCreativePreviewCard: React.FC<HostLiveCreativePreviewCardProps> = ({
  title = 'Luxury Mountain Villa',
  heroImageUrl = 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
  adFormat = 'ADVANTAGE_PLUS',
  listingLocation = 'Wayanad, Kerala',
  currency = 'INR',
  pricePerNight = '3,500'
}) => {
  const [activeFormat, setActiveFormat] = useState<'reels' | 'feed' | 'facebook'>('reels');

  const getCurrencySymbol = (curr: string) => {
    switch (curr?.toUpperCase()) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const symbol = getCurrencySymbol(currency);

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Live Ad Creative Preview"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 via-pink-500/20 to-purple-500/20 text-pink-600 dark:text-pink-400">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Live Ad Creative Mockup & Formats
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                Meta Advantage+
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Interactive preview of how travelers experience your listing across Meta apps
            </p>
          </div>
        </div>

        {/* Format Selector Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          <button
            onClick={() => setActiveFormat('reels')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              activeFormat === 'reels'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Instagram Reels (9:16)
          </button>
          <button
            onClick={() => setActiveFormat('feed')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              activeFormat === 'feed'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Instagram Feed (1:1)
          </button>
          <button
            onClick={() => setActiveFormat('facebook')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              activeFormat === 'facebook'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Facebook Mobile
          </button>
        </div>
      </div>

      {/* Mockup Canvas */}
      <div className="mt-5 flex justify-center">
        {activeFormat === 'reels' ? (
          /* 9:16 Instagram Reel Mockup */
          <div className="w-[280px] h-[498px] rounded-[36px] bg-black border-[6px] border-zinc-800 shadow-2xl relative overflow-hidden flex flex-col justify-between text-white">
            {/* Background Image / Video Asset */}
            <img
              src={heroImageUrl}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

            {/* Top Reel Navigation Bar */}
            <div className="relative z-10 p-4 flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5 drop-shadow">
                <Video className="w-4 h-4" /> Reels
              </span>
              <span className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-[10px] font-bold border border-white/20">
                Sponsored
              </span>
            </div>

            {/* Bottom Reel Caption & CTA */}
            <div className="relative z-10 p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-[10px] border border-white">
                  EN
                </div>
                <div>
                  <span className="font-bold text-xs block drop-shadow">Encho Stays</span>
                  <span className="text-[10px] text-zinc-300 drop-shadow">{listingLocation}</span>
                </div>
              </div>

              <p className="text-xs font-medium leading-snug drop-shadow line-clamp-2">
                {title} · Experience unforgettable stays from {symbol}{pricePerNight}/night.
              </p>

              {/* Action Button */}
              <div className="w-full py-2.5 rounded-xl bg-white text-zinc-900 font-bold text-xs text-center shadow-lg hover:bg-zinc-100 flex items-center justify-center gap-1.5">
                <span>Book Now on Encho</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        ) : (
          /* 1:1 Feed Mockup */
          <div className="w-full max-w-sm rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 shadow-md overflow-hidden text-xs">
            {/* Post Header */}
            <div className="p-3 flex items-center justify-between bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center">
                  EN
                </div>
                <div>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 block">Encho</span>
                  <span className="text-[10px] text-zinc-400">Sponsored · {listingLocation}</span>
                </div>
              </div>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Active Ad</span>
            </div>

            {/* Image */}
            <div className="w-full h-56 bg-zinc-900 relative">
              <img src={heroImageUrl} alt={title} className="w-full h-full object-cover" />
            </div>

            {/* Post CTA Bar */}
            <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 block truncate max-w-[200px]">{title}</span>
                <span className="text-[10px] text-zinc-500">From {symbol}{pricePerNight}/night</span>
              </div>
              <button className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-[11px]">
                Book Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HostLiveCreativePreviewCard;
