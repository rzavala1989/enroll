import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { LoggerModule } from 'nestjs-pino';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { MetricsInterceptor } from './common/metrics.interceptor';
import { redisConnectionFromUrl } from './config/redis';
import { validateEnv, type Env } from './config/env';
import { CoursesModule } from './courses/courses.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { SectionsModule } from './sections/sections.module';
import { UsersModule } from './users/users.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    // validate runs before any provider is constructed, so a missing
    // secret or malformed duration aborts the boot instead of surfacing
    // as a 500 at the first login.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // One id per request, echoed in the error envelope, so a user
          // reporting "it failed" hands over something greppable.
          genReqId: (req: IncomingMessage) =>
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          autoLogging: { ignore: (req) => Boolean(req.url?.startsWith('/api/health')) },
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),

    /**
     * Global rate limit, with a much tighter one on POST /auth/login
     * declared at the controller. Login brute force, enroll spam, and
     * refresh hammering were all unthrottled; the last of those is the
     * dangerous one, because a refresh flood against a rotating-token
     * scheme burns families and logs real users out.
     */
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),

    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnectionFromUrl(config.get('REDIS_URL', { infer: true })),
      }),
    }),

    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    AuditModule,
    NotificationsModule,
    EnrollmentModule,
    WaitlistModule,
    SectionsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
