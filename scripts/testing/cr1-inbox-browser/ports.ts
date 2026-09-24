// Browser fixture ports only; these adapters are never imported by product code.
const fixtureIdentity={user:{id:10,name:'Guest fixture'},token:'fixture-session'};
export const useAuth=()=>fixtureIdentity;
export const uiAudio={playClick(){},playPop(){}};
export const OFFLINE_MUTATION_COMMITTED_EVENT='encho:offline-mutation-committed';
export async function fetchWithCache(url:string,_key:string,options:RequestInit){const response=await fetch(url,options);if(!response.ok)throw new Error('Fixture API unavailable');return response.json();}
export async function queueMutationWithReceipt(url:string,method:string,body:unknown,headers:Record<string,string>){const response=await fetch(url,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});return response.ok?{status:'COMMITTED',mutationId:'fixture',data:await response.json()}:{status:'QUEUED',mutationId:'fixture'};}
const handlers=new Map<string,(value:unknown)=>void>();
Object.assign(window,{fixtureConversationEvent:(name:string,value:unknown)=>handlers.get(name)?.(value)});
export const io=()=>({connected:true,emit(){},on(name:string,handler:(value:unknown)=>void){handlers.set(name,handler);},off(name:string){handlers.delete(name);},disconnect(){handlers.clear();}});
