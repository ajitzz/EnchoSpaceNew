import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ServiceDesk from '../../../components/operations/ServiceDesk.js';
import {OperationsShell} from '../../../components/operations/OperationsShell.js';
import {serviceContent,serviceWorkspace,serviceCaseId} from './fixture.js';

const started=Date.now();
const scenario=new URLSearchParams(location.search).get('scenario')??'ready';
const calls:{path:string;request:Record<string,unknown>}[]=[];
let noteFailures=0;let savedNote:string|null=null;
window.fetch=async(input,init)=>{
 const path=String(input);const request=JSON.parse(String(init?.body??'{}'));
 calls.push({path,request});
 if(scenario==='unavailable')return new Response('{}',{status:503});
 if(scenario==='denied')return new Response('{}',{status:403});
 if(path.endsWith('/notes')){
  if(scenario==='retry'&&noteFailures++===0)return new Response('{}',{status:503});
  savedNote=String(request.body);return new Response(JSON.stringify({id:'1',caseId:serviceCaseId}));
 }
 const result=serviceContent(started);
 if(savedNote)result.internalNotes=[{id:'1',body:savedNote,author_membership_id:serviceWorkspace(started).member.membershipId,created_at:new Date().toISOString()}];
 return new Response(JSON.stringify(result));
};
function Fixture(){
 const [workspace,setWorkspace]=useState(()=>{
  const result=serviceWorkspace(started);result.work.items[0].permittedActions=['RELEASE'];
  if(scenario==='empty')result.work={items:[],nextCursor:null,total:0};
  if(scenario==='unclaimed'){result.work.items[0].state='ASSIGNED';result.work.items[0].leaseExpiresAt=null;result.work.items[0].permittedActions=['CLAIM'];}
  if(scenario==='expiry')result.work.items[0].leaseExpiresAt=new Date(started+3500).toISOString();
  return result;
 });
 return <><OperationsShell state={{status:'READY',workspace}} activeDeskId="service" onRefresh={()=>undefined} renderDesk={(_desk,data)=><ServiceDesk workspace={data}/>} />
  <button type="button" data-testid="replace-session" onClick={()=>setWorkspace(w=>({...w,session:{...w.session,id:'99999999-9999-4999-8999-999999999999'}}))}>Replace fixture session</button>
  <output data-testid="calls" hidden>{JSON.stringify(calls)}</output>
 </>;
}
Object.assign(window,{serviceFixtureCalls:calls});
createRoot(document.getElementById('root')!).render(<Fixture/>);
