import {describe,expect,it} from 'vitest';
import {acceptedOfferConnectionConfig} from '../server/offers/runtime.js';

describe('W1 accepted-offer connection boundary',()=>{
  it('permits a local Unix-socket disposable role without allowing URL overrides remotely',()=>{
    const local=acceptedOfferConnectionConfig({CR1_WORKFORCE_ENVIRONMENT:'LOCAL',
      ACCEPTED_OFFER_DATABASE_URL:'postgresql://w1_offer_public@localhost/postgres?host=%2Ftmp%2Fw1-socket&port=43210'});
    expect(local?.ssl).toBe(false);
    expect(local?.connectionString).toContain('host=%2Ftmp%2Fw1-socket');
    expect(()=>acceptedOfferConnectionConfig({CR1_WORKFORCE_ENVIRONMENT:'PRODUCTION',
      ACCEPTED_OFFER_DATABASE_URL:'postgresql://w1_offer_public@localhost/postgres?host=%2Ftmp%2Fw1-socket&port=43210'}))
      .toThrow('OFFER_AUTHORITY_UNAVAILABLE');
    expect(()=>acceptedOfferConnectionConfig({CR1_WORKFORCE_ENVIRONMENT:'LOCAL',
      ACCEPTED_OFFER_DATABASE_URL:'postgresql://role:secret@neon.example/postgres?host=%2Ftmp%2Fw1-socket&port=43210'}))
      .toThrow('OFFER_AUTHORITY_UNAVAILABLE');
    expect(()=>acceptedOfferConnectionConfig({CR1_WORKFORCE_ENVIRONMENT:'LOCAL',
      ACCEPTED_OFFER_DATABASE_URL:'postgresql://role@localhost/postgres?host=remote.example&port=5432'}))
      .toThrow('OFFER_AUTHORITY_UNAVAILABLE');
  });
});
