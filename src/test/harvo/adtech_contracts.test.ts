import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {canonicalPriceEvidence, profileSchema, resolvePriceTier, rupeesToPaise, validateGeography, validateTierIntervals, geographyEvidenceSchema} from '../../lib/marketing/adtech/contracts.js';
import {assertStrategyCapabilities} from '../../lib/marketing/adtech/capabilities.js';

export const profiles = JSON.parse(readFileSync(new URL('../../migrations/032_marketing_adtech_registry.sql', import.meta.url),'utf8').match(/\$profiles\$([\s\S]*?)\$profiles\$/)![1]).map((p: unknown) => profileSchema.parse(p));
const price = (value:string) => canonicalPriceEvidence({id:1,price:value,currency:'INR',rental_mode:'entire_place'});
describe('ADT contracts and registry-supplied price intervals',()=>{
 it.each([['1000.00','BUDGET'],['3999.99','BUDGET'],['4000.00','COMFORT'],['6999.99','COMFORT'],['7000.00','PREMIUM'],['9999999.99','PREMIUM']])('classifies %s as %s exactly',(amount,tier)=>expect(resolvePriceTier(price(amount),profiles).profile.tier).toBe(tier));
 it('rejects below-range prices without inventing a floor',()=>expect(()=>resolvePriceTier(price('999.99'),profiles)).toThrow(/outside/));
 it.each([1000,'1e3','-1000','1000.001','NaN','1,000.00'])('rejects inexact price %s',v=>expect(()=>rupeesToPaise(v)).toThrow());
 it('requires a canonical sellable unit',()=>expect(()=>canonicalPriceEvidence({id:1,price:'4000',currency:'INR',rental_mode:'private_room'})).toThrow(/room/));
 it('rejects other currencies',()=>expect(()=>canonicalPriceEvidence({id:1,price:'4000',currency:'USD',rental_mode:'entire_place'})).toThrow());
 it('uses release boundaries rather than fixed runtime thresholds',()=>{const changed=structuredClone(profiles);changed[0].maxPriceMinor='410000';changed[1].minPriceMinor='410000';expect(resolvePriceTier(price('4000'),changed).profile.tier).toBe('BUDGET');});
 it('rejects gaps and overlap',()=>{const changed=structuredClone(profiles);changed[0].maxPriceMinor='400001';expect(()=>validateTierIntervals(changed)).toThrow(/contiguous/);});
 it('rejects reversed tier identities even when the numeric intervals remain contiguous',()=>{const changed=structuredClone(profiles);changed[0].tier='PREMIUM';changed[2].tier='BUDGET';expect(()=>validateTierIntervals(changed)).toThrow(/tiers/);});
 it('requires positive ranges and matching objective/event',()=>{expect(profileSchema.safeParse({...profiles[0],budget:{...profiles[0].budget,total:{min:'0',max:'5'}}}).success).toBe(false);expect(profileSchema.safeParse({...profiles[0],meta:{...profiles[0].meta,conversionEvent:'LEAD'}}).success).toBe(false);});
 it('rejects unsupported automatic placements and unintegrated lead authority',()=>{expect(()=>assertStrategyCapabilities({...profiles[0],meta:{...profiles[0].meta,placementMode:'ADVANTAGE_PLUS'}},'META')).toThrow(/AUDIENCE_NETWORK/);expect(()=>assertStrategyCapabilities({...profiles[0],meta:{...profiles[0].meta,objective:'OUTCOME_LEADS',conversionEvent:'LEAD'}},'META')).toThrow(/LEAD_CONVERSION/);});
 it.each(['Wayanad','North Goa'])('requires verified district evidence for %s',label=>{
  const common={provider:'META',apiVersion:'v26.0',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z',evidenceHash:'a'.repeat(64)};
  const pin=geographyEvidenceSchema.parse({...common,kind:'COORDINATE_RADIUS',label:'Synthetic feeder',latitude:11.8996,longitude:75.5383,radiusKm:30});
  const district=geographyEvidenceSchema.parse({...common,kind:'PROVIDER_REGION_EXCLUSION',label,providerKey:'fixture-district',administrativeLevel:'DISTRICT'});
  expect(()=>validateGeography([pin],'META')).toThrow(/district/);
  expect(()=>validateGeography([pin,district],'META')).not.toThrow();
  expect(()=>validateGeography([pin,pin,district],'META')).toThrow(/duplicate/);
 });
 it.each([NaN,Infinity,91,-91])('rejects latitude %s',latitude=>expect(geographyEvidenceSchema.safeParse({kind:'COORDINATE_RADIUS',provider:'META',apiVersion:'v26.0',label:'Test',country:'IN',verifiedAt:'2026-09-22T00:00:00.000Z',evidenceHash:'a'.repeat(64),latitude,longitude:75,radiusKm:30}).success).toBe(false));
});
