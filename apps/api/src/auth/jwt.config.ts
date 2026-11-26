import type { JwtModuleOptions } from '@nestjs/jwt';
import { readApiEnv } from './api-env.js';

export function createJwtOptions(): JwtModuleOptions {
  const secret = readApiEnv('JWT_SECRET');

  if (!secret?.trim()) {
    throw new Error('JWT_SECRET debe estar configurado y tener contenido.');
  }

  return {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: '24h' },
  };
}
