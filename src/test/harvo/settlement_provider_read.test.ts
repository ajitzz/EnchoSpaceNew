import {describe,expect,it,vi} from 'vitest';
import {settlementStopReader} from '../../lib/marketing/settlementProviderRead.js';
import {GoogleAdsClient} from '../../lib/providers/google/GoogleAdsClient.js';
import {MetaAdsClient} from '../../lib/providers/meta/MetaAdsClient.js';
const googleBinding={provider:'GOOGLE' as const,accountId:'9876543210',externalCampaignId:'customers/9876543210/campaigns/123',campaignId:1,revision:2};
function googleFixture(status='PAUSED',resource=googleBinding.externalCampaignId){
 const fetch=vi.fn(async(url:any)=>new Response(JSON.stringify(String(url).includes('oauth2.googleapis.com')?{access_token:'fixture-only',expires_in:3600}:[{results:[{campaign:{resourceName:resource,status}}]}]),{headers:{'content-type':'application/json'}}));
 return {fetch,client:new GoogleAdsClient({clientId:'fixture',clientSecret:'fixture',refreshToken:'fixture',customerId:googleBinding.accountId,mccCustomerId:'1234567890',developerToken:''},{fetch})};
}
describe('Authenticated settlement containment observation',()=>{
 it('reads the exact stopped Google campaign without sending mutations',async()=>{
  const {client,fetch}=googleFixture();const result=await settlementStopReader(client)(googleBinding);
  expect(result).toMatchObject({...googleBinding,configuredStatus:'PAUSED',evidenceHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(fetch.mock.calls.map(([url])=>url)).toEqual(['https://oauth2.googleapis.com/token','https://googleads.googleapis.com/v25/customers/9876543210/googleAds:searchStream']);
 });
 it.each(['ENABLED','UNKNOWN','UNSPECIFIED'])('rejects non-stopped Google status %s',async status=>{await expect(settlementStopReader(googleFixture(status).client)(googleBinding)).rejects.toMatchObject({code:'SETTLEMENT_PROVIDER_NOT_STOPPED'});});
 it('rejects foreign or injection-shaped identities before HTTP',async()=>{const{client,fetch}=googleFixture();for(const binding of [{...googleBinding,accountId:'1234567890'},{...googleBinding,externalCampaignId:googleBinding.externalCampaignId+' OR 1=1'}])await expect(settlementStopReader(client)(binding)).rejects.toMatchObject({code:'SETTLEMENT_ACCOUNT_MISMATCH'});expect(fetch).not.toHaveBeenCalled();});
 it('rejects a provider response for a different Google campaign',async()=>{await expect(settlementStopReader(googleFixture('PAUSED','customers/9876543210/campaigns/999').client)(googleBinding)).rejects.toMatchObject({code:'SETTLEMENT_PROVIDER_NOT_STOPPED'});});
 it('checks Meta account and stopped status from authenticated fields',async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({id:'123',account_id:'456',status:'PAUSED'}),{headers:{'content-type':'application/json'}}));
  const meta=new MetaAdsClient({accessToken:'fixture-token',accountId:'456',pageId:'789',appSecret:'fixture-secret',pixelId:'999',instagramId:'555'},{fetch});
  const binding={provider:'META' as const,accountId:'456',externalCampaignId:'123',campaignId:1,revision:2};
  expect(await settlementStopReader(googleFixture().client,meta)(binding)).toMatchObject({...binding,configuredStatus:'PAUSED'});expect(fetch).toHaveBeenCalledOnce();
  await expect(settlementStopReader(googleFixture().client,meta)({...binding,accountId:'111'})).rejects.toMatchObject({code:'SETTLEMENT_ACCOUNT_MISMATCH'});expect(fetch).toHaveBeenCalledOnce();
 });
});
