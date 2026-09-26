import React, { useState, useEffect, useId } from 'react';
import {
  Sparkles,
  Target,
  Globe,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  MapPin,
  TrendingUp,
  Search,
  Plus,
  Trash2,
  Check,
  Loader2,
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { useAuth } from '../AuthContext';

interface FeederCorridor {
  id: string;
  region_code: string;
  corridor_name: string;
  source_city: string;
  radius_km: number;
  excluded_local_district: string;
  expected_roas_benchmark: number;
}

interface GodmodeAdsStudioProps {
  campaignId?: number;
  listingId?: number;
  listingTitle?: string;
  listingCity?: string;
  listingPrice?: number;
}

export function GodmodeAdsStudio({
  campaignId = 1,
  listingId = 1,
  listingTitle = 'Wayanad Panoramic Luxury Sanctuary',
  listingCity = 'Wayanad',
  listingPrice = 14500,
}: GodmodeAdsStudioProps) {
  const { addToast } = useToast();
  const { token } = useAuth();

  // Feeder Corridors Catalog
  const [corridors, setCorridors] = useState<FeederCorridor[]>([]);
  const [selectedCorridorIds, setSelectedCorridorIds] = useState<string[]>([]);
  const [customRadii, setCustomRadii] = useState<{ city: string; radiusKm: number; lat: number; lng: number }[]>([]);
  const [excludedDistricts, setExcludedDistricts] = useState<string[]>([listingCity]);

  // Meta Ads Controls
  const [housingSpecialCategory] = useState(true);
  const [metaPlacements, setMetaPlacements] = useState<string[]>([
    'INSTAGRAM_REELS',
    'INSTAGRAM_STORIES',
    'FACEBOOK_FEED',
  ]);
  const [biddingStrategy, setBiddingStrategy] = useState<'TARGET_ROAS' | 'MAX_CONVERSIONS' | 'TARGET_CPA' | 'MAX_CLICKS'>('TARGET_ROAS');
  const [targetRoasFloor, setTargetRoasFloor] = useState<number>(3.8);
  const [targetCpaCents, setTargetCpaCents] = useState<number>(1400);
  const [cpcCeilingCents, setCpcCeilingCents] = useState<number>(150);

  // Google Ads Controls
  const [googleKeywords, setGoogleKeywords] = useState<{ keyword: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD' }[]>([
    { keyword: `[luxury resort in ${listingCity.toLowerCase()}]`, matchType: 'EXACT' },
    { keyword: `"private pool villa in ${listingCity.toLowerCase()}"`, matchType: 'PHRASE' },
    { keyword: `${listingCity.toLowerCase()} weekend getaway`, matchType: 'BROAD' },
  ]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordType, setNewKeywordType] = useState<'EXACT' | 'PHRASE' | 'BROAD'>('EXACT');
  const [negativeKeywords, setNegativeKeywords] = useState<string[]>([
    'cheap homestay',
    'free stay',
    'bus timings',
    'dormitory rooms',
    'government lodge',
  ]);
  const [newNegative, setNewNegative] = useState('');

  // AI Advisory Copilot State
  const [isCopilotRunning, setIsCopilotRunning] = useState(false);
  const [copilotRecommendation, setCopilotRecommendation] = useState<any | null>(null);

  // Persistence State
  const [version, setVersion] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [formulaResolution, setFormulaResolution] = useState<any | null>(null);

  // Generate unique IDs for accessibility
  const roasFloorId = useId();
  const cpaId = useId();
  const cpcId = useId();
  const newKwId = useId();
  const newKwTypeId = useId();
  const newNegId = useId();

  const fetchCorridors = async () => {
    try {
      const res = await fetch('/api/marketing/v2/feeder-corridors/corridors');
      const data = await res.json();
      if (data.success && data.corridors) {
        setCorridors(data.corridors);
        // Default select corridors matching listing city
        const matching = data.corridors.filter(
          (c: FeederCorridor) => c.excluded_local_district.toLowerCase() === listingCity.toLowerCase()
        );
        if (matching.length > 0) {
          setSelectedCorridorIds(matching.map((m: FeederCorridor) => m.id));
        } else {
          setSelectedCorridorIds(data.corridors.slice(0, 3).map((c: FeederCorridor) => c.id));
        }
      }
    } catch {
      // Non-blocking fetch
    }
  };

  const loadTargetingConfig = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/marketing/v2/feeder-corridors/campaigns/${campaignId}/targeting`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.targeting) {
          const t = data.targeting;
          setVersion(t.version || 1);
          if (t.selected_corridor_ids?.length) setSelectedCorridorIds(t.selected_corridor_ids);
          if (t.meta_placements?.length) setMetaPlacements(t.meta_placements);
          if (t.bidding_strategy) setBiddingStrategy(t.bidding_strategy);
          if (t.target_roas_floor) setTargetRoasFloor(Number(t.target_roas_floor));
          if (t.target_cpa_cents) setTargetCpaCents(t.target_cpa_cents);
          if (t.google_search_keywords?.length) setGoogleKeywords(t.google_search_keywords);
          if (t.google_negative_keywords?.length) setNegativeKeywords(t.google_negative_keywords);
          if (t.excluded_districts?.length) setExcludedDistricts(t.excluded_districts);
        }
      }
    } catch {
      // Non-blocking load
    }
  };

  // Load Corridors on Mount
  useEffect(() => {
    fetchCorridors();
    loadTargetingConfig();
  }, [campaignId]);

  // Run AI Copilot
  const runAiCopilot = async () => {
    setIsCopilotRunning(true);
    try {
      const res = await fetch('/api/marketing/v2/feeder-corridors/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          listingId,
          title: listingTitle,
          price: listingPrice,
          city: listingCity,
          budgetCents: 700000,
        }),
      });

      const data = await res.json();
      if (data.success && data.recommendation) {
        setCopilotRecommendation(data.recommendation);
        addToast('AI Copilot Ready', 'Strategic targeting recommendations generated.', 'success');
      } else {
        addToast('AI Notice', 'Unable to fetch AI copilot advice.', 'info');
      }
    } catch (err: any) {
      addToast('Error', err.message || 'AI Copilot failed', 'error');
    } finally {
      setIsCopilotRunning(false);
    }
  };

  // Apply AI Recommendations
  const applyAiRecommendations = () => {
    if (!copilotRecommendation) return;

    if (copilotRecommendation.recommendedCorridors?.length) {
      setSelectedCorridorIds(copilotRecommendation.recommendedCorridors.map((c: any) => c.id));
    }
    if (copilotRecommendation.mandatoryExclusions?.length) {
      setExcludedDistricts(copilotRecommendation.mandatoryExclusions);
    }
    if (copilotRecommendation.recommendedPlacements?.length) {
      setMetaPlacements(copilotRecommendation.recommendedPlacements.map((p: any) => p.placement));
    }
    if (copilotRecommendation.recommendedBidding) {
      setTargetRoasFloor(copilotRecommendation.recommendedBidding.roasFloor);
      setTargetCpaCents(copilotRecommendation.recommendedBidding.targetCpaCents);
      setCpcCeilingCents(copilotRecommendation.recommendedBidding.cpcCeilingCents);
    }
    if (copilotRecommendation.googleKeywordPlan?.negativeKeywords) {
      setNegativeKeywords(copilotRecommendation.googleKeywordPlan.negativeKeywords);
    }

    addToast('Applied', 'AI advisory settings populated into God-Mode controls.', 'success');
  };

  // Save God-Mode Targeting
  const handleSaveTargeting = async () => {
    setIsSaving(true);
    try {
      const payload = {
        housingSpecialCategory,
        metaPlacements,
        selectedCorridorIds,
        customGeoRadii: customRadii,
        excludedDistricts,
        biddingStrategy,
        targetRoasFloor,
        cpcCeilingCents,
        targetCpaCents,
        googleSearchKeywords: googleKeywords,
        googleNegativeKeywords: negativeKeywords,
        googleSitelinks: [],
        aiCopilotRecommendation: copilotRecommendation || undefined,
      };

      const res = await fetch(`/api/marketing/v2/feeder-corridors/campaigns/${campaignId}/targeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to commit targeting configuration');
      }

      setVersion(data.version || version + 1);
      addToast('Targeting Committed', `God-Mode targeting version ${data.version || version + 1} locked.`, 'success');
    } catch (err: any) {
      addToast('Save Error', err.message || 'Error saving targeting', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCorridor = (id: string) => {
    setSelectedCorridorIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const togglePlacement = (placement: string) => {
    setMetaPlacements((prev) =>
      prev.includes(placement) ? prev.filter((p) => p !== placement) : [...prev, placement]
    );
  };

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    setGoogleKeywords((prev) => [...prev, { keyword: newKeyword.trim(), matchType: newKeywordType }]);
    setNewKeyword('');
  };

  const removeKeyword = (idx: number) => {
    setGoogleKeywords((prev) => prev.filter((_, i) => i !== idx));
  };

  const addNegativeKeyword = () => {
    if (!newNegative.trim()) return;
    setNegativeKeywords((prev) => [...prev, newNegative.trim()]);
    setNewNegative('');
  };

  const removeNegativeKeyword = (idx: number) => {
    setNegativeKeywords((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm mb-8">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-200 dark:border-neutral-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
              Admin God-Mode Console
            </span>
            <span className="text-xs text-zinc-500 font-mono">v{version} · Campaign #{campaignId}</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
            Meta & Google Ads Manager Parity Studio
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Granular Feeder Corridors, mandatory local exclusions, and AI Advisory Copilot targeting for{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">{listingTitle}</strong> ({listingCity}).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runAiCopilot}
            disabled={isCopilotRunning}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            {isCopilotRunning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>Ask AI Copilot</span>
          </button>

          <button
            onClick={handleSaveTargeting}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            <span>Commit Targeting (v{version})</span>
          </button>
        </div>
      </div>

      {/* AI Copilot Advisory Recommendation Banner */}
      {copilotRecommendation && (
        <div className="mt-6 p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-purple-600 dark:text-purple-400" size={18} />
              <h3 className="text-sm font-bold text-purple-900 dark:text-purple-200">
                AI Advisory Copilot Recommendation ({Math.round(copilotRecommendation.confidenceScore * 100)}% Confidence)
              </h3>
            </div>
            <button
              onClick={applyAiRecommendations}
              className="text-xs font-semibold px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Apply All Recommendations
            </button>
          </div>
          <p className="text-xs text-purple-800 dark:text-purple-300 mt-2">
            {copilotRecommendation.pacingPointers?.rationale}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
            <div className="bg-white/80 dark:bg-neutral-900/60 p-2.5 rounded-lg border border-purple-100 dark:border-purple-900">
              <span className="text-zinc-500 block">Recommended Placements</span>
              <strong className="text-zinc-900 dark:text-white">70% Reels / 20% Stories</strong>
            </div>
            <div className="bg-white/80 dark:bg-neutral-900/60 p-2.5 rounded-lg border border-purple-100 dark:border-purple-900">
              <span className="text-zinc-500 block">Target ROAS Floor</span>
              <strong className="text-zinc-900 dark:text-white">
                {copilotRecommendation.recommendedBidding?.roasFloor}x Benchmark
              </strong>
            </div>
            <div className="bg-white/80 dark:bg-neutral-900/60 p-2.5 rounded-lg border border-purple-100 dark:border-purple-900">
              <span className="text-zinc-500 block">Optimal Daily Pacing</span>
              <strong className="text-zinc-900 dark:text-white">
                ₹{Math.round(copilotRecommendation.pacingPointers?.recommendedDailyBudgetCents / 100)}/day
              </strong>
            </div>
            <div className="bg-white/80 dark:bg-neutral-900/60 p-2.5 rounded-lg border border-purple-100 dark:border-purple-900">
              <span className="text-zinc-500 block">Suppressed Negative Keywords</span>
              <strong className="text-zinc-900 dark:text-white">
                {copilotRecommendation.googleKeywordPlan?.negativeKeywords?.length || 0} terms
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Meta vs Google Ads Parity Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        {/* ================================================================= */}
        {/* Left Column: Meta Ads Manager Parity & Feeder Corridors */}
        {/* ================================================================= */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-neutral-800">
            <Target className="text-blue-600 dark:text-blue-400" size={18} />
            <h3 className="font-bold text-zinc-900 dark:text-white">Meta Ads Manager Controls</h3>
          </div>

          {/* Housing Special Ad Category (HEC) */}
          <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="text-blue-600 dark:text-blue-400" size={20} />
              <div>
                <strong className="text-xs font-bold text-blue-900 dark:text-blue-200 block">
                  Housing Special Ad Category (HEC) Active
                </strong>
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  Strictly compliant with Meta non-discrimination policies (min 15km radii, no age/gender gating).
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded">
              LOCKED
            </span>
          </div>

          {/* Feeder Corridors Selection */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-2">
              Select High-Converting Feeder Corridors ({selectedCorridorIds.length} Active)
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {corridors.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggleCorridor(c.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                    selectedCorridorIds.includes(c.id)
                      ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                      : 'bg-zinc-50 dark:bg-neutral-800/40 border-zinc-200 dark:border-neutral-800 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedCorridorIds.includes(c.id)}
                      onChange={() => toggleCorridor(c.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <strong className="text-zinc-900 dark:text-zinc-100 block">{c.corridor_name}</strong>
                      <span className="text-zinc-500">
                        {c.source_city} ({c.radius_km}km radius) · Target: Excludes {c.excluded_local_district}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 font-bold text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-md">
                    {c.expected_roas_benchmark}x ROAS
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mandatory Local District Exclusion */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-1">
              Mandatory Local Exclusion Zone (Zero Local Spend)
            </label>
            <p className="text-xs text-zinc-500 mb-2">
              Residents inside the destination district boundary are excluded to prevent wasting ad budget on non-travelers.
            </p>
            <div className="flex flex-wrap gap-2">
              {excludedDistricts.map((dist, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900"
                >
                  <AlertTriangle size={12} />
                  <span>Exclude: {dist} District</span>
                </span>
              ))}
            </div>
          </div>

          {/* Placements Multi-Select */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-2">
              Placements Configuration
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { key: 'INSTAGRAM_REELS', label: 'Instagram Reels (9:16 Vertical Video)' },
                { key: 'INSTAGRAM_STORIES', label: 'Instagram Stories' },
                { key: 'FACEBOOK_FEED', label: 'Facebook Mobile Feed' },
                { key: 'FACEBOOK_DESKTOP_FEED', label: 'Facebook Desktop Feed' },
              ].map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => togglePlacement(p.key)}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between ${
                    metaPlacements.includes(p.key)
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 text-blue-900 dark:text-blue-100 font-semibold'
                      : 'bg-zinc-50 dark:bg-neutral-800/40 border-zinc-200 dark:border-neutral-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <span>{p.label}</span>
                  {metaPlacements.includes(p.key) && <Check size={14} className="text-blue-600" />}
                </button>
              ))}
            </div>
          </div>

          {/* Bidding Strategy & ROAS Floor Slider */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-neutral-800/40 border border-zinc-200 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor={roasFloorId} className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Target ROAS Floor: {targetRoasFloor}x
              </label>
              <span className="text-xs text-emerald-600 font-bold">Auto-Throttle Below Floor</span>
            </div>
            <input
              id={roasFloorId}
              type="range"
              min="2.0"
              max="6.0"
              step="0.1"
              value={targetRoasFloor}
              onChange={(e) => setTargetRoasFloor(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>2.0x (Volume Pacing)</span>
              <span>3.8x (Balanced Standard)</span>
              <span>6.0x (Strict Return)</span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* Right Column: Google Ads Manager Parity & Keywords */}
        {/* ================================================================= */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-neutral-800">
            <Globe className="text-amber-600 dark:text-amber-400" size={18} />
            <h3 className="font-bold text-zinc-900 dark:text-white">Google Ads Manager Controls</h3>
          </div>

          {/* Target CPA & CPC Ceiling Controls */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-neutral-800/40 border border-zinc-200 dark:border-neutral-800">
              <label htmlFor={cpaId} className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Target CPA (Cost/Acq)
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">₹</span>
                <input
                  id={cpaId}
                  type="number"
                  value={targetCpaCents}
                  onChange={(e) => setTargetCpaCents(Number(e.target.value))}
                  className="w-full bg-transparent font-bold text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-neutral-800/40 border border-zinc-200 dark:border-neutral-800">
              <label htmlFor={cpcId} className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Max CPC Ceiling
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">₹</span>
                <input
                  id={cpcId}
                  type="number"
                  value={cpcCeilingCents}
                  onChange={(e) => setCpcCeilingCents(Number(e.target.value))}
                  className="w-full bg-transparent font-bold text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Google Search Keywords */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-2">
              Google Match Keywords ({googleKeywords.length})
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {googleKeywords.map((kw, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-neutral-800/40 border border-zinc-200 dark:border-neutral-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">{kw.keyword}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-zinc-200 dark:bg-neutral-700 rounded text-zinc-600 dark:text-zinc-300">
                      {kw.matchType}
                    </span>
                  </div>
                  <button
                    onClick={() => removeKeyword(i)}
                    className="text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Keyword Input */}
            <div className="flex items-center gap-2 mt-2.5">
              <label htmlFor={newKwId} className="sr-only">New Keyword</label>
              <input
                id={newKwId}
                type="text"
                placeholder="e.g. [luxury resort in wayanad]"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white"
              />
              <label htmlFor={newKwTypeId} className="sr-only">Match Type</label>
              <select
                id={newKwTypeId}
                value={newKeywordType}
                onChange={(e) => setNewKeywordType(e.target.value as any)}
                className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-zinc-700 dark:text-zinc-300"
              >
                <option value="EXACT">Exact []</option>
                <option value="PHRASE">Phrase ""</option>
                <option value="BROAD">Broad</option>
              </select>
              <button
                type="button"
                onClick={addKeyword}
                className="p-1.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-900"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Google Negative Keywords Suppression */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-1">
              Negative Keywords Suppression (Prevents Junk Traffic)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {negativeKeywords.map((neg, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-zinc-100 dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-700"
                >
                  <span>-{neg}</span>
                  <button onClick={() => removeNegativeKeyword(i)} className="hover:text-red-500">
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor={newNegId} className="sr-only">New Negative Keyword</label>
              <input
                id={newNegId}
                type="text"
                placeholder="Add negative keyword (e.g. cheap rooms)"
                value={newNegative}
                onChange={(e) => setNewNegative(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNegativeKeyword())}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white"
              />
              <button
                type="button"
                onClick={addNegativeKeyword}
                className="px-3 py-1.5 text-xs font-semibold bg-zinc-200 hover:bg-zinc-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-zinc-800 dark:text-zinc-200 rounded-lg"
              >
                Add Suppression
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
