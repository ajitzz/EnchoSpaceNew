import {strategySelectionSchema} from '../../shared/adtech/contracts.js';
import type {StoryEvidence} from '../../shared/marketingStory.js';
import {flightScheduleSchema} from '../../shared/marketingFlight.js';
import type {MarketingProduct} from './portfolio/contracts.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export class MarketingError extends Error {
 constructor(public code: string, message: string, public status = 409) { super(message); this.name = 'MarketingError'; }
}
export type Actor = { id: number; role: 'host' | 'admin' | 'system' };
export type MarketingProvider = 'GOOGLE' | 'META';
export const minorAmount = z.string().regex(/^(0|[1-9]\d{0,13})$/).refine(x => BigInt(x) <= 9007199254740991n, 'Amount exceeds supported range');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v; }, 'Invalid calendar date');
export const draftSchema = z.object({
 listingId: z.coerce.number().int().positive(), objective: z.literal('BOOKINGS').default('BOOKINGS'), title: z.string().trim().min(3).max(100), provider: z.enum(['META','GOOGLE']),
 startDate: date, endDate: date, flightSchedule:flightScheduleSchema.optional(), stayStartDate:date.optional(),stayEndDate:date.optional(), mediaBudgetMinor: minorAmount, dailyBudgetMinor: minorAmount.optional(),
 headline: z.string().trim().min(3).max(100), description: z.string().trim().min(10).max(1000),
 mediaIds: z.array(z.string().regex(/^\d+$/)).min(1).max(6), locations: z.array(z.string().trim().min(2).max(120)).min(1).max(20),
 strategySelection:strategySelectionSchema.optional(),
 rightsConfirmed: z.boolean().default(false),
 spatialStoryId:z.string().uuid().optional(),spatialStoryHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 creativeDerivativeId:z.string().uuid().optional(),creativeManifestHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 googleSearch: z.object({
  version:z.literal(1).default(1),dailyBudgetMinor:minorAmount.optional(),bidding:z.literal('MAXIMIZE_CONVERSIONS').default('MAXIMIZE_CONVERSIONS'),containsEuPoliticalAdvertising:z.literal('DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING').default('DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'),
  headlines: z.array(z.string().trim().min(1).max(30)).min(3).max(15), descriptions: z.array(z.string().trim().min(1).max(90)).min(2).max(4),
  keywords: z.array(z.object({text:z.string().trim().min(1).max(80),matchType:z.enum(['EXACT','PHRASE'])}).strict()).min(1).max(200),
  geoTargetConstants:z.array(z.string().regex(/^geoTargetConstants\/\d+$/)).max(20),
  languageConstants:z.array(z.string().regex(/^languageConstants\/\d+$/)).min(1).max(10),
  geoMode:z.enum(['PRESENCE','PRESENCE_OR_INTEREST']).default('PRESENCE'),
 }).strict().optional(),
}).strict().transform(v=>({...v,dailyBudgetMinor:v.dailyBudgetMinor??((BigInt(v.mediaBudgetMinor)/BigInt(Math.max(1,Math.floor((Date.parse(v.endDate)-Date.parse(v.startDate))/86400000)+1)))||1n).toString()})).superRefine((v,c) => {
 if(v.flightSchedule&&(v.flightSchedule.startsAt.slice(0,10)!==v.startDate||v.flightSchedule.endsAt.slice(0,10)!==v.endDate))c.addIssue({code:'custom',message:'Timed flight must match the advertising dates',path:['flightSchedule']});
 if(v.endDate <= v.startDate || new Date(v.endDate).getTime()-new Date(v.startDate).getTime()>89*86400000) c.addIssue({code:'custom',message:'Choose an end date after the start, within 90 days',path:['endDate']});
 if(BigInt(v.mediaBudgetMinor)<500n || BigInt(v.dailyBudgetMinor)<1n || BigInt(v.dailyBudgetMinor)>BigInt(v.mediaBudgetMinor)) c.addIssue({code:'custom',message:'Daily media budget must be positive and within total media budget (minimum 500 minor units)',path:['dailyBudgetMinor']});
 if((v.stayStartDate&&!v.stayEndDate)||(!v.stayStartDate&&v.stayEndDate)||(v.stayStartDate&&v.stayEndDate&&v.stayEndDate<=v.stayStartDate))c.addIssue({code:'custom',message:'Choose a valid guest stay date range',path:['stayEndDate']});
 if(v.provider==='GOOGLE'&&!v.strategySelection&&v.googleSearch?.geoTargetConstants.length===0)c.addIssue({code:'custom',message:'Choose resolved Google locations',path:['googleSearch','geoTargetConstants']});
 if(v.provider==='META'&&!v.strategySelection&&v.locations.some(l=>!(/^[A-Z]{2}$/).test(l)))c.addIssue({code:'custom',message:'Meta targeting uses explicit enabled two-letter country codes, such as IN. City targeting has not been configured.',path:['locations']});
 if(v.provider==='GOOGLE'&&v.googleSearch&&(!v.googleSearch.headlines.includes(v.headline)||!v.googleSearch.descriptions.includes(v.description)))c.addIssue({code:'custom',message:'Include the primary preview headline and description in the responsive Search assets',path:['googleSearch']});
 if(new Set(v.mediaIds).size!==v.mediaIds.length) c.addIssue({code:'custom',message:'Choose each asset once',path:['mediaIds']});
 if(!!v.spatialStoryId!==!!v.spatialStoryHash||v.spatialStoryId&&v.creativeDerivativeId)c.addIssue({code:'custom',message:'Choose one exact reviewed story or a single image variant',path:['spatialStoryId']});
 if(!!v.creativeDerivativeId!==!!v.creativeManifestHash||v.creativeDerivativeId&&v.provider!=='META')c.addIssue({code:'custom',message:'A reviewed image variant requires its exact fingerprint and a Meta campaign',path:['creativeDerivativeId']});
});
export type CampaignDraft = z.infer<typeof draftSchema>;
export interface CampaignCreativeEvidence {derivativeId:string;sourceAssetId:string;manifestHash:string;url:string;originalSourceUrl:string;outputHash:string;}
export interface ListingEvidence {id:number;hostId:number;title:string;description:string;slug:string;city:string;publicationStatus:string;currency:string;price:string;media:{id:string;url:string;type:'IMAGE'|'VIDEO';approved:boolean}[];spatialStory?:StoryEvidence;campaignCreative?:CampaignCreativeEvidence;marketingProduct?:MarketingProduct;}
export const stableJson = (value: unknown): string => {
 if(Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
 if(value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson((value as Record<string,unknown>)[k])}`).join(',')}}`;
 return JSON.stringify(value) ?? 'null';
};
export const fingerprint = (value:unknown) => createHash('sha256').update(stableJson(value)).digest('hex');
export function publicOrigin(value?:string):string {
 try {const u=new URL(value || '');if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||/^(localhost|.*\.local|.*\.internal|\d+(\.\d+){3}|\[)/i.test(u.hostname))throw new Error();return u.origin;}
 catch {throw new MarketingError('PUBLIC_ORIGIN_REQUIRED','A public HTTPS marketplace origin must be configured',503);}
}
export function assertListing(draft:CampaignDraft,listing:ListingEvidence,hostId:number) {
 if(listing.id!==draft.listingId||listing.hostId!==hostId||listing.publicationStatus!=='published') throw new MarketingError('LISTING_NOT_AVAILABLE','Choose a published property that belongs to this account',404);
 if(!['INR','USD'].includes(listing.currency)) throw new MarketingError('CURRENCY_UNSUPPORTED','This property currency has not been enabled for advertising');
 for(const id of draft.mediaIds) if(!listing.media.some(m=>m.id===id&&m.approved)) throw new MarketingError('MEDIA_NOT_APPROVED','Selected media must belong to this published property and be approved');
}
export const editableStates = new Set(['DRAFT','AI_REJECTED','ADMIN_REJECTED','PENDING_ADMIN','APPROVED']);
export function requireAdmin(actor:Actor){if(actor.role!=='admin') throw new MarketingError('ADMIN_REQUIRED','Administrator access required',403);}
export function requireRevision(row:{revision:number},revision:unknown){if(row.revision!==revision)throw new MarketingError('REVISION_CONFLICT','This campaign changed. Reload before continuing.');}
