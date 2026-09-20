import { hasAsciiControl } from '../intentionalText.js';
import { GoogleAdsClient, type GoogleGeoTarget } from '../providers/google/GoogleAdsClient.js';
import { MarketingError, type CampaignDraft } from './domain.js';

export interface GoogleLanguage { resourceName: string; name: string; code: string }
type Client = Pick<GoogleAdsClient, 'getCustomerId' | 'searchStream' | 'suggestGeoTargets'>;
const languagePattern = /^languageConstants\/[1-9]\d{0,19}$/;
const geoPattern = /^geoTargetConstants\/[1-9]\d{0,19}$/;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 500 && !hasAsciiControl(value, true);

/** Cache only provider public metadata. No host financial or audience membership data is cached. */
export class MarketingTargetingService {
  private readonly cache = new Map<string, { until: number; value: unknown }>();
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly client: Client = new GoogleAdsClient(), private readonly metaCountries: readonly string[] = [], private readonly now = Date.now) {}

  private async cached<T>(key: string, work: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.until > this.now()) return structuredClone(hit.value) as T;
    const inflight = this.pending.get(key);
    if (inflight) return structuredClone(await inflight) as T;
    if (this.pending.size >= 16) throw new MarketingError('TARGETING_BUSY', 'Targeting lookup is busy. Try again shortly.', 503);
    const task = work(); this.pending.set(key, task);
    try {
      const value = await task;
      if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { until: this.now() + 15 * 60_000, value });
      return structuredClone(value);
    } finally { this.pending.delete(key); }
  }
  async locations(query: string, countryCode?: string): Promise<GoogleGeoTarget[]> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80 || hasAsciiControl(query, true) || countryCode !== undefined && !/^[A-Z]{2}$/.test(countryCode)) throw new MarketingError('TARGETING_INPUT_INVALID', 'Enter a location name between 2 and 80 characters.', 422);
    const q = query.trim();
    return this.cached(`geo:${countryCode || ''}:${q}`, async () => (await this.client.suggestGeoTargets({ names: [q], ...(countryCode ? { countryCode } : {}) })).filter(v=>v.canonicalName.length<=120).slice(0, 30));
  }
  async languages(): Promise<GoogleLanguage[]> {
    return this.cached('languages', async () => {
      const rows = await this.client.searchStream(this.client.getCustomerId(), 'SELECT language_constant.resource_name, language_constant.name, language_constant.code, language_constant.targetable FROM language_constant WHERE language_constant.targetable = TRUE LIMIT 1000');
      if (rows.length > 1000) throw new MarketingError('TARGETING_RESPONSE_INVALID', 'Google returned invalid language options.', 502);
      const result = new Map<string, GoogleLanguage>();
      for (const row of rows) {
        const v = row?.languageConstant;
        if (!v || !text(v.resourceName) || !languagePattern.test(v.resourceName) || !text(v.name) || !text(v.code) || v.targetable !== true) throw new MarketingError('TARGETING_RESPONSE_INVALID', 'Google returned invalid language options.', 502);
        const entry = { resourceName: v.resourceName, name: v.name, code: v.code };
        if (result.has(entry.resourceName) && JSON.stringify(result.get(entry.resourceName)) !== JSON.stringify(entry)) throw new MarketingError('TARGETING_RESPONSE_INVALID', 'Google returned conflicting language options.', 502);
        result.set(entry.resourceName, entry);
      }
      return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  async resolve(geoNames: string[], languageNames: string[]): Promise<{ locations: GoogleGeoTarget[]; languages: GoogleLanguage[] }> {
    if (!Array.isArray(geoNames) || !Array.isArray(languageNames) || geoNames.length > 20 || languageNames.length > 10 || geoNames.some(v => typeof v !== 'string' || !geoPattern.test(v)) || languageNames.some(v => typeof v !== 'string' || !languagePattern.test(v)) || new Set(geoNames).size !== geoNames.length || new Set(languageNames).size !== languageNames.length) throw new MarketingError('TARGETING_INPUT_INVALID', 'Choose distinct supported locations and languages.', 422);
    const [locations, languages] = await Promise.all([
      geoNames.length ? this.cached(`resolve:${[...geoNames].sort().join(',')}`, () => this.client.suggestGeoTargets({ resourceNames: geoNames })) : Promise.resolve([]),
      languageNames.length ? this.languages() : Promise.resolve([]),
    ]);
    const orderedGeo = geoNames.map(id => locations.find(v => v.resourceName === id));
    const orderedLanguage = languageNames.map(id => languages.find(v => v.resourceName === id));
    if (orderedGeo.some(v => !v || v.canonicalName.length>120) || orderedLanguage.some(v => !v)) throw new MarketingError('TARGETING_CHANGED', 'A selected location or language is no longer available. Choose current options before saving.', 422);
    return { locations: orderedGeo as GoogleGeoTarget[], languages: orderedLanguage as GoogleLanguage[] };
  }
  async validateDraft(draft: CampaignDraft) {
    if (draft.provider === 'META') {
      if (draft.locations.some(code => !this.metaCountries.includes(code))) throw new MarketingError('META_COUNTRY_NOT_ENABLED', 'Choose audience countries enabled for the Encho account.', 422);
      return;
    }
    if (!draft.googleSearch) throw new MarketingError('SEARCH_TARGETING_REQUIRED', 'Choose Google locations, languages and Search creative before saving.', 422);
    const verified = await this.resolve(draft.googleSearch.geoTargetConstants, draft.googleSearch.languageConstants);
    if (verified.locations.length !== draft.locations.length || verified.locations.some((geo, index) => geo.canonicalName !== draft.locations[index])) throw new MarketingError('TARGETING_LABEL_MISMATCH', 'Audience names must match the Google locations you selected. Refresh the audience selection.', 422);
  }
}
