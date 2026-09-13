import {z} from 'zod';
const id=z.string().uuid(), amount=z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(v=>BigInt(v)<=9223372036854775807n,'Amount exceeds supported range');
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid date');
const text=z.string().trim().min(1).max(255),note=z.string().trim().min(20).max(3000),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const settlementProvider=z.enum(['GOOGLE','META']);
export const settlementDocumentSchema=z.object({
 kind:z.enum(['PROVIDER_INVOICE','CAMPAIGN_BILLING_DETAIL','BILLING_CLOSURE','COST_INVOICE','TAX_STATEMENT']),
 issuer:z.enum(['GOOGLE','META','STRIPE','RAZORPAY','ACCOUNTANT']),provider:settlementProvider.optional(),
 accountId:text,externalDocumentId:text,campaignExternalId:text.optional(),currency:z.enum(['INR','USD']),totalMinor:amount,
 periodStart:day,periodEnd:day,issuedAt:z.string().datetime(),sourceUrl:z.string().url().max(2000),
 policyReference:text.optional(),description:note,contentType:z.enum(['application/pdf','text/csv','application/json']),
 contentBase64:z.string().min(1).max(6990508),
}).strict().refine(v=>v.periodEnd>=v.periodStart,'Billing period is reversed');
export const settlementProposalSchema=z.object({
 campaignId:z.number().int().positive(),revision:z.number().int().positive(),reservationId:id,
 allocations:z.array(z.object({code:z.string().regex(/^[A-Z][A-Z0-9_]{0,49}$/),amountMinor:amount,invoiceDocumentId:id.optional(),invoiceAllocations:z.array(z.object({documentId:id,amountMinor:amount}).strict()).min(1).max(12).optional(),note}).strict().refine(v=>!(v.invoiceDocumentId&&v.invoiceAllocations),'Use either one invoice or explicit invoice splits')).min(1).max(50),
 remittanceTaxMinor:amount,taxDocumentId:id.optional(),
 closures:z.array(z.object({provider:settlementProvider,accountId:text,externalCampaignId:text,invoiceDocumentIds:z.array(id).min(1).max(12),detailDocumentId:id,closureDocumentId:id}).strict()).min(1).max(2),
 policyReference:text,note,
}).strict();
export const settlementReviewSchema=z.object({fingerprint:sha,decision:z.enum(['APPROVE','REJECT']),note,independentVerificationReference:note,checkedDocuments:z.array(z.object({id,sha256:sha}).strict()).min(1).max(60)}).strict();
export const settlementCommitSchema=z.object({fingerprint:sha}).strict();
const pageSearch=z.string().trim().max(100).default('');
export const settlementListQuerySchema=z.object({before:id.optional(),campaignBefore:z.coerce.number().int().positive().optional(),search:pageSearch}).strict();
export const settlementDocumentQuerySchema=z.object({before:id.optional(),search:pageSearch}).strict();
export type SettlementListQuery=z.input<typeof settlementListQuerySchema>;
export type SettlementDocumentQuery=z.input<typeof settlementDocumentQuerySchema>;
export type SettlementDocumentInput=z.infer<typeof settlementDocumentSchema>;
export type SettlementProposalInput=z.infer<typeof settlementProposalSchema>;
export type SettlementReviewInput=z.infer<typeof settlementReviewSchema>;
