import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import * as bcrypt from 'bcrypt';
import type { prisma } from '@framelogic/database';

export const approvalOperators = [
  'operator-a',
  'operator-b',
  'operator-c',
] as const;

export function operatorEmail(id: string): string {
  return `${id}@example.test`;
}

export async function startApprovalPostgres() {
  const suffix = randomBytes(8).toString('hex');
  const container = `framelogic-approval-test-${suffix}`;
  const database = `approval_test_${suffix}`;
  const password = randomBytes(32).toString('hex');

  docker(
    [
      'run',
      '--rm',
      '--detach',
      '--name',
      container,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD',
      '--env',
      'POSTGRES_DB',
      'postgres:16',
    ],
    {
      env: {
        ...process.env,
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: database,
      },
    },
  );

  const stop = () => {
    docker(['stop', container]);
  };
  try {
    await waitFor(
      () => {
        try {
          docker([
            'exec',
            container,
            'pg_isready',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            database,
          ]);
          return true;
        } catch {
          return false;
        }
      },
      30_000,
      'PostgreSQL de pruebas no inició',
    );

    const port = /^127\.0\.0\.1:(\d+)$/m.exec(
      docker(['port', container, '5432/tcp']),
    )?.[1];
    if (!port)
      throw new Error(
        'El contenedor de pruebas no tiene un puerto local asignado',
      );

    const migration = readFileSync(
      new URL(
        '../../../../packages/database/prisma/migrations/20261022034349_init/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    docker(
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'postgres',
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      {
        input: migration,
      },
    );

    return {
      container,
      database,
      url: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}

export async function seedApprovalOperators(
  client: typeof prisma,
  database: string,
  password: string,
) {
  const [current] = await client.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  if (current?.name !== database) {
    throw new Error('La conexión no apunta a la base desechable');
  }

  const hash = await bcrypt.hash(password, 4);
  await client.user.createMany({
    data: approvalOperators.map((id) => ({
      id,
      name: id,
      email: operatorEmail(id),
      password: hash,
      approved: true,
    })),
  });
}

function docker(
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    ...options,
  }).trim();
}

export async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeout: number,
  error: string,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(error);
}
