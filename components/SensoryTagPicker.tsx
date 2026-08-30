import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Search, X, Sparkles, Loader2, Check, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SensoryTagData {
  id: string;
  label: string;
  category: string;
  emoji: string;
  desc: string;
}

export const SENSORY_CATEGORIES = [
  { id: 'all',          label: 'All Tags',          emoji: '✨' },
  { id: 'nature',       label: 'Nature & Views',    emoji: '🌿' },
  { id: 'wellness',     label: 'Wellness & Spa',    emoji: '🧘' },
  { id: 'culinary',     label: 'Culinary',          emoji: '🍽️' },
  { id: 'connectivity', label: 'Connectivity',      emoji: '📡' },
  { id: 'atmosphere',   label: 'Atmosphere',        emoji: '🌅' },
  { id: 'leisure',      label: 'Leisure & Sport',   emoji: '🎯' },
  { id: 'service',      label: 'Service',           emoji: '👑' },
  { id: 'experiences',  label: 'Experiences',       emoji: '🎭' },
];

export const ALL_SENSORY_TAGS: SensoryTagData[] = [
  { id: 'ocean-waves',           label: 'Ocean Waves',             category: 'nature',       emoji: '🌊', desc: 'Sounds & sights of the open ocean' },
  { id: 'mountain-view',         label: 'Panoramic Mountain View', category: 'nature',       emoji: '🏔️', desc: '360° mountain vistas' },
  { id: 'valley-sunrise',        label: 'Valley Sunrise',          category: 'nature',       emoji: '🌅', desc: 'Unobstructed sunrise from the valley' },
  { id: 'forest-canopy',         label: 'Forest Canopy',           category: 'nature',       emoji: '🌲', desc: 'Immersive forest surroundings' },
  { id: 'desert-dunes',          label: 'Desert Dunes Vista',      category: 'nature',       emoji: '🏜️', desc: 'Sweeping desert landscape' },
  { id: 'backwater-views',       label: 'Backwater Views',         category: 'nature',       emoji: '🛶', desc: 'Tranquil Kerala-style waters' },
  { id: 'waterfall',             label: 'Waterfall Proximity',     category: 'nature',       emoji: '💦', desc: 'Walk to a natural waterfall' },
  { id: 'tea-estate',            label: 'Tea Estate Vista',        category: 'nature',       emoji: '🍃', desc: 'Manicured tea garden views' },
  { id: 'stargazing',            label: 'Stargazing Sky',          category: 'nature',       emoji: '🌠', desc: 'Unpolluted dark sky access' },
  { id: 'himalayan-peaks',       label: 'Himalayan Peaks',         category: 'nature',       emoji: '⛰️', desc: 'Views of the Himalayas' },
  { id: 'river-frontage',        label: 'River Frontage',          category: 'nature',       emoji: '🏞️', desc: 'Direct river access' },
  { id: 'cliff-top',             label: 'Cliff-Top Perch',         category: 'nature',       emoji: '🦅', desc: 'Dramatic elevated position' },
  { id: 'paddy-field',           label: 'Paddy Field Views',       category: 'nature',       emoji: '🌾', desc: 'Serene rural landscape' },
  { id: 'coral-reef',            label: 'Coral Reef Access',       category: 'nature',       emoji: '🐠', desc: 'Snorkeling at the doorstep' },
  { id: 'jungle-sounds',         label: 'Jungle Sounds',           category: 'nature',       emoji: '🦜', desc: 'Immersive tropical jungle ambiance' },
  { id: 'infinity-pool',         label: 'Heated Infinity Pool',    category: 'wellness',     emoji: '🏊', desc: 'Temperature-controlled infinity pool' },
  { id: 'private-jacuzzi',       label: 'Private Jacuzzi',         category: 'wellness',     emoji: '🛁', desc: 'In-room or private jacuzzi' },
  { id: 'invilla-spa',           label: 'In-Villa Spa Treatments', category: 'wellness',     emoji: '💆', desc: 'Therapist visits on demand' },
  { id: 'yoga-deck',             label: 'Yoga Deck',               category: 'wellness',     emoji: '🧘', desc: 'Dedicated outdoor yoga platform' },
  { id: 'meditation-garden',     label: 'Meditation Garden',       category: 'wellness',     emoji: '🪷', desc: 'Curated mindfulness garden' },
  { id: 'ayurvedic',             label: 'Ayurvedic Therapies',     category: 'wellness',     emoji: '🌿', desc: 'Traditional Ayurveda on-site' },
  { id: 'cold-plunge',           label: 'Cold Plunge Pool',        category: 'wellness',     emoji: '❄️', desc: 'Therapeutic cold water immersion' },
  { id: 'steam-sauna',           label: 'Steam & Sauna',           category: 'wellness',     emoji: '🔥', desc: 'Private steam room & sauna' },
  { id: 'hydrotherapy',          label: 'Hydrotherapy Circuit',    category: 'wellness',     emoji: '💧', desc: 'Multi-station water therapy' },
  { id: 'forest-bathing',        label: 'Forest Bathing Trail',    category: 'wellness',     emoji: '🌳', desc: 'Guided shinrin-yoku walks' },
  { id: 'sunrise-yoga',          label: 'Sunrise Yoga Sessions',   category: 'wellness',     emoji: '🌄', desc: 'Daily guided sunrise yoga' },
  { id: 'wellness-consult',      label: 'Wellness Consultation',   category: 'wellness',     emoji: '🩺', desc: 'Personal wellness advisor on call' },
  { id: 'private-chef',          label: 'Private Chef Available',  category: 'culinary',     emoji: '🍳', desc: 'On-demand private chef service' },
  { id: 'wine-cellar',           label: 'Wine Cellar Access',      category: 'culinary',     emoji: '🍷', desc: 'Curated sommelier collection' },
  { id: 'farm-to-table',         label: 'Farm-to-Table Dining',    category: 'culinary',     emoji: '🥗', desc: 'Locally sourced gourmet meals' },
  { id: 'tea-garden-tasting',    label: 'Organic Tea Garden',      category: 'culinary',     emoji: '🍵', desc: 'Tea tasting from the estate garden' },
  { id: 'invilla-breakfast',     label: 'In-Villa Breakfast',      category: 'culinary',     emoji: '☕', desc: 'Private butler-served breakfast' },
  { id: 'poolside-dining',       label: 'Poolside Dining',         category: 'culinary',     emoji: '🍽️', desc: 'Al fresco dining at the pool' },
  { id: 'bonfire-bbq',           label: 'Bonfire BBQ Setup',       category: 'culinary',     emoji: '🔥', desc: 'Outdoor firepit BBQ evenings' },
  { id: 'artisan-coffee',        label: 'Artisan Coffee Bar',      category: 'culinary',     emoji: '☕', desc: 'Specialty micro-roasted coffee bar' },
  { id: 'tasting-menu',          label: 'Tasting Menu Experience', category: 'culinary',     emoji: '🥂', desc: 'Multi-course curated dining' },
  { id: 'mixology-bar',          label: 'Mixology Bar',            category: 'culinary',     emoji: '🍸', desc: 'In-house craft cocktail bar' },
  { id: '1gbps-wifi',            label: '1 Gbps Fiber WiFi',       category: 'connectivity', emoji: '📶', desc: 'Enterprise-grade fiber internet' },
  { id: 'starlink-wifi',         label: 'Starlink Satellite WiFi', category: 'connectivity', emoji: '🛰️', desc: 'SpaceX Starlink connectivity' },
  { id: 'work-studio',           label: 'Dedicated Work Studio',   category: 'connectivity', emoji: '💻', desc: 'Soundproof home office setup' },
  { id: 'smart-home',            label: 'Smart Home Controls',     category: 'connectivity', emoji: '🏠', desc: 'App-controlled room systems' },
  { id: 'video-conf',            label: 'Video Conferencing Setup',category: 'connectivity', emoji: '📹', desc: 'Pro A/V for virtual meetings' },
  { id: 'dual-isp',              label: 'Dual ISP Backup Internet',category: 'connectivity', emoji: '🔗', desc: 'Zero-downtime connectivity' },
  { id: 'fireplace',             label: 'Artisan Fireplace',       category: 'atmosphere',   emoji: '🔥', desc: 'Handcrafted stone fireplace' },
  { id: 'himalayan-silence',     label: 'Himalayan Silence',       category: 'atmosphere',   emoji: '🔇', desc: 'Zero ambient noise environment' },
  { id: 'rainforest-soundscape', label: 'Rainforest Soundscape',   category: 'atmosphere',   emoji: '🌧️', desc: 'Natural rain & jungle audio immersion' },
  { id: 'candlelit-courtyards',  label: 'Candlelit Courtyards',    category: 'atmosphere',   emoji: '🕯️', desc: 'Romantic evening ambiance' },
  { id: 'acoustic-arch',         label: 'Acoustic Architecture',   category: 'atmosphere',   emoji: '🎵', desc: 'Sound-engineered interior design' },
  { id: 'circadian-lighting',    label: 'Circadian Lighting System',category:'atmosphere',   emoji: '💡', desc: 'Biologically tuned lighting' },
  { id: 'aromatherapy',          label: 'Aromatherapy Diffusion',  category: 'atmosphere',   emoji: '🌸', desc: 'Scent-designed living spaces' },
  { id: 'heritage-arch',         label: 'Heritage Architecture',   category: 'atmosphere',   emoji: '🏛️', desc: 'Restored historical structure' },
  { id: 'minimalist-zen',        label: 'Minimalist Zen Design',   category: 'atmosphere',   emoji: '⚪', desc: 'Japanese-influenced interiors' },
  { id: 'open-air-pavilions',    label: 'Open-Air Pavilions',      category: 'atmosphere',   emoji: '🌬️', desc: 'Ventilated outdoor living spaces' },
  { id: 'tennis-court',          label: 'Private Tennis Court',    category: 'leisure',      emoji: '🎾', desc: 'Full-size private court' },
  { id: 'trekking-routes',       label: 'Nature Trekking Routes',  category: 'leisure',      emoji: '🥾', desc: 'Guided & self-guided trails' },
  { id: 'kayaking',              label: 'Kayaking & Canoeing',     category: 'leisure',      emoji: '🚣', desc: 'On-site water sports' },
  { id: 'horse-riding',          label: 'Horse Riding Trails',     category: 'leisure',      emoji: '🐎', desc: 'Curated equestrian experience' },
  { id: 'archery-range',         label: 'Archery Range',           category: 'leisure',      emoji: '🏹', desc: 'Private archery range setup' },
  { id: 'mountain-cycling',      label: 'Mountain Cycling Paths',  category: 'leisure',      emoji: '🚵', desc: 'Curated MTB trail network' },
  { id: 'bird-watching',         label: 'Bird Watching Post',      category: 'leisure',      emoji: '🦅', desc: 'Rare species spotting zones' },
  { id: 'sunset-sailing',        label: 'Sunset Sailing',          category: 'leisure',      emoji: '⛵', desc: 'Private sail at golden hour' },
  { id: 'golf-proximity',        label: 'Golf Proximity',          category: 'leisure',      emoji: '⛳', desc: 'Championship golf course access' },
  { id: 'rock-climbing',         label: 'Rock Climbing Wall',      category: 'leisure',      emoji: '🧗', desc: 'On-property climbing wall' },
  { id: 'butler-service',        label: '24/7 Butler Service',     category: 'service',      emoji: '🎩', desc: 'Dedicated personal butler' },
  { id: 'airport-transfer',      label: 'Private Airport Transfer',category: 'service',      emoji: '🚙', desc: 'Chauffeur airport pickup & drop' },
  { id: 'helipad',               label: 'Helipad Access',          category: 'service',      emoji: '🚁', desc: 'On-property helicopter landing pad' },
  { id: 'celebrity-privacy',     label: 'Celebrity-Grade Privacy', category: 'service',      emoji: '🔐', desc: 'Discreet, security-forward property' },
  { id: 'curated-minibar',       label: 'Curated Minibar',         category: 'service',      emoji: '🥃', desc: 'Premium spirits & wines selection' },
  { id: 'personal-trainer',      label: 'Personal Trainer',        category: 'service',      emoji: '💪', desc: 'In-villa fitness coaching' },
  { id: 'childcare',             label: 'Childcare Available',     category: 'service',      emoji: '👶', desc: 'Professional nanny service' },
  { id: 'dedicated-concierge',   label: 'Dedicated Concierge',     category: 'service',      emoji: '🛎️', desc: '24/7 guest experience manager' },
  { id: 'cultural-walks',        label: 'Cultural Immersion Walks',category: 'experiences',  emoji: '🗺️', desc: 'Guided local culture & heritage tours' },
  { id: 'artisan-workshops',     label: 'Local Artisan Workshops', category: 'experiences',  emoji: '🎨', desc: 'Craft & art making sessions' },
  { id: 'photo-tours',           label: 'Sunset Photography Tours',category: 'experiences',  emoji: '📸', desc: 'Expert-guided landscape photo walks' },
  { id: 'guided-stargazing',     label: 'Guided Stargazing',       category: 'experiences',  emoji: '🔭', desc: 'Telescope-assisted star tours' },
  { id: 'private-boat-tours',    label: 'Private Boat Tours',      category: 'experiences',  emoji: '🚤', desc: 'Chartered water excursions' },
  { id: 'cinema-room',           label: 'Private Cinema Room',     category: 'experiences',  emoji: '🎬', desc: 'In-villa screening theater' },
  { id: 'library-nook',          label: 'Library & Reading Nook',  category: 'experiences',  emoji: '📚', desc: 'Curated book collection & reading lounge' },
  { id: 'bonfire-storytelling',  label: 'Bonfire Storytelling Nights',category:'experiences',emoji: '🌙', desc: 'Guided evening fire gatherings' },
];

interface SensoryTagPickerProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  listingTitle?: string;
  listingDescription?: string;
  listingType?: string;
  listingLocation?: string;
}

export const SensoryTagPicker: React.FC<SensoryTagPickerProps> = ({
  selectedTags,
  onChange,
  listingTitle,
  listingDescription,
  listingType,
  listingLocation,
}) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [justSuggested, setJustSuggested] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredTags = useMemo(() => {
    return ALL_SENSORY_TAGS.filter(tag => {
      const matchesCategory = activeCategory === 'all' || tag.category === activeCategory;
      const matchesSearch = !search.trim() ||
        tag.label.toLowerCase().includes(search.toLowerCase()) ||
        tag.desc.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const toggleTag = useCallback((label: string) => {
    if (selectedTags.includes(label)) {
      onChange(selectedTags.filter(t => t !== label));
    } else {
      onChange([...selectedTags, label]);
    }
  }, [selectedTags, onChange]);

  const removeTag = useCallback((label: string) => {
    onChange(selectedTags.filter(t => t !== label));
  }, [selectedTags, onChange]);

  const handleAiSuggest = useCallback(async () => {
    if (!listingTitle && !listingDescription) {
      setAiError('Fill in "About The Sanctuary" description first for AI tag suggestions.');
      setTimeout(() => setAiError(null), 4000);
      return;
    }
    setIsSuggesting(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/suggest-sensory-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: listingTitle,
          description: listingDescription,
          propertyType: listingType,
          location: listingLocation,
        }),
      });
      const data = await res.json();
      if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
        const merged = Array.from(new Set([...selectedTags, ...data.tags]));
        onChange(merged);
        setJustSuggested(true);
        setTimeout(() => setJustSuggested(false), 3000);
      } else {
        setAiError('AI could not find matching tags. Add more description to your sanctuary.');
        setTimeout(() => setAiError(null), 4000);
      }
    } catch {
      setAiError('AI suggestion failed. Please try again.');
      setTimeout(() => setAiError(null), 4000);
    } finally {
      setIsSuggesting(false);
    }
  }, [listingTitle, listingDescription, listingType, listingLocation, selectedTags, onChange]);

  const activeCategoryData = SENSORY_CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className="space-y-4 rounded-2xl bg-[#0B1420] border border-slate-700/60 p-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Layers className="w-4 h-4 text-[#0284C7] shrink-0" />
            <span className="text-xs font-black uppercase tracking-widest text-slate-200">
              Sensory Atmosphere Deck
            </span>
            {selectedTags.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-[#0284C7] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {selectedTags.length} selected
              </span>
            )}
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold border border-slate-700 px-2 py-0.5 rounded-full">Aman Standard</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            These tags power the Aman-Standard Sensory Deck cards shown on your listing. Select tags that genuinely reflect your estate's experience.
          </p>
        </div>
        {/* AI Suggest */}
        <button
          type="button"
          onClick={handleAiSuggest}
          disabled={isSuggesting}
          className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-60 ${
            justSuggested
              ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
              : 'bg-gradient-to-br from-purple-900/60 to-[#0284C7]/20 border-purple-500/40 hover:border-purple-400/70 text-purple-200 hover:text-white shadow-lg shadow-purple-900/30'
          }`}
        >
          {isSuggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
           justSuggested ? <Check className="w-3.5 h-3.5 text-emerald-400" /> :
           <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
          <span>{isSuggesting ? 'AI Analysing…' : justSuggested ? 'Tags Added!' : 'AI Suggest'}</span>
        </button>
      </div>

      {/* AI Error */}
      <AnimatePresence>
        {aiError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 p-3 bg-amber-900/30 border border-amber-500/40 rounded-xl text-amber-300 text-xs font-medium"
          >
            <span>⚠️</span><span>{aiError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Chips */}
      <AnimatePresence>
        {selectedTags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-[#060C17] border border-[#0284C7]/25 rounded-xl space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#38BDF8]">Active Tags → Guest View</span>
              <button type="button" onClick={() => onChange([])} className="text-[10px] text-slate-600 hover:text-red-400 font-bold transition-colors cursor-pointer">
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map(tag => {
                const tagData = ALL_SENSORY_TAGS.find(t => t.label === tag);
                return (
                  <motion.span
                    key={tag}
                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 bg-[#0284C7]/15 border border-[#0284C7]/40 rounded-full text-xs font-bold text-[#38BDF8]"
                  >
                    <span className="text-sm leading-none">{tagData?.emoji || '✨'}</span>
                    <span className="max-w-[120px] truncate">{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="w-4 h-4 rounded-full bg-slate-800 hover:bg-red-500/30 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5 text-slate-400 hover:text-red-400" />
                    </button>
                  </motion.span>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search 80+ atmosphere tags… (e.g. 'pool', 'mountain', 'chef', 'yoga')"
          className="w-full bg-[#060C17] border border-slate-700 hover:border-slate-600 focus:border-[#0284C7] rounded-xl pl-11 pr-10 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0284C7]/20 transition-all"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); searchRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-3 h-3 text-slate-300" />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SENSORY_CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id;
          const totalCount = cat.id === 'all' ? ALL_SENSORY_TAGS.length : ALL_SENSORY_TAGS.filter(t => t.category === cat.id).length;
          const selectedCount = cat.id === 'all'
            ? selectedTags.length
            : selectedTags.filter(t => ALL_SENSORY_TAGS.find(d => d.label === t)?.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-lg shadow-[#0284C7]/25'
                  : 'bg-[#0E1724] border-slate-700/80 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              <span className="text-sm leading-none">{cat.emoji}</span>
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                isActive ? 'bg-white/20 text-white' : selectedCount > 0 ? 'bg-[#0284C7]/30 text-[#38BDF8]' : 'bg-slate-800 text-slate-600'
              }`}>
                {selectedCount > 0 ? `${selectedCount}/${totalCount}` : totalCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tag Grid */}
      <div>
        <p className="text-[10px] text-slate-600 mb-3 font-bold uppercase tracking-wider">
          {search ? `${filteredTags.length} result${filteredTags.length !== 1 ? 's' : ''} for "${search}"` : `${activeCategoryData?.label} · ${filteredTags.length} tags`}
        </p>

        {filteredTags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-slate-700/60 rounded-2xl">
            <span className="text-3xl mb-3">🔍</span>
            <p className="text-slate-400 font-bold text-sm">No tags match "{search}"</p>
            <button type="button" onClick={() => setSearch('')} className="mt-2 text-xs text-[#0284C7] hover:underline cursor-pointer">
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}>
            {filteredTags.map(tag => {
              const isSelected = selectedTags.includes(tag.label);
              return (
                <motion.button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.label)}
                  whileHover={{ scale: 1.012 }}
                  whileTap={{ scale: 0.985 }}
                  className={`relative flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-[#0284C7]/12 border-[#0284C7] ring-1 ring-[#0284C7]/30 shadow-lg shadow-[#0284C7]/10'
                      : 'bg-[#0E1724] border-slate-700/70 hover:border-slate-500/80 hover:bg-[#131C2E]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-all ${
                    isSelected ? 'bg-[#0284C7]/20' : 'bg-slate-800/80 group-hover:bg-slate-700/60'
                  }`}>
                    {tag.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-tight truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {tag.label}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-1">{tag.desc}</p>
                  </div>
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                        className="shrink-0 w-5 h-5 rounded-full bg-[#0284C7] flex items-center justify-center shadow-md shadow-[#0284C7]/30"
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
        <p className="text-[10px] text-slate-700 font-medium">{ALL_SENSORY_TAGS.length} curated tags · Aman Standard Sensory Intelligence</p>
        {selectedTags.length > 0 && (
          <p className="text-[10px] font-bold text-[#0284C7]">
            {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} active on your listing
          </p>
        )}
      </div>
    </div>
  );
};
