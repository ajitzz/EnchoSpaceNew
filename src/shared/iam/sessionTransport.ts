import {z} from 'zod';

export const workforceLoginChallengeSchema=z.object({
  challengeId:z.string().uuid(),nonce:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  clientId:z.string().regex(/^[A-Za-z0-9_-]{8,200}\.apps\.googleusercontent\.com$/),
  expiresAt:z.string().datetime({offset:true}),
}).strict();
export type WorkforceLoginChallenge=z.infer<typeof workforceLoginChallengeSchema>;
export const workforceLoginSubmissionSchema=z.object({
  challengeId:z.string().uuid(),credential:z.string().min(100).max(16000),
}).strict();
export const workforceLoginReceiptSchema=z.object({status:z.literal('AUTHENTICATED'),expiresAt:z.string().datetime({offset:true})}).strict();
