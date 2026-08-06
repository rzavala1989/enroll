import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { MetricsService } from './metrics.service';

/**
 * Times every request into the latency histogram.
 *
 * Labels use the route template (`/api/v1/courses/:id`) rather than the
 * concrete path, so a catalog of ten thousand courses produces one time
 * series instead of ten thousand.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { route?: { path?: string } }>();
    const response = http.getResponse<Response>();
    const stop = this.metrics.httpDuration.startTimer();

    return next.handle().pipe(
      finalize(() => {
        stop({
          method: request.method,
          route: request.route?.path ?? 'unmatched',
          status: String(response.statusCode),
        });
      }),
    );
  }
}
