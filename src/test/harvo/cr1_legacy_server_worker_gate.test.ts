import {describe,expect,it} from 'vitest';
import {legacyServerWorkersEnabled} from '../../server/deployment/legacyServerWorkerGate.js';

const local = 'postgresql://harvo_test@127.0.0.1:5432/disposable';
const optIn = {HARVO_LEGACY_SERVER_WORKERS_ENABLED:'local-disposable-only',NODE_ENV:'development'};

describe('legacy server interval safety',()=>{
  it('does not start legacy workers just because a development server has a database',()=>{
    expect(legacyServerWorkersEnabled({NODE_ENV:'development'},local)).toBe(false);
    expect(legacyServerWorkersEnabled({...optIn,HARVO_LEGACY_SERVER_WORKERS_ENABLED:'true'},local)).toBe(false);
  });

  it.each([
    'postgresql://worker@ep-example.neon.tech/encho?sslmode=require',
    'postgres://worker@db.example.com/encho',
    'postgresql://worker@localhost.evil.example/encho',
    'postgresql://dummy@127.0.0.1.evil.example/encho',
    'dummy_database_url',
    '',
  ])('refuses a non-local or invalid database even with explicit opt-in: %s',target=>{
    expect(legacyServerWorkersEnabled(optIn,target)).toBe(false);
  });

  it.each([
    {NODE_ENV:'production'},
    {NODE_ENV:'test'},
    {VERCEL:'1'},
    {NOW_REGION:'iad1'},
    {AWS_LAMBDA_FUNCTION_NAME:'encho'},
    {DISABLE_BACKGROUND_WORKERS:'true'},
  ])('refuses an unsafe runtime context: %j',extra=>{
    expect(legacyServerWorkersEnabled({...optIn,...extra},local)).toBe(false);
  });

  it.each([
    local,
    'postgres://harvo_test@localhost:5432/disposable',
    'postgresql://harvo_test@[::1]:5432/disposable',
  ])('allows explicit disposable loopback PostgreSQL: %s',target=>{
    expect(legacyServerWorkersEnabled(optIn,target)).toBe(true);
  });
});
