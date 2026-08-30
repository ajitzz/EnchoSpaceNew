import React, { useState, useMemo, useCallback, useRef } from 'react';
import { 
  Search, X, Sparkles, Loader2, Check, Layers,
  Waves, Mountain, Sun, Trees, Compass, Anchor, Flame, Wifi, Utensils, Wine, Coffee, Moon, 
  Dumbbell, Crown, ShieldCheck, Camera, Film, BookOpen, Wind, Bed, Bath, Heart, Zap,
  Activity, Eye, Feather, Droplets, Snowflake, Flower2, Sunrise, Bike, Crosshair, Trophy, 
  Plane, Key, Palette, Laptop, Smartphone, Tv, LucideIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── ICON MAPPING ─────────────────────────────────────────────────────────────

export const getSensoryTagIcon = (tag: string): LucideIcon => {
  const lower = tag.toLowerCase().trim();

  // Nature & Views
  if (lower.includes('ocean') || lower.includes('sea') || lower.includes('waves') || lower.includes('beach') || lower.includes('reef')) return Waves;
  if (lower.includes('waterfall') || lower.includes('hydrotherapy') || lower.includes('droplet')) return Droplets;
  if (lower.includes('river') || lower.includes('backwater') || lower.includes('boat') || lower.includes('sailing') || lower.includes('kayak')) return Anchor;
  if (lower.includes('mountain') || lower.includes('peak') || lower.includes('himalayan') || lower.includes('cliff') || lower.includes('rock climbing')) return Mountain;
  if (lower.includes('sunrise') || lower.includes('dawn')) return Sunrise;
  if (lower.includes('sunset') || lower.includes('dunes') || lower.includes('sun') || lower.includes('paddy')) return Sun;
  if (lower.includes('forest') || lower.includes('jungle') || lower.includes('canopy') || lower.includes('trees') || lower.includes('tree')) return Trees;
  if (lower.includes('tea') || lower.includes('spa') || lower.includes('aromatherapy') || lower.includes('flower') || lower.includes('botanical') || lower.includes('meditation')) return Flower2;
  if (lower.includes('star') || lower.includes('stargazing') || lower.includes('night') || lower.includes('moon') || lower.includes('sky')) return Moon;

  // Wellness
  if (lower.includes('pool') || lower.includes('infinity') || lower.includes('swim')) return Waves;
  if (lower.includes('jacuzzi') || lower.includes('bath') || lower.includes('tub')) return Bath;
  if (lower.includes('cold plunge') || lower.includes('ice') || lower.includes('snow')) return Snowflake;
  if (lower.includes('sauna') || lower.includes('steam') || lower.includes('fire') || lower.includes('bonfire') || lower.includes('bbq')) return Flame;
  if (lower.includes('yoga') || lower.includes('ayurvedic') || lower.includes('healing')) return Activity;
  if (lower.includes('fitness') || lower.includes('trainer') || lower.includes('gym') || lower.includes('workout')) return Dumbbell;
  if (lower.includes('consultation') || lower.includes('childcare') || lower.includes('nanny') || lower.includes('care')) return Heart;
  if (lower.includes('feather') || lower.includes('ayurveda')) return Feather;

  // Culinary
  if (lower.includes('chef') || lower.includes('dining') || lower.includes('culinary') || lower.includes('restaurant') || lower.includes('tasting') || lower.includes('farm-to-table')) return Utensils;
  if (lower.includes('wine') || lower.includes('cellar') || lower.includes('sommelier') || lower.includes('cocktail') || lower.includes('bar') || lower.includes('mixology') || lower.includes('minibar')) return Wine;
  if (lower.includes('coffee') || lower.includes('breakfast') || lower.includes('espresso') || lower.includes('cafe')) return Coffee;

  // Connectivity
  if (lower.includes('wifi') || lower.includes('internet') || lower.includes('fiber') || lower.includes('starlink') || lower.includes('speed')) return Wifi;
  if (lower.includes('studio') || lower.includes('work') || lower.includes('desk') || lower.includes('office') || lower.includes('laptop')) return Laptop;
  if (lower.includes('smart') || lower.includes('automation') || lower.includes('app') || lower.includes('control')) return Smartphone;
  if (lower.includes('video') || lower.includes('conferencing') || lower.includes('meeting') || lower.includes('screen')) return Tv;
  if (lower.includes('isp') || lower.includes('backup') || lower.includes('power')) return Zap;

  // Atmosphere
  if (lower.includes('silence') || lower.includes('wind') || lower.includes('breeze') || lower.includes('pavilion') || lower.includes('open-air') || lower.includes('acoustic')) return Wind;

  // Leisure
  if (lower.includes('tennis') || lower.includes('court') || lower.includes('golf') || lower.includes('trophy')) return Trophy;
  if (lower.includes('cycling') || lower.includes('bike') || lower.includes('mtb')) return Bike;
  if (lower.includes('archery') || lower.includes('target')) return Crosshair;
  if (lower.includes('bird') || lower.includes('watching') || lower.includes('sight') || lower.includes('view')) return Eye;
  if (lower.includes('trek') || lower.includes('trail') || lower.includes('hiking') || lower.includes('walk') || lower.includes('tour') || lower.includes('immersion')) return Compass;

  // Service & Exclusivity
  if (lower.includes('butler') || lower.includes('vip') || lower.includes('presidential') || lower.includes('exclusive')) return Crown;
  if (lower.includes('transfer') || lower.includes('airport') || lower.includes('helipad') || lower.includes('plane') || lower.includes('helicopter')) return Plane;
  if (lower.includes('privacy') || lower.includes('security') || lower.includes('gated')) return ShieldCheck;
  if (lower.includes('concierge') || lower.includes('key')) return Key;

  // Experiences
  if (lower.includes('artisan') || lower.includes('craft') || lower.includes('workshop') || lower.includes('art')) return Palette;
  if (lower.includes('photo') || lower.includes('camera')) return Camera;
  if (lower.includes('cinema') || lower.includes('theater') || lower.includes('screening')) return Film;
  if (lower.includes('library') || lower.includes('reading') || lower.includes('book')) return BookOpen;
  if (lower.includes('bed') || lower.includes('suite') || lower.includes('room')) return Bed;

  return Sparkles;
};

// ─── TAG METADATA ─────────────────────────────────────────────────────────────

interface SensoryTagData {
  id: string;
  label: string;
  category: string;
  desc: string;
}

export const SENSORY_CATEGORIES = [
  { id: 'all',          label: 'All Tags',          icon: Sparkles },
  { id: 'nature',       label: 'Nature & Views',    icon: Trees },
  { id: 'wellness',     label: 'Wellness & Spa',    icon: Activity },
  { id: 'culinary',     label: 'Culinary',          icon: Utensils },
  { id: 'connectivity', label: 'Connectivity',      icon: Wifi },
  { id: 'atmosphere',   label: 'Atmosphere',        icon: Wind },
  { id: 'leisure',      label: 'Leisure & Sport',   icon: Trophy },
  { id: 'service',      label: 'Service',           icon: Crown },
  { id: 'experiences',  label: 'Experiences',       icon: Palette },
];

export const ALL_SENSORY_TAGS: SensoryTagData[] = [
  // Nature & Views
  { id: 'ocean-waves',           label: 'Ocean Waves',             category: 'nature',       desc: 'Sounds & sights of the open ocean' },
  { id: 'mountain-view',         label: 'Panoramic Mountain View', category: 'nature',       desc: '360° mountain vistas' },
  { id: 'valley-sunrise',        label: 'Valley Sunrise',          category: 'nature',       desc: 'Unobstructed sunrise from the valley' },
  { id: 'forest-canopy',         label: 'Forest Canopy',           category: 'nature',       desc: 'Immersive forest surroundings' },
  { id: 'desert-dunes',          label: 'Desert Dunes Vista',      category: 'nature',       desc: 'Sweeping desert landscape' },
  { id: 'backwater-views',       label: 'Backwater Views',         category: 'nature',       desc: 'Tranquil serene waters' },
  { id: 'waterfall',             label: 'Waterfall Proximity',     category: 'nature',       desc: 'Walk to a natural waterfall' },
  { id: 'tea-estate',            label: 'Tea Estate Vista',        category: 'nature',       desc: 'Manicured tea garden views' },
  { id: 'stargazing',            label: 'Stargazing Sky',          category: 'nature',       desc: 'Unpolluted dark sky access' },
  { id: 'himalayan-peaks',       label: 'Himalayan Peaks',         category: 'nature',       desc: 'Views of the Himalayas' },
  { id: 'river-frontage',        label: 'River Frontage',          category: 'nature',       desc: 'Direct river access' },
  { id: 'cliff-top',             label: 'Cliff-Top Perch',         category: 'nature',       desc: 'Dramatic elevated position' },
  { id: 'paddy-field',           label: 'Paddy Field Views',       category: 'nature',       desc: 'Serene rural landscape' },
  { id: 'coral-reef',            label: 'Coral Reef Access',       category: 'nature',       desc: 'Snorkeling at the doorstep' },
  { id: 'jungle-sounds',         label: 'Jungle Sounds',           category: 'nature',       desc: 'Immersive tropical jungle ambiance' },

  // Wellness & Spa
  { id: 'infinity-pool',         label: 'Heated Infinity Pool',    category: 'wellness',     desc: 'Temperature-controlled infinity pool' },
  { id: 'private-jacuzzi',       label: 'Private Jacuzzi',         category: 'wellness',     desc: 'In-room or private jacuzzi' },
  { id: 'invilla-spa',           label: 'In-Villa Spa Treatments', category: 'wellness',     desc: 'Therapist visits on demand' },
  { id: 'yoga-deck',             label: 'Yoga Deck',               category: 'wellness',     desc: 'Dedicated outdoor yoga platform' },
  { id: 'meditation-garden',     label: 'Meditation Garden',       category: 'wellness',     desc: 'Curated mindfulness garden' },
  { id: 'ayurvedic',             label: 'Ayurvedic Therapies',     category: 'wellness',     desc: 'Traditional Ayurveda on-site' },
  { id: 'cold-plunge',           label: 'Cold Plunge Pool',        category: 'wellness',     desc: 'Therapeutic cold water immersion' },
  { id: 'steam-sauna',           label: 'Steam & Sauna',           category: 'wellness',     desc: 'Private steam room & sauna' },
  { id: 'hydrotherapy',          label: 'Hydrotherapy Circuit',    category: 'wellness',     desc: 'Multi-station water therapy' },
  { id: 'forest-bathing',        label: 'Forest Bathing Trail',    category: 'wellness',     desc: 'Guided shinrin-yoku walks' },
  { id: 'sunrise-yoga',          label: 'Sunrise Yoga Sessions',   category: 'wellness',     desc: 'Daily guided sunrise yoga' },
  { id: 'wellness-consult',      label: 'Wellness Consultation',   category: 'wellness',     desc: 'Personal wellness advisor on call' },

  // Culinary
  { id: 'private-chef',          label: 'Private Chef Available',  category: 'culinary',     desc: 'On-demand private chef service' },
  { id: 'wine-cellar',           label: 'Wine Cellar Access',      category: 'culinary',     desc: 'Curated sommelier collection' },
  { id: 'farm-to-table',         label: 'Farm-to-Table Dining',    category: 'culinary',     desc: 'Locally sourced gourmet meals' },
  { id: 'tea-garden-tasting',    label: 'Organic Tea Garden',      category: 'culinary',     desc: 'Tea tasting from the estate garden' },
  { id: 'invilla-breakfast',     label: 'In-Villa Breakfast',      category: 'culinary',     desc: 'Private butler-served breakfast' },
  { id: 'poolside-dining',       label: 'Poolside Dining',         category: 'culinary',     desc: 'Al fresco dining at the pool' },
  { id: 'bonfire-bbq',           label: 'Bonfire BBQ Setup',       category: 'culinary',     desc: 'Outdoor firepit BBQ evenings' },
  { id: 'artisan-coffee',        label: 'Artisan Coffee Bar',      category: 'culinary',     desc: 'Specialty micro-roasted coffee bar' },
  { id: 'tasting-menu',          label: 'Tasting Menu Experience', category: 'culinary',     desc: 'Multi-course curated dining' },
  { id: 'mixology-bar',          label: 'Mixology Bar',            category: 'culinary',     desc: 'In-house craft cocktail bar' },

  // Connectivity
  { id: '1gbps-wifi',            label: '1 Gbps Fiber WiFi',       category: 'connectivity', desc: 'Enterprise-grade fiber internet' },
  { id: 'starlink-wifi',         label: 'Starlink Satellite WiFi', category: 'connectivity', desc: 'SpaceX Starlink connectivity' },
  { id: 'work-studio',           label: 'Dedicated Work Studio',   category: 'connectivity', desc: 'Soundproof home office setup' },
  { id: 'smart-home',            label: 'Smart Home Controls',     category: 'connectivity', desc: 'App-controlled room systems' },
  { id: 'video-conf',            label: 'Video Conferencing Setup',category: 'connectivity', desc: 'Pro A/V for virtual meetings' },
  { id: 'dual-isp',              label: 'Dual ISP Backup Internet',category: 'connectivity', desc: 'Zero-downtime connectivity' },

  // Atmosphere
  { id: 'fireplace',             label: 'Artisan Fireplace',       category: 'atmosphere',   desc: 'Handcrafted stone fireplace' },
  { id: 'himalayan-silence',     label: 'Himalayan Silence',       category: 'atmosphere',   desc: 'Zero ambient noise environment' },
  { id: 'rainforest-soundscape', label: 'Rainforest Soundscape',   category: 'atmosphere',   desc: 'Natural rain & jungle audio immersion' },
  { id: 'candlelit-courtyards',  label: 'Candlelit Courtyards',    category: 'atmosphere',   desc: 'Romantic evening ambiance' },
  { id: 'acoustic-arch',         label: 'Acoustic Architecture',   category: 'atmosphere',   desc: 'Sound-engineered interior design' },
  { id: 'circadian-lighting',    label: 'Circadian Lighting System',category:'atmosphere',   desc: 'Biologically tuned lighting' },
  { id: 'aromatherapy',          label: 'Aromatherapy Diffusion',  category: 'atmosphere',   desc: 'Scent-designed living spaces' },
  { id: 'heritage-arch',         label: 'Heritage Architecture',   category: 'atmosphere',   desc: 'Restored historical structure' },
  { id: 'minimalist-zen',        label: 'Minimalist Zen Design',   category: 'atmosphere',   desc: 'Japanese-influenced interiors' },
  { id: 'open-air-pavilions',    label: 'Open-Air Pavilions',      category: 'atmosphere',   desc: 'Ventilated outdoor living spaces' },

  // Leisure & Sport
  { id: 'tennis-court',          label: 'Private Tennis Court',    category: 'leisure',      desc: 'Full-size private court' },
  { id: 'trekking-routes',       label: 'Nature Trekking Routes',  category: 'leisure',      desc: 'Guided & self-guided trails' },
  { id: 'kayaking',              label: 'Kayaking & Canoeing',     category: 'leisure',      desc: 'On-site water sports' },
  { id: 'horse-riding',          label: 'Horse Riding Trails',     category: 'leisure',      desc: 'Curated equestrian experience' },
  { id: 'archery-range',         label: 'Archery Range',           category: 'leisure',      desc: 'Private archery range setup' },
  { id: 'mountain-cycling',      label: 'Mountain Cycling Paths',  category: 'leisure',      desc: 'Curated MTB trail network' },
  { id: 'bird-watching',         label: 'Bird Watching Post',      category: 'leisure',      desc: 'Rare species spotting zones' },
  { id: 'sunset-sailing',        label: 'Sunset Sailing',          category: 'leisure',      desc: 'Private sail at golden hour' },
  { id: 'golf-proximity',        label: 'Golf Proximity',          category: 'leisure',      desc: 'Championship golf course access' },
  { id: 'rock-climbing',         label: 'Rock Climbing Wall',      category: 'leisure',      desc: 'On-property climbing wall' },

  // Service & Exclusivity
  { id: 'butler-service',        label: '24/7 Butler Service',     category: 'service',      desc: 'Dedicated personal butler' },
  { id: 'airport-transfer',      label: 'Private Airport Transfer',category: 'service',      desc: 'Chauffeur airport pickup & drop' },
  { id: 'helipad',               label: 'Helipad Access',          category: 'service',      desc: 'On-property helicopter landing pad' },
  { id: 'celebrity-privacy',     label: 'Celebrity-Grade Privacy', category: 'service',      desc: 'Discreet, security-forward property' },
  { id: 'curated-minibar',       label: 'Curated Minibar',         category: 'service',      desc: 'Premium spirits & wines selection' },
  { id: 'personal-trainer',      label: 'Personal Trainer',        category: 'service',      desc: 'In-villa fitness coaching' },
  { id: 'childcare',             label: 'Childcare Available',     category: 'service',      desc: 'Professional nanny service' },
  { id: 'dedicated-concierge',   label: 'Dedicated Concierge',     category: 'service',      desc: '24/7 guest experience manager' },

  // Experiences
  { id: 'cultural-walks',        label: 'Cultural Immersion Walks',category: 'experiences',  desc: 'Guided local culture & heritage tours' },
  { id: 'artisan-workshops',     label: 'Local Artisan Workshops', category: 'experiences',  desc: 'Craft & art making sessions' },
  { id: 'photo-tours',           label: 'Sunset Photography Tours',category: 'experiences',  desc: 'Expert-guided landscape photo walks' },
  { id: 'guided-stargazing',     label: 'Guided Stargazing',       category: 'experiences',  desc: 'Telescope-assisted star tours' },
  { id: 'private-boat-tours',    label: 'Private Boat Tours',      category: 'experiences',  desc: 'Chartered water excursions' },
  { id: 'cinema-room',           label: 'Private Cinema Room',     category: 'experiences',  desc: 'In-villa screening theater' },
  { id: 'library-nook',          label: 'Library & Reading Nook',  category: 'experiences',  desc: 'Curated book collection & reading lounge' },
  { id: 'bonfire-storytelling',  label: 'Bonfire Storytelling Nights',category:'experiences',desc: 'Guided evening fire gatherings' },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────

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
  const [customTagInput, setCustomTagInput] = useState('');
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

  const handleAddCustomTag = useCallback(() => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    if (!selectedTags.includes(trimmed)) {
      onChange([...selectedTags, trimmed]);
    }
    setCustomTagInput('');
  }, [customTagInput, selectedTags, onChange]);

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
        setAiError('AI could not find matching tags. Add more details to your description.');
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
    <div className="space-y-6 rounded-3xl bg-[#0C1322] border border-slate-700/70 p-5 sm:p-7 shadow-2xl">

      {/* ── 1. HEADER WITH AMAN BADGE & AI TRIGGER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-7 h-7 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-[#0284C7]">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Sensory Atmosphere Deck
            </h3>
            <span className="text-[10px] font-mono font-black text-[#0284C7] uppercase tracking-widest bg-sky-950/60 border border-sky-500/30 px-2.5 py-0.5 rounded-full">
              AMAN STANDARD
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Curate signature atmospheric qualities. The icons and cards below mirror the exact visual aesthetic presented to high-net-worth guests.
          </p>
        </div>

        {/* AI Suggest Button */}
        <button
          type="button"
          onClick={handleAiSuggest}
          disabled={isSuggesting}
          className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer shadow-lg disabled:opacity-60 ${
            justSuggested
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-gradient-to-r from-purple-900/60 via-indigo-900/50 to-sky-900/60 border-sky-500/40 hover:border-sky-400 text-sky-200 hover:text-white shadow-sky-900/20 hover:scale-[1.02]'
          }`}
        >
          {isSuggesting ? (
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          ) : justSuggested ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-sky-400" />
          )}
          <span>{isSuggesting ? 'Analyzing Listing…' : justSuggested ? 'Tags Auto-Selected!' : 'AI Curate Deck'}</span>
        </button>
      </div>

      {/* AI Error Alert */}
      <AnimatePresence>
        {aiError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-amber-300 text-xs font-medium"
          >
            <span>⚠️</span><span>{aiError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2. LIVE GUEST-FACING DECK PREVIEW (MATCHING SCREENSHOT 100%) ── */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
              Live Guest View Preview ({selectedTags.length} Active)
            </span>
          </div>
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] font-bold text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Reset All
            </button>
          )}
        </div>

        {selectedTags.length === 0 ? (
          <div className="py-6 text-center border-2 border-dashed border-slate-800 rounded-xl">
            <p className="text-xs text-slate-500 font-medium">
              No sensory tags selected yet. Click tags below or hit <strong className="text-sky-400">"AI Curate Deck"</strong>.
            </p>
          </div>
        ) : (
          /* High-Fidelity Aman Standard Cards matching user's screenshot */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {selectedTags.map(tag => {
              const IconComp = getSensoryTagIcon(tag);
              return (
                <motion.div
                  key={tag}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center justify-between gap-3 group relative"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-[#F0F9FF] border border-[#E0F2FE] flex items-center justify-center shrink-0 text-[#0284C7] shadow-xs">
                      <IconComp className="w-5 h-5 stroke-[1.8]" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-zinc-900 tracking-tight leading-snug truncate">
                      {tag}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="w-6 h-6 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                    title="Remove Tag"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. SEARCH & CUSTOM INPUT BAR ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search */}
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search 80+ Aman standard tags (e.g. 'infinity pool', 'chef', 'mountain', 'wifi')…"
            className="w-full bg-[#141E30] border border-slate-700/80 hover:border-slate-600 focus:border-[#0284C7] rounded-2xl pl-11 pr-10 py-3 text-white text-xs font-semibold placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7]/30 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); searchRef.current?.focus(); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-3 h-3 text-slate-300" />
            </button>
          )}
        </div>

        {/* Custom Tag Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customTagInput}
            onChange={e => setCustomTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag(); } }}
            placeholder="Add custom tag…"
            className="flex-1 bg-[#141E30] border border-slate-700/80 hover:border-slate-600 focus:border-[#0284C7] rounded-2xl px-4 py-3 text-white text-xs font-semibold placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0284C7]/30 transition-all"
          />
          <button
            type="button"
            onClick={handleAddCustomTag}
            disabled={!customTagInput.trim()}
            className="px-4 py-3 bg-[#0284C7] hover:bg-[#0284C7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer shrink-0"
          >
            Add
          </button>
        </div>
      </div>

      {/* ── 4. CATEGORY PILLS WITH VECTOR ICONS ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {SENSORY_CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id;
          const CatIcon = cat.icon;
          const totalCount = cat.id === 'all' ? ALL_SENSORY_TAGS.length : ALL_SENSORY_TAGS.filter(t => t.category === cat.id).length;
          const selectedCount = cat.id === 'all'
            ? selectedTags.length
            : selectedTags.filter(t => ALL_SENSORY_TAGS.find(d => d.label === t)?.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#0284C7] border-[#0284C7] text-white shadow-lg shadow-[#0284C7]/20 scale-[1.02]'
                  : 'bg-[#141E30] border-slate-700/80 text-slate-400 hover:border-slate-500 hover:text-white'
              }`}
            >
              <CatIcon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                isActive ? 'bg-white/20 text-white' : selectedCount > 0 ? 'bg-[#0284C7]/30 text-[#38BDF8]' : 'bg-slate-800 text-slate-500'
              }`}>
                {selectedCount > 0 ? `${selectedCount}/${totalCount}` : totalCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 5. SELECTION GRID WITH SIGNATURE CYAN SQUIRCLE BADGES ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <span>{search ? `Results for "${search}" (${filteredTags.length})` : `${activeCategoryData?.label} (${filteredTags.length})`}</span>
          <span className="text-[10px] text-slate-500">Tap to toggle</span>
        </div>

        {filteredTags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-800 rounded-2xl">
            <span className="text-2xl mb-2">🔍</span>
            <p className="text-slate-400 font-bold text-xs">No matching standard tags found for "{search}".</p>
            <p className="text-slate-500 text-[11px] mt-1">You can type and click "Add" to create it as a custom tag.</p>
          </div>
        ) : (
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[440px] overflow-y-auto pr-1.5"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}
          >
            {filteredTags.map(tag => {
              const isSelected = selectedTags.includes(tag.label);
              const TagIcon = getSensoryTagIcon(tag.label);
              return (
                <motion.button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.label)}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className={`relative flex items-center gap-3.5 p-3 rounded-2xl border text-left transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-[#0284C7]/15 border-[#0284C7] ring-1 ring-[#0284C7]/50 shadow-md shadow-[#0284C7]/10'
                      : 'bg-[#141E30] border-slate-700/70 hover:border-slate-500 hover:bg-[#1A263D]'
                  }`}
                >
                  {/* Cyan Squircle Vector Badge */}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                    isSelected 
                      ? 'bg-[#0284C7] text-white shadow-md shadow-[#0284C7]/30 scale-105' 
                      : 'bg-[#0B1322] border border-slate-700/80 text-[#0284C7] group-hover:border-[#0284C7]/50 group-hover:bg-[#0E1A2D]'
                  }`}>
                    <TagIcon className="w-5 h-5 stroke-[1.8]" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-tight truncate ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                      {tag.label}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-1">
                      {tag.desc}
                    </p>
                  </div>

                  {/* Check Indicator */}
                  {isSelected && (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-[#0284C7] flex items-center justify-center text-white shadow-xs">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
