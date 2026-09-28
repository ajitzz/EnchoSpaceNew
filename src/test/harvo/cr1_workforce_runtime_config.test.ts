import {describe,it,expect,vi} from 'vitest';
import {workforceConnectionConfig,workforceRuntimeSettings,workforceOrigin,createOperationsRuntime} from '../../server/operations/runtime.js';
import {createWorkforceSessionRuntime} from '../../server/operations/sessionRuntime.js';

const explicit:NodeJS.ProcessEnv={
  NODE_ENV:'production',CR1_WORKFORCE_ENVIRONMENT:'PRODUCTION',
  CR1_WORKFORCE_ORIGIN:'https://ops.encho.test',
  CR1_WORKFORCE_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',
  CR1_WORKFORCE_GOOGLE_CLIENT_ID:'workforce-client.apps.googleusercontent.com',
  CR1_WORKFORCE_DATABASE_URL:'postgres://workforce:fixture@runtime.invalid/encho',
  CR1_WORKFORCE_IDENTITY_DATABASE_URL:'postgres://issuer:fixture@runtime.invalid/encho',
};

describe('R1-01 explicit workforce construction configuration (offline)',()=>{
  it('requires explicit environment, organization, origin and audience at construction',()=>{
    expect(workforceRuntimeSettings(explicit)).toEqual({environment:'PRODUCTION',organizationId:explicit.CR1_WORKFORCE_ORGANIZATION_ID,
      origin:explicit.CR1_WORKFORCE_ORIGIN,googleClientId:explicit.CR1_WORKFORCE_GOOGLE_CLIENT_ID});
    for(const name of ['CR1_WORKFORCE_ENVIRONMENT','CR1_WORKFORCE_ORGANIZATION_ID','CR1_WORKFORCE_ORIGIN','CR1_WORKFORCE_GOOGLE_CLIENT_ID']){
      const env={...explicit};delete env[name];
      Object.assign(env,{APP_URL:'https://general.test',ALLOWED_ORIGINS:'https://general.test',VERCEL_URL:'fallback.test',
        GOOGLE_ADS_CLIENT_ID:explicit.CR1_WORKFORCE_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_ID:explicit.CR1_WORKFORCE_GOOGLE_CLIENT_ID,
        VITE_GOOGLE_CLIENT_ID:explicit.CR1_WORKFORCE_GOOGLE_CLIENT_ID,HARVO_ALLOW_OWNER_ROLE:'true'});
      expect(()=>workforceRuntimeSettings(env)).toThrow('WORKFORCE_UNAVAILABLE');
      expect(createWorkforceSessionRuntime(env,vi.fn())).toBeNull();
      expect(createOperationsRuntime(env,vi.fn())).toBeNull();
    }
  });
  it('never obtains issuer authority from a shared runtime or general database URL',()=>{
    const noIssuer:NodeJS.ProcessEnv={...explicit,DATABASE_URL:explicit.CR1_WORKFORCE_IDENTITY_DATABASE_URL,HARVO_ALLOW_OWNER_ROLE:'true'};
    delete noIssuer.CR1_WORKFORCE_IDENTITY_DATABASE_URL;
    expect(createWorkforceSessionRuntime(noIssuer,vi.fn())).toBeNull();
    const noRuntime:NodeJS.ProcessEnv={...explicit,DATABASE_URL:explicit.CR1_WORKFORCE_DATABASE_URL};delete noRuntime.CR1_WORKFORCE_DATABASE_URL;
    expect(createWorkforceSessionRuntime(noRuntime,vi.fn())).toBeNull();
    expect(createOperationsRuntime(noRuntime,vi.fn())).toBeNull();
    expect(createWorkforceSessionRuntime({...explicit,CR1_WORKFORCE_DATABASE_URL:'invalid'},vi.fn())).toBeNull();
  });
  it('accepts loopback HTTP/database only under explicit LOCAL and rejects ambiguous origins',()=>{
    for(const environment of ['STAGING','PRODUCTION']){
      expect(workforceOrigin({...explicit,CR1_WORKFORCE_ENVIRONMENT:environment,CR1_WORKFORCE_ORIGIN:'http://localhost:3000'})).toBeNull();
      expect(()=>workforceConnectionConfig({...explicit,CR1_WORKFORCE_ENVIRONMENT:environment,CR1_WORKFORCE_DATABASE_URL:'postgres://runtime@localhost/local'})).toThrow();
    }
    expect(workforceOrigin({...explicit,NODE_ENV:'development',CR1_WORKFORCE_ENVIRONMENT:'LOCAL',CR1_WORKFORCE_ORIGIN:'http://localhost:3000'})).toBe('http://localhost:3000');
    expect(workforceConnectionConfig({CR1_WORKFORCE_ENVIRONMENT:'LOCAL',CR1_WORKFORCE_DATABASE_URL:'postgres://runtime@localhost/local'})?.ssl).toBe(false);
    for(const origin of ['https://ops.encho.test/path','https://ops.encho.test?x=y','https://user:pass@ops.encho.test','https://ops.encho.test#fragment'])
      expect(workforceOrigin({...explicit,CR1_WORKFORCE_ORIGIN:origin})).toBeNull();
  });
  it('does not permit URL options to disable TLS verification or alter role/session options',()=>{
    for(const options of ['sslmode=disable','sslmode=no-verify','sslmode=require','channel_binding=require']){
      const config=workforceConnectionConfig({...explicit,CR1_WORKFORCE_DATABASE_URL:`postgres://runtime:fixture@remote.invalid/encho?${options}`});
      expect(config?.ssl).toEqual({rejectUnauthorized:true});expect(config?.connectionString).not.toContain('?');
    }
    for(const options of ['sslcert=evil','sslrootcert=evil','sslpassword=evil','options=-c%20role%3Downer','application_name=other'])
      expect(()=>workforceConnectionConfig({...explicit,CR1_WORKFORCE_DATABASE_URL:`postgres://runtime:fixture@remote.invalid/encho?${options}`})).toThrow('WORKFORCE_UNAVAILABLE');
  });
});
