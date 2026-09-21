/** Authentication evidence requires observed manager AND serving identities.
 * All requests use the real transport with a local response fixture; no ambient
 * credential, Google account, mutation or synthetic runtime success is used.
 */
import {describe, it, expect, vi} from 'vitest';
import {GoogleAdsClient, GOOGLE_ADS_API_VERSION} from '../lib/providers/google/GoogleAdsClient.js';
import {GoogleAdsProvider} from '../lib/providers/google/GoogleAdsProvider.js';

const manager='1112223333', serving='9876543210';
const secrets={clientSecret:'isolated-client-secret',refreshToken:'isolated-refresh-token',developerToken:'isolated-developer-token'};
function fixture(change: {manager?: boolean; servingId?: string; timeZone?: string; reject?: boolean}={}) {
  const transport=vi.fn(async(input: RequestInfo | URL, init?: RequestInit)=>{
    const url=String(input);
    expect(init?.method).toBe('POST');
    if(url==='https://oauth2.googleapis.com/token') return Response.json({access_token:'isolated-access-token',expires_in:3600});
    expect(url.endsWith('/googleAds:searchStream')).toBe(true);
    if(change.reject) return Response.json({error:{message:secrets.refreshToken}}, {status:403});
    if(url===`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${manager}/googleAds:searchStream`)
      return Response.json([{results:[{customer:{id:manager,resourceName:`customers/${manager}`,manager:change.manager??true,currencyCode:'INR'}}]}]);
    expect(url).toBe(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${serving}/googleAds:searchStream`);
    return Response.json([{results:[{customer:{id:change.servingId??serving,resourceName:`customers/${serving}`,manager:false,currencyCode:'INR',timeZone:change.timeZone??'Asia/Kolkata'}}]}]);
  });
  const client=new GoogleAdsClient({...secrets,clientId:'isolated-client',mccCustomerId:manager,customerId:serving},{fetch:transport});
  return {provider:new GoogleAdsProvider(client),transport};
}

describe('Google Ads credential evidence and diagnostic safety',()=>{
  it('verifies the exact manager and serving customer without claiming mutation permission',async()=>{
    const {provider,transport}=fixture();
    expect(await provider.validateCredentials()).toEqual({isValid:true,accountId:serving,permissions:['REPORTING'],details:{manager:false,currency:'INR',timeZone:'Asia/Kolkata',publishingVerified:false}});
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('reports health only after authenticated account reads',async()=>{
    const {provider,transport}=fixture();const result=await provider.checkHealth();
    expect(['HEALTHY','DEGRADED']).toContain(result.status);expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('fails closed without credentials and makes no HTTP request',async()=>{
    const transport=vi.fn();
    const provider=new GoogleAdsProvider(new GoogleAdsClient({clientId:'',clientSecret:'',refreshToken:'',mccCustomerId:'',customerId:''},{fetch:transport}));
    expect(await provider.validateCredentials()).toMatchObject({isValid:false,accountId:'',permissions:[]});
    expect((await provider.checkHealth()).status).toBe('UNAVAILABLE');expect(transport).not.toHaveBeenCalled();
  });
  it.each([{manager:false},{servingId:manager},{timeZone:'Unverified/Zone'}])('rejects mismatched account evidence %j',async change=>{
    expect(await fixture(change).provider.validateCredentials()).toMatchObject({isValid:false,accountId:'',permissions:[]});
  });
  it.each([false,true])('does not return secrets in validation diagnostics (rejection=%s)',async reject=>{
    const result=await fixture({reject}).provider.validateCredentials();expect(result.isValid).toBe(!reject);
    const body=JSON.stringify(result);for(const secret of [...Object.values(secrets),'isolated-access-token'])expect(body).not.toContain(secret);
  });
});
