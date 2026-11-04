import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_PORT: z.coerce.number().default(3000),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  THROTTLE_TTL_SECONDS: z.coerce.number().default(60),
  THROTTLE_LIMIT: z.coerce.number().default(100),
  THROTTLE_AUTH_LIMIT: z.coerce.number().default(10),

  // Local folder for uploaded files (design photos); relative to the API's working directory
  UPLOAD_DIR: z.string().default('uploads'),

  // Behind a reverse proxy set this (e.g. 1) so req.ip, the throttler and audit entries see the client, not the proxy.
  // Unset keeps today's behaviour.
  TRUST_PROXY: z.string().optional(),
}).refine((e) => e.JWT_SECRET !== e.JWT_REFRESH_SECRET, {
  message: 'JWT_SECRET and JWT_REFRESH_SECRET must differ, or a refresh token would pass as an access token',
  path: ['JWT_REFRESH_SECRET'],
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.issues.forEach((issue) =>
      console.error(` • ${issue.path.join('.')}: ${issue.message}`),
    );
    process.exit(1);
  }
  return result.data;
}
