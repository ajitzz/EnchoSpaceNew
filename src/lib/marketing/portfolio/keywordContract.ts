import {z} from 'zod';
import {hasAsciiControl} from '../../intentionalText.js';
const keyword=z.string().trim().min(2).max(80).refine(v=>!hasAsciiControl(v)&&!/[<>]/.test(v),'Use plain keyword text');
export const keywordResearchSchema=z.object({
 listingId:z.number().int().positive().safe(),factHash:z.string().regex(/^[a-f0-9]{64}$/),keywords:z.array(keyword).max(20),
 geoTargetConstants:z.array(z.string().regex(/^geoTargetConstants\/[1-9]\d{0,19}$/)).min(1).max(20),
 languageConstant:z.string().regex(/^languageConstants\/[1-9]\d{0,19}$/),
}).strict().refine(v=>new Set(v.keywords).size===v.keywords.length&&new Set(v.geoTargetConstants).size===v.geoTargetConstants.length,'Choose distinct seeds and locations');
export interface KeywordResearchIdea {
 text:string;averageMonthlySearches:string|null;competition:'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN';competitionIndex:number|null;
 lowTopOfPageBidMicros:string|null;highTopOfPageBidMicros:string|null;
 monthlySearchVolumes:{year:number;month:string;searches:string|null}[];
}
export interface KeywordResearchEvidence {
 source:'GOOGLE_KEYWORD_PLAN_IDEA';apiVersion:'v25';currency:string;observedAt:string;historical:true;truncated:boolean;ideas:KeywordResearchIdea[];
}
export interface KeywordResearchPort {
 readonly customerId:string;
 research(input:{canonicalUrl:string;keywords:string[];geoTargetConstants:string[];languageConstant:string}):Promise<KeywordResearchEvidence>;
}
