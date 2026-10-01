import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import type {Express} from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const pool=new pg.Pool();
let app:Express;
let bearer:string;

beforeAll(async()=>{
  // The isolated runner substitutes pg-mem and strips real provider/database
  // secrets. A remote-shaped URL would not cause a network connection here.
  vi.stubEnv('DATABASE_URL','postgres://localhost/encho-commerce-fixture');
  app=(await import('../../server.js')).default;
  const user=await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,'hash','Legacy Commerce Test','user') RETURNING id",[`commerce-containment-${Date.now()}@example.invalid`]);
  bearer=`Bearer ${jwt.sign({id:Number(user.rows[0].id)},process.env.JWT_SECRET!,{algorithm:'HS256',expiresIn:'5m'})}`;
});

afterAll(async()=>{await pool.end();vi.unstubAllEnvs();});

describe('legacy commerce development safety at mounted HTTP boundary',()=>{
  it('refuses old booking, order and client verification mutations outside the isolated test runtime',async()=>{
    vi.stubEnv('NODE_ENV','development');
    try{
      const booking=await request(app).post('/api/bookings').set('Authorization',bearer).send({});
      expect(booking.status).toBe(503);
      expect(booking.body.code).toBe('STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE');

      const order=await request(app).post('/api/checkout/razorpay/order').set('Authorization',bearer).send({});
      expect(order.status).toBe(503);
      expect(order.body.code).toBe('CANONICAL_CHECKOUT_REQUIRED');

      const verify=await request(app).post('/api/payments/razorpay/verify').set('Authorization',bearer)
        .send({razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:'fixture'});
      expect(verify.status).toBe(410);
      expect(verify.body.code).toBe('SIGNED_PAYMENT_WEBHOOK_REQUIRED');
    }finally{
      vi.stubEnv('NODE_ENV','test');
    }
  });
});
