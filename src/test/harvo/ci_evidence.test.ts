import {describe, expect, it} from 'vitest';
import {summarizeResults} from '../../../scripts/testing/summarize-results.mjs';

describe('CI test evidence boundary', () => {
  it('retains failed suites and skipped assertions without serializing fixture data', () => {
    const canary='private-fixture@example.test Bearer credential-canary';
    const report={success:false,testResults:[{
      name:'/workspace/src/test/harvo/example.test.ts',status:'failed',message:canary,
      assertionResults:[{status:'failed',fullName:canary,failureMessages:[canary]},
        {status:'passed'},{status:'skipped'},{status:'pending'}],console:[canary],
    },{name:'/workspace/src/test/setup_failure.test.ts',status:'failed',assertionResults:[],message:canary}]};
    const result=summarizeResults(report,'/workspace');
    expect(result).toMatchObject({filesFailed:2,filesPassed:0,passed:1,failed:1,pending:2});
    expect(result.files).toContainEqual({file:'src/test/setup_failure.test.ts',status:'failed',passed:0,failed:0,pending:0});
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(JSON.stringify(result)).not.toContain('/workspace');
  });
  it.each(['/secrets/private.test.ts','/workspace/src/test/user@example.test.ts','/workspace/src/test/../../private.test.ts'])('rejects untrusted artifact paths %s',name=>{
    expect(()=>summarizeResults({testResults:[{name,status:'passed',assertionResults:[]}]},'/workspace')).toThrow();
  });
  it('fails closed on unknown test outcomes rather than silently omitting them',()=>{
    expect(()=>summarizeResults({testResults:[{name:'/workspace/src/test/a.test.ts',status:'failed',assertionResults:[{status:'unexpected'}]}]},'/workspace')).toThrow();
  });
});
