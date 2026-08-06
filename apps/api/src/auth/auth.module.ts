import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';

import type { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // getOrThrow, not get: a missing signing secret used to boot
        // fine and fail at the first login with a 500.
        secret: config.getOrThrow('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          // The env schema already pins the shape to /^\d+(ms|s|m|h|d)$/,
          // which is exactly what `ms` accepts; the cast just tells
          // TypeScript that.
          expiresIn: config.getOrThrow('JWT_ACCESS_EXPIRY', {
            infer: true,
          }) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
