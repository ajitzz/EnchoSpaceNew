import type {StrategySelection} from '../../src/shared/adtech/contracts';
import type {StoryEvidence} from '../../src/shared/marketingStory';
import type {FlightSchedule} from '../../src/shared/marketingFlight';
export type MoneyMinor = string;
export interface MarketingListing {
  id: string | number; title: string; slug: string; city?: string; publicationStatus: string;
  media: Array<{ id: string; url: string; type: 'IMAGE' | 'VIDEO'; approved: boolean }>;
}
export interface CampaignQuote {
  costMinor: MoneyMinor; markupPercent: number; profitMinor: MoneyMinor; totalMinor: MoneyMinor;
  currency: string; status: string; lines: Array<{ label: string; amountMinor: MoneyMinor }>;
}
export interface StudioCampaign {
  strategySelection?:StrategySelection;
  destinationMembership?:{id:string;poolId:string;state:string}|null;
  firstPartyOutcomes?:{source:'ENCHO_CONSENTED_EVENTS';scope:'CAMPAIGN_ALL_REVISIONS';completeness:'RECORDED_EVENTS_ONLY';observedAt:string;propertyVisits:string|null;inquiries:string|null;unreadMessages:string|null;bookings:string|null;lastInquiryAt:string|null};
  id: string | number; revision: number; listingId: string | number; title: string; provider: 'GOOGLE' | 'META'; status: string;
  product?: {kind:'DEDICATED_STAY';canonicalPath:string;evidenceVersion:1}|null;
  hostName?: string; listingTitle?: string; headline?: string; description?: string; mediaIds?: string[];
  startDate?: string; endDate?: string; flightSchedule?:FlightSchedule;
  stayStartDate?: string; stayEndDate?: string; mediaBudgetMinor?: MoneyMinor; dailyBudgetMinor?: MoneyMinor;
  locations?: string[]; googleSearch?: CampaignDraft['googleSearch']; rightsConfirmed?: boolean;
  spatialStory?:StoryEvidence;spatialStoryId?:string;spatialStoryHash?:string;creativeDerivativeId?:string;creativeManifestHash?:string;creativePreview?:{derivativeId:string;sourceAssetId:string;manifestHash:string;url:string;outputHash:string}|null;
  ai: { status: string; score: number | null; notes: string[]; evaluatedAt?: string | null; suggestions?: Array<{ field: string; recommendation: string; reason?: string }> };
  quote: CampaignQuote | null;
  funding: { status: string; capturedMinor: MoneyMinor | null; reservedMinor: MoneyMinor | null; released: boolean;
    refundableMinor?: MoneyMinor; pendingRefundMinor?: MoneyMinor; refundedMinor?: MoneyMinor };
  contentApproval: { status: string; revision?: number | null };
  delivery: { submitted?: boolean; readiness?: 'ELIGIBLE'|'LIMITED'|'REVIEWING'|'PENDING'|'LEARNING'|'BLOCKED'|'PAUSED'|'UNKNOWN'|null; statusCheck?: 'AVAILABLE'|'ERROR'|null; statusAttemptedAt?: string|null; configuredStatus: string | null; observedStatus: string | null; observedAt: string | null; externalCampaignId?: string | null; deliveryConfirmed?: boolean };
  observationJob?: {id: string; status: string; attempts: number; updatedAt: string; nextAttemptAt: string} | null;
  metrics: { report?: {status: 'AVAILABLE'|'NO_REPORT'|'NOT_STARTED'|'ERROR'; attemptedAt: string; dateStart: string; dateEnd: string} | null;
    currency?: string | null; freshness?: string | null; dataAsOf?: string | null; dateStart?: string | null; dateEnd?: string | null; accountTimeZone?: string | null;
    providerAttributedConversions?: number | null; impressions: number | null; clicks: number | null; ctr: number | null; profileVisits?: number | null; leads: number | null;
    bookings: number | null; spendMinor: MoneyMinor | null; observedAt: string | null; source: string | null } | null;
  blockers: string[];
  activationBlockers?:string[];
}
export interface MarketingPolicy {
  currency: string; markupPercent: number; configured: boolean; version?: number;
  costItems?: Array<{ label: string; amountMinor: MoneyMinor }>;
}
export interface StudioWorkspace {
  listings: MarketingListing[]; campaigns: StudioCampaign[]; policy: MarketingPolicy;
  campaignListings?: MarketingListing[];
  page?: {limit:number;mayHaveMore:boolean;nextCursor:number|null;order?:string};
  listingPage?: {limit:number;mayHaveMore:boolean;nextCursor:number|null};
  capabilities: { adtech?:boolean; funding: boolean; publish: boolean; activate?: boolean; reason?: string; metaCountries?: string[] };
}
export interface CampaignDraft {
  strategySelection?:StrategySelection;
  listingId: string; title: string; provider: 'GOOGLE' | 'META'; objective: 'BOOKINGS';
  startDate: string; endDate: string; flightSchedule?:FlightSchedule; mediaBudgetMinor: MoneyMinor; dailyBudgetMinor?: MoneyMinor;
  headline: string; description: string; mediaIds: string[]; locations: string[];
  rightsConfirmed: boolean;
  spatialStoryId?:string;spatialStoryHash?:string;creativeDerivativeId?:string;creativeManifestHash?:string;
  stayStartDate?: string; stayEndDate?: string;
  googleSearch?: { version: 1; headlines: string[]; descriptions: string[]; keywords: Array<{ text: string; matchType: 'EXACT' | 'PHRASE' }>;
    geoTargetConstants: string[]; languageConstants: string[]; geoMode: 'PRESENCE' | 'PRESENCE_OR_INTEREST';
    dailyBudgetMinor?: MoneyMinor; bidding: 'MAXIMIZE_CONVERSIONS'; containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING' };
}
