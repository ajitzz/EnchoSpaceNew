import {describe,expect,it,vi} from 'vitest';
import type pg from 'pg';
import {WorkforceAdminService,ensureAdminMembership,appendIamEvent,validateSodRules} from '../../lib/iam/workforceAdminService.js';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdminStaffCommandCenter} from '../../../components/admin/AdminStaffCommandCenter.js';

describe('CR1 retired consumer-admin workforce adapter',()=>{
  const pool={query:vi.fn(),connect:vi.fn()} as unknown as pg.Pool;
  const service=new WorkforceAdminService(pool);
  it('renders Operations handoff without forwarding the consumer token or legacy command forms',()=>{
    const html=renderToStaticMarkup(createElement(AdminStaffCommandCenter,{token:'consumer-credential-must-not-leak'}));
    expect(html).toContain('/operations/workforce');expect(html).toContain('separately verified staff session');
    expect(html).not.toContain('consumer-credential-must-not-leak');expect(html).not.toContain('<form');
    expect(html).not.toContain('api/admin/workforce');
  });
  it('denies all legacy mutations before acquiring a connection, even for a consumer admin',async()=>{
    const candidate={adminUserId:90,email:'candidate@example.test',roleKey:'platform_owner',environment:'PRODUCTION'};
    for(const invoke of [()=>service.hireStaffMember(candidate),()=>service.executeLifecycleAction(candidate),
      ()=>service.updateStaffQuotas(candidate),()=>service.ratifyAuthorization(candidate),()=>service.executeEmergencyFreeze(candidate),
      ()=>ensureAdminMembership(pool,90),()=>appendIamEvent(pool,{organizationId:'00000000-0000-4000-8000-000000000001',actorUserId:90,eventType:'GRANT',entityType:'STAFF',entityId:'90',reason:'Consumer admin must not acquire workforce authority.'})]){
      await expect(invoke()).rejects.toMatchObject({code:'LEGACY_WORKFORCE_AUTHORITY_RETIRED'});
    }
    expect(pool.connect).not.toHaveBeenCalled();expect(pool.query).not.toHaveBeenCalled();
  });
  it('does not expose unscoped workforce roster or audit reads',async()=>{
    for(const invoke of [()=>service.getWorkforceOverview(),()=>service.getStaffRoster(),()=>service.getPendingAuthorizations(),()=>service.getAuditEventStream(),()=>service.verifyMerkleAuditChain()]){
      await expect(invoke()).rejects.toMatchObject({code:'LEGACY_WORKFORCE_AUTHORITY_RETIRED'});
    }
    expect(pool.connect).not.toHaveBeenCalled();expect(pool.query).not.toHaveBeenCalled();
  });
    it('strictly rejects Maker-Checker toxic pairs: campaign_operator vs campaign_approver', () => {
      const res1 = validateSodRules(['campaign_operator'], 'campaign_approver');
      expect(res1.allowed).toBe(false);
      expect(res1.ruleId).toBe('SOD_CAMPAIGN_MAKER_CHECKER');

      const res2 = validateSodRules(['campaign_approver'], 'campaign_operator');
      expect(res2.allowed).toBe(false);
      expect(res2.ruleId).toBe('SOD_CAMPAIGN_MAKER_CHECKER');
    });

    it('strictly rejects Author-Publisher toxic pairs: strategy_architect vs strategy_publisher', () => {
      const res = validateSodRules(['strategy_architect'], 'strategy_publisher');
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe('SOD_STRATEGY_MAKER_CHECKER');
    });

    it('strictly rejects Finance vs Provider spend toxic pairs: finance_risk_reviewer vs provider_operator', () => {
      const res = validateSodRules(['provider_operator'], 'finance_risk_reviewer');
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe('SOD_FINANCE_PROVIDER_SEPARATION');
    });

    it('strictly enforces Auditor neutrality: auditor cannot hold any mutation role', () => {
      const res1 = validateSodRules(['auditor'], 'campaign_operator');
      expect(res1.allowed).toBe(false);
      expect(res1.ruleId).toBe('SOD_AUDITOR_NEUTRALITY');

      const res2 = validateSodRules(['provider_operator'], 'auditor');
      expect(res2.allowed).toBe(false);
      expect(res2.ruleId).toBe('SOD_AUDITOR_NEUTRALITY');
    });

    it('permits non-conflicting operational roles', () => {
      const res1 = validateSodRules(['campaign_operator'], 'strategy_architect');
      expect(res1.allowed).toBe(true);

      const res2 = validateSodRules(['support_analyst'], 'incident_commander');
      expect(res2.allowed).toBe(true);
    });

});
