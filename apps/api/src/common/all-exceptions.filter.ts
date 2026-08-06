import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

/** The single error shape every endpoint returns. */
export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
  /** Correlates a user-visible failure with the server log line. */
  requestId: string;
}

/** Fallback codes for exceptions Nest throws before our code runs. */
const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Normalizes every error to one envelope.
 *
 * Before this, a client had to parse two shapes: domain errors threw
 * `{ code, message }`, while anything Nest raised itself (ValidationPipe
 * failures, guard 401s, and now throttler 429s) came back as
 * `{ message, statusCode, error }`. Clients ended up with a branch per
 * error source, and the codes that the UI switches on were only present
 * on half of them.
 *
 * Unhandled exceptions become a 500 whose envelope carries a request id
 * and nothing else. The stack goes to the log, keyed by that same id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ??
      (request as Request & { id?: string }).id ??
      randomUUID();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const envelope = this.fromHttpException(exception, status, requestId);

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `${request.method} ${request.url} -> ${status} [${requestId}]`,
          exception.stack,
        );
      }

      response.status(status).json(envelope);
      return;
    }

    this.logger.error(
      `${request.method} ${request.url} -> 500 [${requestId}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Quote the request id when reporting this.',
      requestId,
    } satisfies ErrorEnvelope);
  }

  private fromHttpException(
    exception: HttpException,
    status: number,
    requestId: string,
  ): ErrorEnvelope {
    const body = exception.getResponse();
    const fallbackCode = STATUS_CODES[status] ?? 'ERROR';

    if (typeof body === 'string') {
      return { code: fallbackCode, message: body, requestId };
    }

    const record = body as Record<string, unknown>;

    // Domain throws already carry a code; keep it, it is the contract
    // the web app switches on.
    if (typeof record.code === 'string') {
      return {
        code: record.code,
        message: typeof record.message === 'string' ? record.message : fallbackCode,
        ...(record.details !== undefined ? { details: record.details } : {}),
        requestId,
      };
    }

    // ValidationPipe puts the per-field failures in `message` as an
    // array. Those belong in details, not smashed into one string.
    if (Array.isArray(record.message)) {
      return {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: record.message,
        requestId,
      };
    }

    return {
      code: fallbackCode,
      message: typeof record.message === 'string' ? record.message : exception.message,
      requestId,
    };
  }
}
