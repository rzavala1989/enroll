import { Controller, Get, Res, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { MetricsService } from '../common/metrics.service';
import { HealthService, ReadinessReport } from './health.service';

/**
 * Operational endpoints, deliberately version-neutral: an orchestrator's
 * probe configuration should not have to move when the API's resource
 * routes get a new version.
 *
 * Liveness and readiness are separate on purpose. A pod whose Postgres
 * pool is wedged is not ready (pull it from the load balancer) but is
 * alive (restarting it will not help and drops in-flight work). One
 * endpoint answering both questions forces the orchestrator to guess.
 */
@ApiTags('health')
// Version and SkipThrottle are both typed MethodDecorator &
// ClassDecorator. TypeScript resolves the intersection to the method
// signature, so applying either to a class needs the cast.
@(Version(VERSION_NEUTRAL) as ClassDecorator)
@(SkipThrottle({ default: true }) as ClassDecorator)
@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Alias of /health/live, kept for existing probes' })
  root(): { ok: true } {
    return { ok: true };
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Process is up and the event loop is turning' })
  live(): { ok: true } {
    return { ok: true };
  }

  @Get('health/ready')
  @ApiOperation({
    summary: 'Dependencies are reachable',
    description:
      'Probes Postgres and Redis (both required) and Mongo (optional: the audit outbox buffers in Postgres while it is away). Returns 503 when a required dependency is down.',
  })
  @ApiOkResponse({ description: 'All required dependencies are up.' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.healthService.readiness();
    res.status(report.status === 'ok' ? 200 : 503);
    return report;
  }

  @Get('metrics')
  @ApiExcludeEndpoint()
  async scrape(@Res() res: Response): Promise<void> {
    res.header('content-type', this.metrics.registry.contentType);
    res.send(await this.metrics.scrape());
  }
}
