import type pg from 'pg';
import {ConversationNotifications} from '../../lib/conversations/notifications.js';
import {parsePrincipalContext} from '../../shared/iam/principalContext.js';
import {requireExecutionContext} from '../../lib/observability/executionContext.js';

export interface ParticipantNotificationRuntime {
 preferences:(accountId:number)=>ReturnType<ConversationNotifications['preferences']>;
 setPreference:(accountId:number,input:unknown)=>ReturnType<ConversationNotifications['setPreference']>;
 evidence:(accountId:number,input:unknown)=>ReturnType<ConversationNotifications['evidence']>;
}
/** Uses the restricted participant pool; never opens ambient credentials or
 * interprets feature enablement as consent or database permission. */
export function createConversationNotificationRuntime(env:NodeJS.ProcessEnv,participantPool:pg.Pool):ParticipantNotificationRuntime|null{
 if(env.CR1_CONVERSATION_NOTIFICATIONS_ENABLED!=='true')return null;
 const service=new ConversationNotifications(participantPool);
 const account=(accountId:number)=>{
  const {correlationId,operationId}=requireExecutionContext();
  return parsePrincipalContext({accountId,actorKind:'ACCOUNT',assuranceLevel:'AAL1',authenticatedAt:new Date().toISOString(),correlationId,operationId});
 };
 return {preferences:id=>service.preferences(account(id)),setPreference:(id,input)=>service.setPreference(account(id),input),evidence:(id,input)=>service.evidence(account(id),input)};
}
