import {describe,expect,it} from 'vitest';
import {legacyCommerceTestSandboxEnabled} from '../../server/deployment/legacyCommerceSandbox.js';

const synthetic='postgresql://test:test@encho-test.invalid/encho_test';
const local='postgresql://test@127.0.0.1:5432/encho_test';
const env={NODE_ENV:'test',ENCHO_TEST_SANDBOX:'1',TEST_DATABASE_URL:synthetic};

describe('retired booking/payment route test authority',()=>{
  it.each([synthetic,local])('permits only isolated test database shapes: %s',target=>{
    expect(legacyCommerceTestSandboxEnabled(env,target)).toBe(true);
  });
  it.each([
    [{NODE_ENV:'development',ENCHO_TEST_SANDBOX:'1'},local],
    [{NODE_ENV:'production',ENCHO_TEST_SANDBOX:'1'},local],
    [{NODE_ENV:'test'},synthetic],
    [{...env,VERCEL:'1'},synthetic],
    [env,'postgresql://worker@ep-example.neon.tech/encho?sslmode=require'],
    [env,'postgresql://worker@localhost.evil.example/encho'],
  ] as const)('refuses non-test or non-local commerce authority: %j', (candidate,target)=>{
    expect(legacyCommerceTestSandboxEnabled(candidate,target)).toBe(false);
  });
});
