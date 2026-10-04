import type pg from 'pg';
import {isAbsolute, normalize, sep} from 'node:path';

/** Dedicated non-owner offer connection. Schema/service checks enforce the role's RLS boundary. */
export function acceptedOfferConnectionConfig(env:NodeJS.ProcessEnv):pg.PoolConfig|null{
  const configured=env.ACCEPTED_OFFER_DATABASE_URL;
  if(!configured)return null;
  try{
    const url=new URL(configured);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||url.pathname.length<2||url.hash)throw new Error();
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(!local&&!url.password)throw new Error();
    if(local&&env.CR1_WORKFORCE_ENVIRONMENT!=='LOCAL')throw new Error();
    const socketHost=url.searchParams.get('host');
    const socketPort=url.searchParams.get('port');
    // A disposable local PostgreSQL cluster listens on a Unix socket only.
    // URL host/port overrides are accepted solely for that local test shape;
    // production Neon URLs cannot redirect the connection through query args.
    if(socketHost!==null||socketPort!==null){
      if(!local||env.CR1_WORKFORCE_ENVIRONMENT!=='LOCAL'||
        !socketHost||!isAbsolute(socketHost)||normalize(socketHost)!==socketHost||
        socketHost.split(sep).includes('..')||socketHost.includes('\0')||
        !socketPort||!/^[1-9]\d{0,4}$/.test(socketPort)||Number(socketPort)>65535)throw new Error();
    }
    for(const key of url.searchParams.keys())
      if(!['sslmode','channel_binding',...(socketHost!==null?['host','port']:[])].includes(key))throw new Error();
    url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
    return{connectionString:url.toString(),ssl:local?false:{rejectUnauthorized:true},
      max:4,connectionTimeoutMillis:8_000,idleTimeoutMillis:10_000,statement_timeout:10_000,
      allowExitOnIdle:true,application_name:'encho_accepted_offers'};
  }catch{throw new Error('OFFER_AUTHORITY_UNAVAILABLE');}
}
