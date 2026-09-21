import {GoogleAdsClient,GOOGLE_ADS_API_VERSION} from './GoogleAdsClient.js';
import {GoogleAdsError} from './googleErrors.js';
import type {KeywordResearchEvidence,KeywordResearchIdea,KeywordResearchPort} from '../../marketing/portfolio/keywordContract.js';
import {hasAsciiControl} from '../../intentionalText.js';
const invalid=()=>new GoogleAdsError('GOOGLE_INVALID_RESPONSE','Google returned invalid historical keyword evidence.',{statusCode:502});
const integer=(value:unknown):string|null=>{
 if(value===undefined||value===null)return null;
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return String(value);
 if(typeof value==='string'&&/^(0|[1-9]\d{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n)return value;
 throw invalid();
};
const months=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
export function parseKeywordIdeas(data:unknown):Pick<KeywordResearchEvidence,'ideas'|'truncated'>{
 if(!data||typeof data!=='object'||Array.isArray(data))throw invalid();
 const envelope=data as Record<string,any>,rows=envelope.results??[];
 if(envelope.error||!Array.isArray(rows)||rows.length>100||envelope.nextPageToken!==undefined&&typeof envelope.nextPageToken!=='string')throw invalid();
 const seen=new Set<string>();
 const ideas:KeywordResearchIdea[]=rows.map((row:any)=>{
  if(!row||typeof row.text!=='string'||!row.text.trim()||row.text.length>200||hasAsciiControl(row.text)||seen.has(row.text))throw invalid();seen.add(row.text);
  const m=row.keywordIdeaMetrics??{};if(typeof m!=='object'||Array.isArray(m))throw invalid();
  const index=integer(m.competitionIndex),low=integer(m.lowTopOfPageBidMicros),high=integer(m.highTopOfPageBidMicros);
  if(index!==null&&BigInt(index)>100n||low!==null&&high!==null&&BigInt(low)>BigInt(high))throw invalid();
  const volumes=m.monthlySearchVolumes??[];if(!Array.isArray(volumes)||volumes.length>24)throw invalid();
  const periods=new Set<string>();
  const monthlySearchVolumes=volumes.map((v:any)=>{
   const year=Number(integer(v?.year)),month=v?.month;
   if(!Number.isInteger(year)||year<2000||year>2200||!months.includes(month)||periods.has(`${year}-${month}`))throw invalid();periods.add(`${year}-${month}`);
   return {year,month,searches:integer(v.monthlySearches)};
  }).sort((a,b)=>a.year-b.year||months.indexOf(a.month)-months.indexOf(b.month));
  const competition=['LOW','MEDIUM','HIGH'].includes(m.competition)?m.competition:'UNKNOWN';
  return {text:row.text,averageMonthlySearches:integer(m.avgMonthlySearches),competition,competitionIndex:index===null?null:Number(index),lowTopOfPageBidMicros:low,highTopOfPageBidMicros:high,monthlySearchVolumes};
 });
 return {ideas,truncated:!!envelope.nextPageToken};
}
/** Narrow port never calls mutation APIs. Currency comes from the actual serving customer. */
export class GoogleKeywordResearchAdapter implements KeywordResearchPort {
 readonly customerId:string;
 constructor(private readonly client:GoogleAdsClient){this.customerId=client.getCustomerId();}
 async research(input:Parameters<KeywordResearchPort['research']>[0]):Promise<KeywordResearchEvidence>{
  const account=await this.client.searchStream(this.customerId,'SELECT customer.id, customer.manager, customer.currency_code FROM customer LIMIT 1');
  const customer=account.length===1?account[0]?.customer:null;
  if(!customer||String(customer.id)!==this.customerId||customer.manager!==false||!['INR','USD'].includes(customer.currencyCode))throw invalid();
  const response=await this.client.generateKeywordIdeas(input);
  return {source:'GOOGLE_KEYWORD_PLAN_IDEA',apiVersion:GOOGLE_ADS_API_VERSION,currency:customer.currencyCode,observedAt:new Date().toISOString(),historical:true,...parseKeywordIdeas(response)};
 }
}
