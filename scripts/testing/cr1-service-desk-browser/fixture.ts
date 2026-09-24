import type {OperationsWorkspace} from '../../../src/shared/iam/workspace.js';
import type {ServiceCaseContent} from '../../../src/shared/conversation/serviceCases.js';

// Synthetic isolated test data only; never imported by application composition.
export const serviceCaseId='77777777-7777-4777-8777-777777777777';
export const serviceAssignmentId='11111111-1111-4111-8111-111111111111';
export function serviceWorkspace(now:number):OperationsWorkspace{
 const iso=(delta:number)=>new Date(now+delta).toISOString();
 return {schemaVersion:1,generatedAt:iso(-1000),freshUntil:iso(300000),correlationId:'service.fixture',
  organization:{id:'22222222-2222-4222-8222-222222222222',displayName:'Isolated Encho team'},
  member:{membershipId:'33333333-3333-4333-8333-333333333333',displayName:'Fixture operator',state:'ACTIVE'},
  session:{id:'44444444-4444-4444-8444-444444444444',state:'ACTIVE',expiresAt:iso(3600000)},
  desks:[{id:'service',permittedActions:['service.read','service.note']}],
  work:{items:[{id:serviceAssignmentId,deskId:'service',title:'Help with a stay inquiry',resourceLabel:'Isolated forest stay',resource:{type:'SERVICE_CASE',id:serviceCaseId},state:'CLAIMED',priority:'NORMAL',version:2,fence:'1',assignedAt:iso(-10000),dueAt:null,leaseExpiresAt:iso(240000),permittedActions:['OPEN','RELEASE'],blockers:[]}],nextCursor:null,total:1},
  audit:{state:'NOT_PERMITTED',latestReceiptAt:null},workforce:{state:'ACTIVE',explanation:null}};
}
export function serviceContent(now:number):ServiceCaseContent{
 return {caseId:serviceCaseId,threadId:10,receiptId:'55555555-5555-4555-8555-555555555555',messages:[
  {id:1,thread_id:10,sender_id:10,receiver_id:20,content:'Does the stay have a quiet workspace?',conversation_sequence:'1',created_at:new Date(now-60000).toISOString()},
  {id:2,thread_id:10,sender_id:20,receiver_id:10,content:'Yes, the reading room is available to guests.',conversation_sequence:'2',created_at:new Date(now-30000).toISOString()},
 ],internalNotes:[]};
}
