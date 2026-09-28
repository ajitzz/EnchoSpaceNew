import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import pg from 'pg';
import {describe,it,expect} from 'vitest';
import {workforceConnectionConfig} from '../../server/operations/runtime.js';

// Local TLS handshake peer, not a database. No credentials or remote sockets.
// It implements PostgreSQL's SSLRequest response so pg itself verifies TLS.
async function tlsPeer(){
  const directory=mkdtempSync(join(tmpdir(),'encho-workforce-tls-'));
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
      '-subj','/CN=workforce-fixture.invalid','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem')],{stdio:'pipe'});
    const cert=readFileSync(join(directory,'cert.pem'));const key=readFileSync(join(directory,'key.pem'));
    const context=tls.createSecureContext({key,cert});const sockets=new Set<net.Socket>();
    const server=net.createServer(socket=>{
      sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
      socket.once('data',request=>{
        if(request.length!==8||request.readInt32BE(4)!==80877103){socket.destroy();return;}
        socket.write('S');const secure=new tls.TLSSocket(socket,{isServer:true,secureContext:context});
        secure.on('error',()=>secure.destroy());
      });
    });
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const address=server.address();if(!address||typeof address==='string')throw new Error('Local fixture not bound');
    return {port:address.port,cert,async close(){for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}};
  }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}

describe('R1-01 remote workforce TLS policy, local pg handshake evidence',()=>{
  it('rejects an untrusted CA and then rejects a trusted certificate for the wrong hostname',async()=>{
    const peer=await tlsPeer();
    try{
      const configured=workforceConnectionConfig({CR1_WORKFORCE_DATABASE_URL:'postgres://fixture:fixture@remote.invalid/db?sslmode=no-verify'});
      expect(configured?.ssl).toEqual({rejectUnauthorized:true});
      const strict=configured!.ssl as tls.ConnectionOptions;
      for(const [ssl,expected] of [[strict,'DEPTH_ZERO_SELF_SIGNED_CERT'],[{...strict,ca:peer.cert},'ERR_TLS_CERT_ALTNAME_INVALID']] as const){
        const client=new pg.Client({host:'127.0.0.1',port:peer.port,user:'fixture',database:'fixture',ssl,connectionTimeoutMillis:2000});
        try{await expect(client.connect()).rejects.toMatchObject({code:expected});}finally{await client.end();}
      }
    }finally{await peer.close();}
  },10000);
});
