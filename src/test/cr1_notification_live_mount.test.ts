import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import type {Express} from 'express';
import {publicApiErrorSchema} from '../shared/platform/apiError.js';

const secret='notification-live-mount-local-secret-0000000000000000';
const pool=new pg.Pool();
let app:Express;
let token:string;

beforeAll(async()=>{
  vi.stubEnv('DATABASE_URL','postgres://localhost/encho-notification-mount-fixture');
  vi.stubEnv('JWT_SECRET',secret);
  vi.stubEnv('META_API_TOKEN','local-fixture-token');
  vi.stubEnv('CR1_CONVERSATION_NOTIFICATIONS_ENABLED','true');
  vi.stubEnv('CR1_CONVERSATION_PARTICIPANT_DATABASE_URL','postgres://participant@localhost/encho-notification-mount-fixture');
  vi.stubEnv('CONVERSATION_NOTIFICATION_REDIS_REST_URL',undefined);
  vi.stubEnv('CONVERSATION_NOTIFICATION_REDIS_REST_TOKEN',undefined);
  app=(await import('../../server.js')).default;
  const result=await pool.query("INSERT INTO users (phone,email,name,role) VALUES ($1,$2,$3,$4) RETURNING id",
    ['+919199900150','notification-mount@example.invalid','Notification Mount Fixture','user']);
  token=jwt.sign({id:result.rows[0].id,role:'user',email:'notification-mount@example.invalid'},secret,{expiresIn:'5m'});
});

afterAll(async()=>{await pool.end();vi.unstubAllEnvs();});

describe('R4-01 enabled notification server composition',()=>{
  it('fails closed before a preference write if the dedicated Redis identity is absent',async()=>{
    const url='/api/conversations/v1/notifications/preferences';
    const body={requestId:'33333333-3333-4333-8333-333333333333',expectedVersion:'0',inAppAlerts:false};
    const unauthorized=await supertest(app).put(url).set('X-Encho-Conversation-Command','1').send(body);
    expect(unauthorized.status).toBe(401);
    const response=await supertest(app).put(url).set('Authorization',`Bearer ${token}`)
      .set('X-Encho-Conversation-Command','1').send(body);
    expect(response.status).toBe(503);
    expect(publicApiErrorSchema.parse(response.body)).toMatchObject({code:'DEPENDENCY_UNAVAILABLE',retryability:'AFTER_DELAY'});
  });
});
