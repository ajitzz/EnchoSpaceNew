import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(8).default('fallback_secret_key_12345'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  GEMINI_API_KEY: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  META_API_TOKEN: z.string().optional(),
  PHONE_NUMBER_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
