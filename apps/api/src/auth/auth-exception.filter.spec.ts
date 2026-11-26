import { HttpException, Logger, type ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthExceptionFilter } from './auth-exception.filter.js';

describe('AuthExceptionFilter', () => {
  const adapter = new ExpressAdapter();
  const adapterHost = new HttpAdapterHost();
  adapterHost.httpAdapter = adapter;
  const filter = new AuthExceptionFilter(adapterHost);
  const request = {
    method: 'POST',
    originalUrl: '/auth/login',
    body: { password: 'VALOR_DE_PRUEBA' },
    headers: { authorization: 'VALOR_DE_PRUEBA' },
  };
  const response = { headersSent: false };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  afterEach(() => vi.restoreAllMocks());

  it('registra solo la operación y el estado ante una excepción inesperada', () => {
    const reply = vi
      .spyOn(adapter, 'reply')
      .mockImplementation(() => undefined);
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    filter.catch(new Error('DETALLE_INTERNO_DE_PRUEBA'), host);

    expect(reply).toHaveBeenCalledExactlyOnceWith(
      response,
      { message: 'Ocurrió un error interno.' },
      500,
    );
    expect(log).toHaveBeenCalledExactlyOnceWith({
      event: 'auth_request_failed',
      operation: 'login',
      status: 500,
    });
  });

  it('conserva el estado de una excepción HTTP sin confiar en su cuerpo', () => {
    const reply = vi
      .spyOn(adapter, 'reply')
      .mockImplementation(() => undefined);
    const exception = new HttpException(
      {
        message: 'DETALLE_INTERNO_DE_PRUEBA',
        issues: ['DETALLE_INTERNO_DE_PRUEBA'],
        error: 'DETALLE_INTERNO_DE_PRUEBA',
      },
      422,
    );

    filter.catch(exception, host);

    expect(reply).toHaveBeenCalledExactlyOnceWith(
      response,
      { message: 'No se pudo procesar la solicitud.' },
      422,
    );
  });
});
