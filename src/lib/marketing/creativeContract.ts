import { z } from 'zod';
export const creativeFormatSchema = z.enum(['SQUARE', 'PORTRAIT', 'STORY', 'LANDSCAPE']);
export const creativeStateSchema = z.enum(['QUEUED', 'PROCESSING', 'HOST_REVIEW', 'ADMIN_REVIEW', 'APPROVED', 'REJECTED', 'BLOCKED']);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.coerce.number().int().positive().safe();
export const creativeRequestSchema = z.object({ listingId: id, sourceAssetId: z.string().regex(/^[1-9]\d*$/), formats: z.array(creativeFormatSchema).min(1).max(4).refine(a => new Set(a).size === a.length, 'Choose each format once'), rightsConfirmed: z.literal(true) }).strict();
export const creativeListSchema = z.object({ listingId: id.optional(), before: z.string().regex(/^[1-9]\d*$/).optional(), limit: z.coerce.number().int().min(1).max(20).default(8), state: creativeStateSchema.optional() }).strict();
export const creativeConfirmSchema = z.object({ manifestHash: digest, rightsConfirmed: z.literal(true), appearanceConfirmed: z.literal(true) }).strict();
export const creativeReviewSchema = z.object({ manifestHash: digest, decision: z.enum(['APPROVE', 'REJECT']), note: z.string().trim().min(10).max(1000), appearanceConfirmed: z.boolean() }).strict().refine(v => v.decision === 'REJECT' || v.appearanceConfirmed, 'Confirm the displayed source and prepared image before approval');
export const creativeSelectionSchema = z.object({ listingId: id, sourceAssetId: z.string().regex(/^[1-9]\d*$/), derivativeId: z.string().uuid(), manifestHash: digest }).strict();
export interface CreativeRecord {
 id: string; cursor: string; listingId: number; hostId: number; listingTitle: string; sourceAssetId: string;
 format: z.infer<typeof creativeFormatSchema>; state: z.infer<typeof creativeStateSchema>; manifestHash: string | null;
 source: { hash: string; byteLength: number; width: number; height: number } | null;
 output: { hash: string; byteLength: number; width: number; height: number } | null;
 url: string | null; createdAt: string; updatedAt: string; cdnVerifiedAt: string | null;
 hostConfirmedAt: string | null; adminReviewedAt: string | null; reviewNote: string | null; errorCode: string | null;
}
export interface CreativePage { items: CreativeRecord[]; nextCursor: string | null; }
