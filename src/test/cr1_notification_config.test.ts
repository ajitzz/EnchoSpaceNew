import {describe,it,expect} from 'vitest';
import {notificationConnectionConfig} from '../server/conversation/notificationRuntime.js';
describe('CR1 notification worker explicit isolation',()=>{
 it('does not activate or reuse ambient production credentials without explicit configuration',()=>{
  expect(notificationConnectionConfig({DATABASE_URL:'postgres://owner:secret@production.invalid/app'})).toBeNull();
  expect(()=>notificationConnectionConfig({CR1_NOTIFICATION_WORKER_ENABLED:'true',DATABASE_URL:'postgres://owner:secret@production.invalid/app'})).toThrow('NOTIFICATION_RUNTIME_CONFIGURATION_REQUIRED');
 });
 it('requires remote TLS validation and removes URL parameters that could override TLS',()=>{
  const config=notificationConnectionConfig({CR1_NOTIFICATION_WORKER_ENABLED:'true',CR1_NOTIFICATION_DATABASE_URL:'postgres://queue:secret@db.example/app?sslmode=require&channel_binding=require'});
  expect(config?.ssl).toEqual({rejectUnauthorized:true});expect(config?.connectionString).not.toContain('sslmode');expect(config?.max).toBe(2);
 });
 it('rejects arbitrary options and masks configuration parsing failures',()=>{
  for(const uri of ['dummy-secret','postgres://queue:secret@db.example/app?options=anything','postgres://queue@db.example/app']){
   expect(()=>notificationConnectionConfig({CR1_NOTIFICATION_WORKER_ENABLED:'true',CR1_NOTIFICATION_DATABASE_URL:uri})).toThrow('NOTIFICATION_RUNTIME_CONFIGURATION_INVALID');
  }
 });
});
