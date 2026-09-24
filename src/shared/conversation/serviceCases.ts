import {z} from 'zod';

// Client-safe projections. No internal permission grants, credentials or private
// case notes are included in the participant status contract.
const id=z.number().int().positive().safe();
const sequence=z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(value=>BigInt(value)<=9223372036854775807n);
export const serviceCaseAssignmentSchema=z.object({caseId:z.string().uuid(),assignmentId:z.string().uuid(),assignmentVersion:z.number().int().positive(),assignmentFence:sequence}).strict();
export const serviceCaseRequestSchema=z.object({threadId:id,requestId:z.string().uuid(),disclosureVersion:z.string().regex(/^[a-z0-9][a-z0-9._:-]{2,99}$/),acceptAssistance:z.literal(true)}).strict();
export const serviceCaseReadSchema=serviceCaseAssignmentSchema.extend({beforeSequence:sequence.refine(value=>BigInt(value)>0n).optional(),limit:z.number().int().min(1).max(100).default(50)}).strict();
export const serviceCaseNoteSchema=serviceCaseAssignmentSchema.extend({requestId:z.string().uuid(),body:z.string().trim().min(1).max(4000)}).strict();
export const publicServiceCaseSchema=z.object({id:z.string().uuid(),threadId:id,state:z.enum(['OPEN','WITHDRAWN']),version:z.number().int().positive(),disclosureVersion:z.string()}).strict();
export const serviceCaseContentSchema=z.object({caseId:z.string().uuid(),threadId:id,receiptId:z.string().uuid(),messages:z.array(z.object({id,thread_id:id,sender_id:id.nullable(),receiver_id:id.nullable(),content:z.string(),conversation_sequence:sequence,created_at:z.string().nullable()}).strict()).max(100),internalNotes:z.array(z.object({id:sequence,body:z.string(),author_membership_id:z.string().uuid(),created_at:z.string()}).strict()).max(100)}).strict().superRefine((value,context)=>{
 if(new Set(value.messages.map(message=>message.id)).size!==value.messages.length||value.messages.some((message,index)=>message.thread_id!==value.threadId||BigInt(message.conversation_sequence)<=0n||(index>0&&BigInt(message.conversation_sequence)<=BigInt(value.messages[index-1].conversation_sequence))))context.addIssue({code:'custom',path:['messages'],message:'Message identities and sequence must match the bounded conversation.'});
 if(new Set(value.internalNotes.map(note=>note.id)).size!==value.internalNotes.length)context.addIssue({code:'custom',path:['internalNotes'],message:'Duplicate internal note identity.'});
});
export type ServiceCaseContent=z.infer<typeof serviceCaseContentSchema>;
export const serviceCaseStatusSchema=z.object({case:publicServiceCaseSchema.nullable(),disclosureVersion:z.string()}).strict();
export const serviceCaseWithdrawSchema=z.object({caseId:z.string().uuid(),expectedVersion:z.number().int().positive()}).strict();
export const serviceCaseNoteResultSchema=z.object({id:sequence,caseId:z.string().uuid()}).strict();
export type PublicServiceCase=z.infer<typeof publicServiceCaseSchema>;
export type ServiceCaseStatus=z.infer<typeof serviceCaseStatusSchema>;
