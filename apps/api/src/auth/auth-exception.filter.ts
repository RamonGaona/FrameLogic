import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { AuthHttpException } from './auth-errors.js';

const authRoutes = new Map([
  ['POST /auth/register', 'register'],
  ['POST /auth/login', 'login'],
  ['PATCH /internal/users/approval', 'approval'],
]);

@Catch()
export class AuthExceptionFilter extends BaseExceptionFilter<unknown> {
  private readonly logger = new Logger(AuthExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const method = httpAdapter.getRequestMethod(request);
    const path = httpAdapter
      .getRequestUrl(request)
      .split('?', 1)[0]
      .replace(/\/$/, '')
      .toLowerCase();
    const operation = authRoutes.get(`${method} ${path}`);
    if (!operation) {
      return super.catch(exception, host);
    }

    const status = this.getStatus(exception);
    const message =
      exception instanceof AuthHttpException
        ? exception.body.message
        : fallbackMessage(status);
    const issues =
      status === HttpStatus.BAD_REQUEST &&
      exception instanceof AuthHttpException
        ? exception.body.issues
        : undefined;
    const body = issues ? { message, issues } : { message };

    if (
      status >= HttpStatus.INTERNAL_SERVER_ERROR &&
      !(exception instanceof AuthHttpException)
    ) {
      this.logger.error({ event: 'auth_request_failed', operation, status });
    }

    const response = ctx.getResponse();
    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }
    httpAdapter.reply(response, body, status);
  }

  private getStatus(exception: unknown): number {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : this.isHttpError(exception)
          ? exception.statusCode
          : undefined;
    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status < 600
    ) {
      return status;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

function fallbackMessage(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) {
    return 'El cuerpo de la solicitud no es válido.';
  }
  if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
    return 'El cuerpo de la solicitud supera el tamaño permitido.';
  }
  return status >= HttpStatus.INTERNAL_SERVER_ERROR
    ? 'Ocurrió un error interno.'
    : 'No se pudo procesar la solicitud.';
}
