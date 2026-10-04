import {operationsWorkspaceSchema,type OperationsWorkspace} from '../../src/shared/iam/workspace.js';

/** Navigation evidence only. The offer endpoints always recheck the staff session and exact scoped grant. */
export function currentOfferReviewWorkspace(raw:unknown,now=Date.now()):OperationsWorkspace|null{
  const parsed=operationsWorkspaceSchema.safeParse(raw);
  if(!parsed.success)return null;
  const workspace=parsed.data;
  if(workspace.member.state!=='ACTIVE'||workspace.session.state!=='ACTIVE'||
    Date.parse(workspace.session.expiresAt)<=now||Date.parse(workspace.freshUntil)<=now)return null;
  return workspace.desks.some(desk=>desk.permittedActions.includes('offer.read')||desk.permittedActions.includes('offer.accept'))
    ?workspace:null;
}
