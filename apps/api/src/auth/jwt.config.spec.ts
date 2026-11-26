import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJwtOptions } from './jwt.config.js';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));

const readEnvFile = vi.mocked(readFileSync);

describe('Configuración JWT', () => {
  const secret = randomBytes(32).toString('hex');

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', undefined);
    readEnvFile.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prioriza el entorno del proceso', () => {
    vi.stubEnv('JWT_SECRET', secret);

    const options = createJwtOptions();

    expect(options.secret === secret).toBe(true);
    expect(options.signOptions).toEqual({
      algorithm: 'HS256',
      expiresIn: '24h',
    });
    expect(readEnvFile).not.toHaveBeenCalled();
  });

  it('lee el archivo local por ruta relativa al módulo sin alterar el entorno', () => {
    readEnvFile.mockReturnValue(`JWT_SECRET="${secret}"\n`);

    expect(createJwtOptions().secret === secret).toBe(true);
    expect(readEnvFile).toHaveBeenCalledWith(
      new URL('../../.env', import.meta.url),
      'utf8',
    );
    expect(process.env.JWT_SECRET === undefined).toBe(true);
  });

  it('falla si falta el archivo y el entorno no define el secreto', () => {
    readEnvFile.mockImplementation(() => {
      throw Object.assign(new Error(), { code: 'ENOENT' });
    });

    expect(createJwtOptions).toThrow('JWT_SECRET debe estar configurado');
  });

  it.each(['', '   '])(
    'falla si el entorno define un secreto vacío (%j)',
    (value) => {
      vi.stubEnv('JWT_SECRET', value);

      expect(createJwtOptions).toThrow('JWT_SECRET debe estar configurado');
      expect(readEnvFile).not.toHaveBeenCalled();
    },
  );

  it('falla si el archivo existe pero no contiene un secreto', () => {
    readEnvFile.mockReturnValue('JWT_SECRET=""\n');

    expect(createJwtOptions).toThrow('JWT_SECRET debe estar configurado');
  });

  it('emite un error de configuración si el archivo no se puede leer', () => {
    readEnvFile.mockImplementation(() => {
      throw Object.assign(new Error(), { code: 'EACCES' });
    });

    expect(createJwtOptions).toThrow('No se pudo cargar JWT_SECRET');
  });
});
