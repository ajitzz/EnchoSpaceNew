import {describe,expect,it} from 'vitest';
import {googleHierarchyEvidence,metaHierarchyEvidence} from '../../lib/providers/deliveryEvidence.js';

const google=()=>({campaign:{status:'ENABLED',primaryStatus:'ELIGIBLE'},adGroup:{status:'ENABLED',primaryStatus:'ELIGIBLE'},
  adGroupAd:{status:'ENABLED',primaryStatus:'ELIGIBLE',policySummary:{approvalStatus:'APPROVED',reviewStatus:'REVIEWED'}}});
const meta=()=>Array.from({length:3},()=>({status:'ACTIVE',effective_status:'ACTIVE'}));
describe('hierarchy readiness without fabricated live impressions',()=>{
  it('requires every Google layer and reviewed ad approval for eligibility',()=>{
    expect(googleHierarchyEvidence('fixture',google())).toMatchObject({readiness:'ELIGIBLE',isLive:false,isServingImpressions:false,reconciliationRequired:false});
    const missing=google();delete missing.adGroup.primaryStatus;
    expect(googleHierarchyEvidence('fixture',missing)).toMatchObject({readiness:'UNKNOWN',reconciliationRequired:true});
    const review=google();review.adGroupAd.policySummary.reviewStatus='REVIEW_IN_PROGRESS';
    expect(googleHierarchyEvidence('fixture',review)).toMatchObject({readiness:'REVIEWING',normalizedState:'REVIEWING'});
  });
  it.each([1,2])('a paused Google descendant %i is not proof of whole-campaign pause',layer=>{
    const row=google();[row.campaign,row.adGroup,row.adGroupAd][layer].status='PAUSED';
    expect(googleHierarchyEvidence('fixture',row)).toMatchObject({readiness:'BLOCKED',normalizedState:'NOT_DELIVERING',isLive:false});
  });
  it('distinguishes ad rejection and limited eligibility',()=>{
    const row=google();row.adGroupAd.policySummary.approvalStatus='DISAPPROVED';
    expect(googleHierarchyEvidence('fixture',row).normalizedState).toBe('DISAPPROVED');
    row.adGroupAd.policySummary.approvalStatus='APPROVED_LIMITED';
    expect(googleHierarchyEvidence('fixture',row).readiness).toBe('LIMITED');
  });
  it('never turns Meta ACTIVE into observed impressions',()=>{
    expect(metaHierarchyEvidence('fixture',meta())).toMatchObject({readiness:'ELIGIBLE',isLive:false,isServingImpressions:false,reconciliationRequired:false});
  });
  it.each([1,2])('a paused Meta descendant %i does not certify the parent stopped',layer=>{
    const rows=meta();rows[layer].status='PAUSED';
    expect(metaHierarchyEvidence('fixture',rows)).toMatchObject({readiness:'BLOCKED',normalizedState:'NOT_DELIVERING'});
  });
  it.each([['PENDING_REVIEW','REVIEWING'],['DISAPPROVED','DISAPPROVED'],['PENDING_BILLING_INFO','NOT_DELIVERING'],['UNRECOGNIZED','UNKNOWN']])('classifies Meta %s conservatively',(effective,state)=>{
    const rows=meta();rows[2].effective_status=effective;
    expect(metaHierarchyEvidence('fixture',rows)).toMatchObject({normalizedState:state,isLive:false,isServingImpressions:false});
  });
  it('requires a complete Meta hierarchy',()=>{
    expect(metaHierarchyEvidence('fixture',meta().slice(0,2)).readiness).toBe('UNKNOWN');
  });
  it.each([
    ['ELIGIBLE','ELIGIBLE'], ['PAUSED','BLOCKED'], ['REMOVED','BLOCKED'],
    ['ENDED','BLOCKED'], ['PENDING','PENDING'], ['MISCONFIGURED','BLOCKED'],
    ['LIMITED','LIMITED'], ['LEARNING','LEARNING'], ['NOT_ELIGIBLE','BLOCKED'],
    ['UNKNOWN','UNKNOWN'], ['UNSPECIFIED','UNKNOWN'], ['FUTURE_VALUE','UNKNOWN'],
  ])('maps Google v25 campaign primary %s without claiming live delivery',(primary,readiness)=>{
    const row=google();row.campaign.primaryStatus=primary;
    expect(googleHierarchyEvidence('fixture',row,'v25')).toMatchObject({readiness,isLive:false,isServingImpressions:false});
  });
  it.each([1,2])('rejects campaign-only primary statuses on Google descendant %i',layer=>{
    const row=google();[row.campaign,row.adGroup,row.adGroupAd][layer].primaryStatus='LEARNING';
    expect(googleHierarchyEvidence('fixture',row)).toMatchObject({readiness:'UNKNOWN',reconciliationRequired:true});
  });
  it.each([
    ['UNDER_APPEAL','APPROVED','REVIEWING'], ['ELIGIBLE_MAY_SERVE','APPROVED','LIMITED'],
    ['REVIEWED','AREA_OF_INTEREST_ONLY','LIMITED'], ['UNKNOWN','APPROVED','UNKNOWN'],
    ['REVIEWED','FUTURE_POLICY','UNKNOWN'], ['FUTURE_REVIEW','APPROVED','UNKNOWN'],
  ])('requires reviewed Google policy enums (%s / %s)',(review,approval,readiness)=>{
    const row=google();row.adGroupAd.policySummary={reviewStatus:review,approvalStatus:approval};
    expect(googleHierarchyEvidence('fixture',row)).toMatchObject({readiness,isLive:false});
  });
  it.each([
    ['ACTIVE','ELIGIBLE'], ['ADSET_PAUSED','BLOCKED'], ['ARCHIVED','BLOCKED'],
    ['CAMPAIGN_PAUSED','BLOCKED'], ['DELETED','BLOCKED'], ['DISAPPROVED','BLOCKED'],
    ['IN_PROCESS','REVIEWING'], ['PAUSED','BLOCKED'], ['PENDING_BILLING_INFO','BLOCKED'],
    ['PENDING_REVIEW','REVIEWING'], ['PREAPPROVED','REVIEWING'], ['WITH_ISSUES','BLOCKED'],
  ])('maps Meta v26 ad effective status %s conservatively',(effective,readiness)=>{
    const rows=meta();rows[2].effective_status=effective;
    expect(metaHierarchyEvidence('fixture',rows,'v26.0')).toMatchObject({readiness,isLive:false,isServingImpressions:false});
  });
  it.each([0,1])('rejects ad-only effective status on Meta layer %i',layer=>{
    const rows=meta();rows[layer].effective_status='PENDING_REVIEW';
    expect(metaHierarchyEvidence('fixture',rows)).toMatchObject({readiness:'UNKNOWN',reconciliationRequired:true});
  });
  it('requires a reviewed version even when configured pause is present',()=>{
    const row=google();row.campaign.status='PAUSED';
    expect(googleHierarchyEvidence('fixture',row,'v26').readiness).toBe('UNKNOWN');
    const rows=meta();rows[0].status='PAUSED';
    expect(metaHierarchyEvidence('fixture',rows,'v27.0').readiness).toBe('UNKNOWN');
  });
});
