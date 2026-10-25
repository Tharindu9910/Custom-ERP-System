import type { INestApplication } from '@nestjs/common';

/** HTTP setup shared by main.ts and the e2e tests, so tests boot the same app. */
export function configureApp(app: INestApplication): INestApplication {
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
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
