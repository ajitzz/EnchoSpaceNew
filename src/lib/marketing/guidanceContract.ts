import { z } from 'zod';

export const guidanceRequestSchema = z.object({ listingId: z.coerce.number().int().positive().safe(), provider: z.enum(['GOOGLE', 'META']) }).strict();
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\r\n\u0000-\u001f<>]/.test(value), 'Use plain single-line text');
export const guidanceEvidenceSchema = z.object({ field: z.enum(['title', 'city', 'description']), quote: text(500) }).strict();
const item = (max: number) => z.object({ text: text(max), evidence: z.array(guidanceEvidenceSchema).min(1).max(3) }).strict();
export const guidanceSuggestionsSchema = z.object({
  headlines: z.array(item(100)).min(1).max(15),
  descriptions: z.array(item(1000)).min(1).max(4),
  keywords: z.array(item(80).extend({ matchType: z.enum(['EXACT', 'PHRASE']) })).max(20),
}).strict();
export const guidanceResponseSchema = z.object({
  status: z.enum(['AVAILABLE', 'UNAVAILABLE']), code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).optional(),
  listingId: z.number().int().positive().safe(), provider: z.enum(['GOOGLE', 'META']),
  listingEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/), generatedAt: z.string().datetime(), model: z.string().min(1).max(120).nullable(),
  suggestions: guidanceSuggestionsSchema.extend({ notes: z.array(text(400)).max(5) }).nullable(),
  requiresHumanReview: z.literal(true),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'UNAVAILABLE' ? value.suggestions !== null : value.suggestions === null)
    ctx.addIssue({ code: 'custom', message: 'Guidance status and content disagree' });
  const suggestions = value.suggestions;
  if (!suggestions) return;
  if (value.provider === 'GOOGLE' && (suggestions.headlines.length < 3 || suggestions.descriptions.length < 2 || !suggestions.keywords.length || suggestions.headlines.some(item => item.text.length > 30) || suggestions.descriptions.some(item => item.text.length > 90)))
    ctx.addIssue({ code: 'custom', message: 'Search suggestions must satisfy responsive asset limits' });
  if (value.provider === 'META' && (suggestions.keywords.length || suggestions.headlines.some(item => item.text.length > 80)))
    ctx.addIssue({ code: 'custom', message: 'Meta copy guidance must fit the editor and cannot change Search keywords' });
});
export type GuidanceResponse = z.infer<typeof guidanceResponseSchema>;
export type GuidanceEvidence = z.infer<typeof guidanceEvidenceSchema>;
export type GuidanceApply = { headline: string; description: string; googleSearch?: { headlines: string[]; descriptions: string[]; keywords: Array<{ text: string; matchType: 'EXACT' | 'PHRASE' }> } };
