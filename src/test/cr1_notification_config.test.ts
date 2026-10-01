import {describe,it,expect} from 'vitest';
import {notificationConnectionConfig} from '../server/conversation/notificationRuntime.js';
import {participantNotificationConnectionConfig} from '../server/conversations/participantNotificationRuntime.js';
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

describe('CR1 notification participant connection isolation',()=>{
 it('does not inherit an ambient database or start without its separate credential',()=>{
  expect(participantNotificationConnectionConfig({DATABASE_URL:'postgres://owner:secret@db.example/app'})).toBeNull();
  expect(()=>participantNotificationConnectionConfig({CR1_CONVERSATION_NOTIFICATIONS_ENABLED:'true',DATABASE_URL:'postgres://owner:secret@db.example/app'})).toThrow('PARTICIPANT_NOTIFICATION_CONFIGURATION_REQUIRED');
 });
 it('requires strict remote TLS and refuses URL options that could change connection authority',()=>{
  const config=participantNotificationConnectionConfig({CR1_CONVERSATION_NOTIFICATIONS_ENABLED:'true',CR1_CONVERSATION_PARTICIPANT_DATABASE_URL:'postgres://participant:secret@db.example/app?sslmode=require&channel_binding=require'});
  expect(config?.ssl).toEqual({rejectUnauthorized:true});
  expect(config?.connectionString).not.toMatch(/sslmode|channel_binding/);
  expect(config?.max).toBe(2);
  for(const uri of ['dummy','postgres://participant@db.example/app','postgres://participant:secret@db.example/app?options=-c%20row_security%3Doff']) {
   expect(()=>participantNotificationConnectionConfig({CR1_CONVERSATION_NOTIFICATIONS_ENABLED:'true',CR1_CONVERSATION_PARTICIPANT_DATABASE_URL:uri})).toThrow('PARTICIPANT_NOTIFICATION_CONFIGURATION_INVALID');
  }
  expect(()=>participantNotificationConnectionConfig({NODE_ENV:'production',CR1_CONVERSATION_NOTIFICATIONS_ENABLED:'true',CR1_CONVERSATION_PARTICIPANT_DATABASE_URL:'postgres://participant@localhost/app'})).toThrow('PARTICIPANT_NOTIFICATION_CONFIGURATION_INVALID');
 });
});
