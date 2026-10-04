import type pg from 'pg';

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
    for(const key of url.searchParams.keys())if(!['sslmode','channel_binding'].includes(key))throw new Error();
    url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
    return{connectionString:url.toString(),ssl:local?false:{rejectUnauthorized:true},
      max:4,connectionTimeoutMillis:8_000,idleTimeoutMillis:10_000,statement_timeout:10_000,
      allowExitOnIdle:true,application_name:'encho_accepted_offers'};
  }catch{throw new Error('OFFER_AUTHORITY_UNAVAILABLE');}
}
