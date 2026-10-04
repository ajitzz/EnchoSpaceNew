import {useEffect,useState} from 'react';
import type {PublicAcceptedOffer} from '../../types';
import {acceptedOfferIsCurrent,nextAcceptedOfferRefreshDelay} from '../../src/shared/offers/publicPrice';

/** A clock driven by external browser events, so render remains pure while a
 * long-lived tab stops displaying an offer at its effective/date boundary. */
export function useAcceptedOfferClock(offer:PublicAcceptedOffer|null|undefined):number{
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{
    const current=Date.now();
    const refresh=()=>setClock(Date.now());
    const statusChanged=acceptedOfferIsCurrent(offer,clock)!==acceptedOfferIsCurrent(offer,current);
    const nextDelay=nextAcceptedOfferRefreshDelay([offer],current);
    const timeout=statusChanged||nextDelay!==null
      ?window.setTimeout(refresh,statusChanged?0:nextDelay!):null;
    const onVisibility=()=>{if(!document.hidden)refresh();};
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',refresh);
    return()=>{
      if(timeout!==null)window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',refresh);
    };
  },[offer,clock]);
  return clock;
}
