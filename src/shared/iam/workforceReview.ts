import {z} from 'zod';
import {workforceEnvironmentSchema,workforceProviderSchema,workforceResourceTypeSchema} from './contracts.js';
import {principalTraceIdSchema} from './principalContext.js';

const uuid=z.string().uuid(),time=z.string().datetime({offset:true}),count=z.number().int().nonnegative().safe();
export const workforceReviewRequestSchema=z.object({
  memberAfter:uuid.optional(),grantAfter:uuid.optional(),invitationAfter:uuid.optional(),
  limit:z.number().int().min(1).max(50).default(25),
}).strict();
export type WorkforceReviewRequest=z.input<typeof workforceReviewRequestSchema>;
const membership=z.object({
  id:uuid,accountId:z.number().int().positive().safe(),state:z.enum(['ACTIVE','SUSPENDED','OFFBOARDED']),
  version:z.number().int().positive(),acceptedAt:time,expiresAt:time.nullable(),updatedAt:time,
  effectiveState:z.enum(['ACTIVE','EXPIRED','SUSPENDED','OFFBOARDED']),
}).strict();
const grant=z.object({
  id:uuid,membershipId:uuid,accountId:z.number().int().positive().safe(),
  role:z.object({versionId:uuid,key:z.string().min(1).max(80),name:z.string().min(2).max(120),version:z.number().int().positive()}).strict(),
  scope:z.object({type:workforceResourceTypeSchema,id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/)}).strict(),
  provider:workforceProviderSchema.nullable(),environment:workforceEnvironmentSchema,
  maxAmountMinor:z.string().regex(/^(0|[1-9]\d{0,18})$/).nullable(),
  validFrom:time,validUntil:time.nullable(),revokedAt:time.nullable(),
  state:z.enum(['CURRENT','SCHEDULED','EXPIRED','REVOKED','MEMBERSHIP_INACTIVE']),
}).strict();
const invitation=z.object({
  id:uuid,environment:workforceEnvironmentSchema,status:z.enum(['PENDING','EXPIRED_PENDING']),
  createdAt:time,expiresAt:time,
}).strict();
const action=z.object({
  permission:z.enum(['workforce.invite','workforce.grant','workforce.suspend','workforce.access_review']),permissionGranted:z.boolean(),stepUpRequired:z.boolean(),
  independentApprovalRequired:z.boolean(),execution:z.literal('SEPARATE_PROTECTED_COMMAND'),
}).strict();
function page<T extends z.ZodType>(item:T){return z.object({items:z.array(item).max(50),total:count,nextCursor:uuid.nullable()}).strict();}
export const workforceReviewSchema=z.object({
  schemaVersion:z.literal(1),kind:z.literal('CURRENT_WORKFORCE_EVIDENCE'),
  generatedAt:time,freshUntil:time,correlationId:principalTraceIdSchema,receiptId:uuid,
  organization:z.object({id:uuid,displayName:z.string().min(2).max(160)}).strict(),
  environment:workforceEnvironmentSchema,
  policy:z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),approvalStatus:z.enum(['PENDING_FOUNDER_OPERATIONAL_APPROVAL','APPROVED'])}).strict(),
  members:page(membership),grants:page(grant),invitations:page(invitation),
  protectedActions:z.array(action).max(5),formalReviewAccepted:z.literal(false),
}).strict().superRefine((value,context)=>{
  if(Date.parse(value.freshUntil)<=Date.parse(value.generatedAt))context.addIssue({code:'custom',path:['freshUntil'],message:'Evidence expiry must follow observation.'});
  for(const key of ['members','grants','invitations'] as const){
    const current=value[key];
    if(current.total<current.items.length||new Set(current.items.map(item=>item.id)).size!==current.items.length)
      context.addIssue({code:'custom',path:[key],message:'Invalid page count or duplicate identity.'});
    if(current.nextCursor!==null&&current.nextCursor!==current.items.at(-1)?.id)
      context.addIssue({code:'custom',path:[key,'nextCursor'],message:'Cursor must identify the last visible row.'});
  }
  if(value.grants.items.some(item=>item.environment!==value.environment)||value.invitations.items.some(item=>item.environment!==value.environment))
    context.addIssue({code:'custom',path:['environment'],message:'Evidence cannot cross its authorized environment.'});
  if(new Set(value.protectedActions.map(item=>item.permission)).size!==value.protectedActions.length)
    context.addIssue({code:'custom',path:['protectedActions'],message:'Duplicate protected action.'});
});
export type WorkforceReview=z.infer<typeof workforceReviewSchema>;
