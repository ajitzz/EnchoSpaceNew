import {describe,expect,it} from 'vitest';
import dotenv from 'dotenv';
import net from 'node:net';
import {createServer} from 'node:http';

describe('test execution boundary',()=>{
  it('does not load application dotenv or inherit credential canaries',()=>{
    expect(dotenv.config({path:'.env'})).toEqual({parsed:{}});
    for(const key of ['ENCHO_AMBIENT_CANARY','DATABASE_URL','NEON_DATABASE_URL','GOOGLE_ADS_REFRESH_TOKEN','STRIPE_SECRET_KEY','RAZORPAY_KEY_SECRET','AWS_SECRET_ACCESS_KEY']) expect(process.env[key]).toBeUndefined();
  });
  it.each([{host:'example.com',port:443},{host:'169.254.169.254',port:80},{host:'127.0.0.1',port:5432},{path:'/tmp/production-db/.s.PGSQL.5432'}])('blocks non-fixture connections %j',options=>{
    const socket=new net.Socket();
    try{expect(()=>socket.connect(options)).toThrow('TEST_EXTERNAL_NETWORK_BLOCKED');}finally{socket.destroy();}
  });
  it('allows a local HTTP fixture and stops permitting its port after closure',async()=>{
    const server=createServer((_request,response)=>response.end('fixture response'));
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address() as net.AddressInfo;
    try{expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe('fixture response');}
    finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    const socket=new net.Socket();
    try{expect(()=>socket.connect({host:'127.0.0.1',port:address.port})).toThrow('TEST_EXTERNAL_NETWORK_BLOCKED');}finally{socket.destroy();}
  });
});
