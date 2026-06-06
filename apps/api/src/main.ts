import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.API_PORT ?? 3000;
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
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}
bootstrap();
