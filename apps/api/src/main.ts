import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Replace Nest's default logger with pino: JSON lines carrying a
  // request id, which is what makes a concurrent enrollment race
  // readable after the fact.
  app.useLogger(app.get(PinoLogger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const isProduction = nodeEnv === 'production';

  // Every controller lives under /api so the web app's rewrite can
  // forward /api/* straight through.
  app.setGlobalPrefix('api');

  // URI versioning, applied now while the only consumer is our own web
  // app. Adding it after an external client exists means either
  // breaking them or maintaining an unversioned alias forever. Health
  // and metrics opt out via VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  /**
   * How many reverse proxies sit in front of this process. Express
   * walks X-Forwarded-For to this depth to compute req.ip, which is
   * what every audit row records as the actor's address. Left at zero
   * behind the Next.js rewrite, the audit trail says the proxy did
   * everything and per-IP throttling sees the whole internet as one
   * caller.
   */
  const trustProxyHops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(cookieParser());

  // Env-driven allowlist. The previous hardcoded value was
  // http://localhost:4200, the archived Angular app's port, so the
  // live web app on 3001 was never actually on it.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // One error shape for domain throws, validation failures, guard
  // rejections, and throttler 429s alike.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Without this, onModuleDestroy never fires on SIGTERM: Prisma and
  // Mongo connections are dropped rather than closed, and a BullMQ
  // worker can be killed mid-promotion.
  app.enableShutdownHooks();

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Enroll API')
      .setDescription('UCR-style course registration')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
