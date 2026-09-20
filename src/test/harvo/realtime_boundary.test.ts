import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createServer,type Server as HttpServer} from 'node:http';
import {Server} from 'socket.io';
import {io as connect,type Socket} from 'socket.io-client';
import jwt from 'jsonwebtoken';
import {registerSecureRealtime,type RealtimePrincipal} from '../../server/realtime.js';
import {originAllowed} from '../../server/deployment/origins.js';
import {hasAsciiControl} from '../../lib/intentionalText.js';
const secret='isolated-socket-fixture-not-a-deployment-secret';
let http:HttpServer,io:Server,origin:string,clients:Socket[],roles:Map<number,string>,members:Set<number>;
const once=(socket:Socket,event:string)=>new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`No ${event}`)),2000);socket.once(event,value=>{clearTimeout(timer);resolve(value);});});
const token=(id:number,role='admin')=>jwt.sign({id,role},secret,{expiresIn:'5m'});
async function client(signed?:string){const socket=connect(origin,{autoConnect:false,transports:['websocket'],reconnection:false,auth:signed?{token:signed}:{}});clients.push(socket);const ready=once(socket,'connect');socket.connect();await ready;return socket;}
async function joined(socket:Socket,room:string){await vi.waitFor(()=>expect(io.sockets.sockets.get(socket.id!)?.rooms.has(room)).toBe(true));}
async function startServer(recheckMs=25){
 roles=new Map([[10,'host'],[11,'guest'],[90,'admin']]);members=new Set([10,11]);clients=[];http=createServer();io=new Server(http);
 registerSecureRealtime(io,{recheckMs,authenticate:async signed=>{const claims=jwt.verify(signed,secret,{algorithms:['HS256']}) as jwt.JwtPayload;const role=roles.get(claims.id);if(!role)throw new Error('removed');return {id:claims.id,role,expiresAt:claims.exp!*1000};},canAccessThread:async(p:RealtimePrincipal,id:number)=>id===20&&members.has(p.id),isPublishedListing:async id=>id===100});
 await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(http.address() as any).port}`;
}
beforeEach(()=>startServer());
afterEach(async()=>{clients.forEach(socket=>socket.disconnect());await new Promise<void>(r=>io.close(()=>r()));});
describe('realtime tenant authority',()=>{
 it('denies anonymous private subscriptions but allows published listing presence',async()=>{
  const socket=await client();const denied=once(socket,'subscription_error');socket.emit('join_admin');expect(await denied).toEqual({code:'REALTIME_SUBSCRIPTION_DENIED'});expect(io.sockets.adapter.rooms.has('admin_room')).toBe(false);
  socket.emit('join_listing',100);await joined(socket,'listing_100');
  const unpublished=once(socket,'subscription_error');socket.emit('join_listing',101);await unpublished;expect(io.sockets.adapter.rooms.has('listing_101')).toBe(false);
 });
 it('uses persisted role rather than a signed role claim and rejects another personal room',async()=>{
  const socket=await client(token(10,'admin'));for(const [event,value] of [['join_admin',undefined],['join_user',11],['join_thread',99]]){const denied=once(socket,'subscription_error');socket.emit(event as string,value);await denied;}
  socket.emit('join_user',10);await joined(socket,'user_10');expect(io.sockets.adapter.rooms.has('user_11')).toBe(false);expect(io.sockets.adapter.rooms.has('admin_room')).toBe(false);
 });
 it('derives typing identity from the authenticated participant and requires membership',async()=>{
  const host=await client(token(10)),guest=await client(token(11));host.emit('join_thread',20);guest.emit('join_thread',20);await joined(host,'thread_20');await joined(guest,'thread_20');
  const typing=once(guest,'user_typing');host.emit('typing_start',{threadId:20,userId:90});expect(await typing).toEqual({userId:10});
  const denied=once(host,'subscription_error');host.emit('typing_start',{threadId:99,userId:11});await denied;
 });
 it('rejects forged and expired credentials during connection',async()=>{
  for(const signed of [jwt.sign({id:90},'wrong-secret',{expiresIn:'5m'}),jwt.sign({id:90},secret,{expiresIn:-1})]){
   const socket=connect(origin,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{token:signed}});clients.push(socket);const failure=once(socket,'connect_error');socket.connect();expect((await failure).message).toBe('REALTIME_AUTH_REQUIRED');
  }
 });
 it('disconnects a demoted administrator and withdraws the private room',async()=>{
  const socket=await client(token(90));socket.emit('join_admin');await joined(socket,'admin_room');const ended=once(socket,'disconnect');roles.set(90,'host');await ended;expect(io.sockets.adapter.rooms.has('admin_room')).toBe(false);
 });
 it('revokes old rooms when a demoted administrator sends a packet before revalidation',async()=>{
  await new Promise<void>(r=>io.close(()=>r()));await startServer(60_000);
  const socket=await client(token(90));socket.emit('join_admin');await joined(socket,'admin_room');
  const ended=once(socket,'disconnect');roles.set(90,'host');socket.emit('join_user',90);await ended;
  expect(io.sockets.adapter.rooms.has('admin_room')).toBe(false);expect(io.sockets.adapter.rooms.has('user_90')).toBe(false);
 });
 it('disconnects a removed thread participant on subscription revalidation',async()=>{
  const socket=await client(token(10));socket.emit('join_thread',20);await joined(socket,'thread_20');const ended=once(socket,'disconnect');members.delete(10);await ended;expect(io.sockets.adapter.rooms.has('thread_20')).toBe(false);
 });
});
it('compares complete origins for HTTP and websocket requests',()=>{
 const production={NODE_ENV:'production',ALLOWED_ORIGINS:' https://preview.encho.co.in '} as NodeJS.ProcessEnv;
 expect(originAllowed('https://www.encho.co.in',production)).toBe(true);expect(originAllowed('https://preview.encho.co.in',production)).toBe(true);
 for(const origin of ['https://www.encho.co.in.attacker.invalid','https://www.encho.co.in/path','https://www.encho.co.in@attacker.invalid','http://localhost:3000','https://unrelated.vercel.app'])expect(originAllowed(origin,production)).toBe(false);
 expect(originAllowed('http://localhost:3000',{NODE_ENV:'development'})).toBe(true);expect(originAllowed('http://localhost:3000',{NODE_ENV:'development',VERCEL:'1'})).toBe(false);
});
it('retains the exact ASCII control boundary and permits multilingual copy',()=>{
 for(let code=0;code<256;code++){expect(hasAsciiControl(String.fromCharCode(code))).toBe(code<32);expect(hasAsciiControl(String.fromCharCode(code),true)).toBe(code<32||code===127);}
 expect(hasAsciiControl('കേരളം • encho • ₹',true)).toBe(false);
});
