import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function readApiEnv(
  name: 'JWT_SECRET' | 'APPROVAL_OPERATOR_IDS',
): string | undefined {
  const value = process.env[name];
  if (value !== undefined) {
    return value;
  }

  // src/auth y dist/auth tienen la misma profundidad dentro de apps/api.
  const envFile = new URL('../../.env', import.meta.url);
  try {
    return parseEnv(readFileSync(envFile, 'utf8'))[name];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`No se pudo cargar ${name} desde apps/api/.env.`);
    }
  }
}
