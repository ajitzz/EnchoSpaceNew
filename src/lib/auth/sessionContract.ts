import { z } from 'zod';

// Consumer-session identity is a public projection. Zod strips any accidental
// database columns before a response can reach React context or browser storage.
export const authUserSchema = z.object({
  id: z.number().int().positive(),
  // Phone-only identities have no verified email. Never invent a routable or
  // public-registerable address merely to satisfy the browser session shape.
  email: z.string().min(1).nullable(),
  name: z.string(),
  role: z.string().min(1),
  phone: z.string().nullable().optional(),
  can_host_experiences: z.boolean().optional(),
});

export const authSessionSchema = z.object({
  user: authUserSchema,
  token: z.string().min(1),
});

export type AuthUser = z.infer<typeof authUserSchema>;
