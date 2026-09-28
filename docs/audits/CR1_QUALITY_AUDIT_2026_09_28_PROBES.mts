// Audit-only, offline reproductions. No database, provider, environment file or
// application server is opened. These demonstrate contract defects, not exploits.
import assert from 'node:assert/strict';
import {PausedCanaryHardeningEngine} from '../../src/lib/compliance/pausedCanaryHardeningEngine.ts';
import {StatutoryTaxVerificationEngine} from '../../src/lib/compliance/statutoryTaxVerificationEngine.ts';
import {ProviderSecurityHardeningEngine} from '../../src/lib/compliance/providerSecurityHardeningEngine.ts';
import {isIsolatedStaffSessionIssuer} from '../../src/lib/iam/staffSessionIssuer.ts';
import type pg from 'pg';

const results:Record<string,unknown>={scope:'OFFLINE_CONTRACT_REPRODUCTION',databaseContacted:false,providerContacted:false};
const queries:{sql:string;params?:unknown[]}[]=[];
const db={async query(sql:string,params?:unknown[]){queries.push({sql,params});return {rows:[]};}};
const input={listingId:'audit-listing',provider:'META_ADS' as const,remoteCampaignId:'audit-campaign',campaignStatus:'PAUSED' as const,dailyBudgetPaise:0,idempotencyKey:'audit-key',operatorId:'audit-operator'};
const first=new PausedCanaryHardeningEngine();
await first.registerCanaryCampaignWithAudit(db,input);
await new PausedCanaryHardeningEngine().registerCanaryCampaignWithAudit(db,input);
const inserts=queries.filter(q=>q.sql.includes('INSERT INTO canary_execution_registry')).length;
assert.equal(inserts,2);
results.duplicateRegistryWritesAcrossInstances=inserts;

const changed=await first.registerCanaryCampaignWithAudit(db,{...input,listingId:'different-listing',remoteCampaignId:'different-campaign'});
assert.equal(changed.isReplay,true);
assert.equal(changed.listingId,input.listingId);
results.conflictingPayloadAcceptedAsReplay=true;

await first.applyCanarySequence({canaryId:'audit',sequenceNumber:9,status:'VERIFIED',appliedAt:Date.now()});
const stale=await new PausedCanaryHardeningEngine().applyCanarySequence({canaryId:'audit',sequenceNumber:6,status:'OLDER',appliedAt:Date.now()});
assert.equal(stale.applied,true);
results.olderSequenceAcceptedAfterInstanceReset=true;

queries.length=0;
await new PausedCanaryHardeningEngine().registerCanaryCampaignWithAudit(db,{...input,operatorId:"O'Neil"});
assert(queries.some(q=>q.sql.includes("'O'Neil'")&&!q.params));
results.operatorTextInterpolatedIntoSqlWithoutParameters=true;

const readback=first.verifyProviderReadback(input,{remoteCampaignId:input.remoteCampaignId,remoteStatus:'PAUSED',remoteDailyBudgetPaise:0,provider:'GOOGLE_ADS'});
assert.equal(readback.verified,true);
results.wrongProviderReadbackAccepted=true;

const tax=new StatutoryTaxVerificationEngine();
const attestation=tax.verifyIcaAttestation({caName:'Audit Fictional Signer',icaiMembershipNumber:'000000',firmRegistrationNumber:'000000',udin:'26AAAAAAAAAAAAAAAA'});
assert.equal(attestation.verified,true);
results.fabricatedFormatOnlyAttestationMarkedVerified=true;
results.taxArithmeticSample=tax.calculateStatutoryBreakdown(100000);

const provider=new ProviderSecurityHardeningEngine();
assert.equal(provider.validateGoogleMccCredentials({mccCustomerId:'1234567890',developerToken:'A'.repeat(22),managerAccountId:'not-a-google-account'}),true);
results.syntheticCredentialFormattingAccepted=true;

const prior={NODE_ENV:process.env.NODE_ENV,ENCHO_TEST_SANDBOX:process.env.ENCHO_TEST_SANDBOX,HARVO_ALLOW_OWNER_ROLE:process.env.HARVO_ALLOW_OWNER_ROLE};
try{
  process.env.NODE_ENV='production';delete process.env.ENCHO_TEST_SANDBOX;delete process.env.HARVO_ALLOW_OWNER_ROLE;
  const ownerProbe={async query(sql:string){return {rows:[sql.includes(' AS owns')?{owns:true}:{ok:true}]};}} as unknown as pg.PoolClient;
  assert.equal(await isIsolatedStaffSessionIssuer(ownerProbe),true);
  results.ownerSessionIssuerAcceptedInProductionWithoutOptIn=true;
}finally{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
console.log(JSON.stringify(results,null,2));
