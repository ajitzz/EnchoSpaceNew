import {describe,expect,it} from 'vitest';
import {legacySchemaBootstrapEnabled} from '../../server/deployment/legacySchemaBootstrapGate.js';

const local = 'postgresql://harvo_test@127.0.0.1:5432/disposable';
const isolatedTest = 'postgresql://test:test@encho-test.invalid/encho_test';
const optIn = {HARVO_LOCAL_SCHEMA_BOOTSTRAP_ENABLED:'local-disposable-only',NODE_ENV:'development'};

describe('legacy startup schema-write authority',()=>{
  it('does not bootstrap a development database by default',()=>{
    expect(legacySchemaBootstrapEnabled({NODE_ENV:'development'},local)).toBe(false);
  });

  it.each([
    'postgresql://worker@ep-example.neon.tech/encho?sslmode=require',
    'postgres://worker@db.example.com/encho',
    'postgresql://worker@localhost.evil.example/encho',
    'dummy_database_url',
    '',
  ])('does not write through a remote or invalid URL: %s',target=>{
    expect(legacySchemaBootstrapEnabled(optIn,target)).toBe(false);
  });

  it.each([
    {NODE_ENV:'production'},
    {VERCEL:'1'},
    {NOW_REGION:'iad1'},
    {AWS_LAMBDA_FUNCTION_NAME:'encho'},
  ])('does not authorize bootstrap in a production/serverless context: %j',extra=>{
    expect(legacySchemaBootstrapEnabled({...optIn,...extra},local)).toBe(false);
  });

  it('keeps the isolated synthetic pg-mem test database working, but rejects lookalikes',()=>{
    const env={NODE_ENV:'test',ENCHO_TEST_SANDBOX:'1',TEST_DATABASE_URL:isolatedTest};
    expect(legacySchemaBootstrapEnabled(env,isolatedTest)).toBe(true);
    expect(legacySchemaBootstrapEnabled(env,'postgres://localhost/encho-auth-fixture')).toBe(true);
    expect(legacySchemaBootstrapEnabled({...env,ENCHO_TEST_SANDBOX:'0'},isolatedTest)).toBe(false);
    expect(legacySchemaBootstrapEnabled({...env,ENCHO_TEST_SANDBOX:'0'},local)).toBe(false);
    expect(legacySchemaBootstrapEnabled({...env,VERCEL:'1'},isolatedTest)).toBe(false);
    expect(legacySchemaBootstrapEnabled({...env,TEST_DATABASE_URL:'postgresql://test@ep-example.neon.tech/encho'},'postgresql://test@ep-example.neon.tech/encho')).toBe(false);
  });

  it.each([local,'postgres://harvo_test@localhost:5432/disposable','postgresql://harvo_test@[::1]:5432/disposable'])('allows exact local disposable opt-in: %s',target=>{
    expect(legacySchemaBootstrapEnabled(optIn,target)).toBe(true);
  });
});
