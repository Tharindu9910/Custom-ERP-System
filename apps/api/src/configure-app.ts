import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** HTTP setup shared by main.ts and the e2e tests, so tests boot the same app. */
export function configureApp(app: INestApplication): INestApplication {
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
  // Opt-in: a number of proxy hops, or true/false. Left unset, Express ignores X-Forwarded-For as before.
  const proxy = process.env.TRUST_PROXY;
  if (proxy) (app as NestExpressApplication).set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy === 'true');
  app.enableCors({
    origin: isDev
      ? true
      : (process.env.CORS_ORIGINS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    credentials: true,
  });
  return app;
}
