import {z} from 'zod';

const accountId=z.number().int().positive().safe();
const version=z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(value=>BigInt(value)<=9223372036854775807n);
const timestamp=z.string().datetime({offset:true});
export const notificationPreferenceMutationSchema=z.object({requestId:z.string().uuid(),expectedVersion:version,inAppAlerts:z.boolean()}).strict();
const externalChannel=z.object({channel:z.enum(['EMAIL','PUSH','SMS']),availability:z.literal('NOT_CONFIGURED'),consent:z.literal('NOT_RECORDED')}).strict();
export const notificationPreferencesSchema=z.object({
 accountId,version,inAppAlerts:z.boolean(),source:z.enum(['DEFAULT','SAVED']),updatedAt:timestamp.nullable(),
 externalChannels:z.tuple([externalChannel.extend({channel:z.literal('EMAIL')}),externalChannel.extend({channel:z.literal('PUSH')}),externalChannel.extend({channel:z.literal('SMS')})]),
}).strict().superRefine((value,ctx)=>{
 if((value.version==='0')!==(value.source==='DEFAULT')||(value.updatedAt===null)!==(value.source==='DEFAULT')||(value.source==='DEFAULT'&&!value.inAppAlerts))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid preference provenance'});
});
export const notificationPreferenceReceiptSchema=z.object({accountId,requestId:z.string().uuid(),previousVersion:version,version,inAppAlerts:z.boolean(),recordedAt:timestamp}).strict().refine(value=>BigInt(value.version)===BigInt(value.previousVersion)+1n,{message:'Invalid receipt version progression'});
export const notificationEvidenceQuerySchema=z.object({beforeId:z.string().uuid().optional(),limit:z.number().int().min(1).max(50).default(20)}).strict();
export const notificationEvidenceItemSchema=z.object({
 notificationId:z.string().uuid(),threadId:accountId,messageId:accountId,
 createdAt:timestamp,queueState:z.enum(['PENDING','RUNNING','RETRY','SUCCEEDED','DEAD','RECONCILIATION_REQUIRED']),attempts:z.number().int().min(0).max(100),
 socketHint:z.object({state:z.enum(['DISPATCH_RECORDED','NOT_RECORDED']),recordedAt:timestamp.nullable()}).strict(),
 deviceDelivery:z.literal('NOT_RECORDED'),
 readAcknowledgement:z.object({state:z.enum(['ACKNOWLEDGED','NOT_RECORDED']),recordedAt:timestamp.nullable()}).strict(),
}).strict().superRefine((value,ctx)=>{
 if((value.socketHint.state==='NOT_RECORDED')!==(value.socketHint.recordedAt===null)||(value.readAcknowledgement.state==='NOT_RECORDED')!==(value.readAcknowledgement.recordedAt===null))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid evidence provenance'});
});
export const notificationEvidencePageSchema=z.object({accountId,items:z.array(notificationEvidenceItemSchema).max(50),nextBeforeId:z.string().uuid().nullable()}).strict();
export type NotificationPreferences=z.infer<typeof notificationPreferencesSchema>;
export type NotificationPreferenceReceipt=z.infer<typeof notificationPreferenceReceiptSchema>;
export type NotificationEvidencePage=z.infer<typeof notificationEvidencePageSchema>;
