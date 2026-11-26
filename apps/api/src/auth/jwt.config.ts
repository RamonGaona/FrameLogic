import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import type { JwtModuleOptions } from '@nestjs/jwt';

export function createJwtOptions(): JwtModuleOptions {
  const secret = process.env.JWT_SECRET ?? readLocalJwtSecret();

  if (!secret?.trim()) {
    throw new Error('JWT_SECRET debe estar configurado y tener contenido.');
  }

  return {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: '24h' },
  };
}

function readLocalJwtSecret(): string | undefined {
  // src/auth y dist/auth tienen la misma profundidad dentro de apps/api.
  const envFile = new URL('../../.env', import.meta.url);

  try {
    return parseEnv(readFileSync(envFile, 'utf8')).JWT_SECRET;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('No se pudo cargar JWT_SECRET desde apps/api/.env.');
    }
  }
}
