import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Activar con APPROVAL_POSTGRES_TEST=1. Cada ejecución crea su propio PostgreSQL.
describe.skipIf(process.env.APPROVAL_POSTGRES_TEST !== '1')(
  'Aprobación con PostgreSQL',
  () => {
    const container = `framelogic-approval-test-${randomBytes(8).toString('hex')}`;
    const dbName = 'approval_test';
    const operators = ['operator-a', 'operator-b', 'operator-c'];
    const path = '/internal/users/approval';
    const password = randomBytes(16).toString('hex');
    let app: INestApplication | undefined;
    let prisma: (typeof import('@framelogic/database'))['prisma'] | undefined;
    let http: ReturnType<typeof request>;
    let ownsContainer = false;

    const emailFor = (id: string) => `${id}@example.test`;
    const login = (email: string) =>
      http.post('/auth/login').send({ email, password });
    const approval = (token: string, id: string, approved: boolean) =>
      http.patch(path).auth(token, { type: 'bearer' }).send({ id, approved });

    beforeAll(async () => {
      const dbPassword = randomBytes(32).toString('hex');
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
            POSTGRES_PASSWORD: dbPassword,
            POSTGRES_DB: dbName,
          },
        },
      );
      ownsContainer = true;

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
              dbName,
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
          '../../../packages/database/prisma/migrations/20261022034349_init/migration.sql',
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
          dbName,
          '-v',
          'ON_ERROR_STOP=1',
        ],
        {
          input: migration,
        },
      );

      vi.stubEnv(
        'DATABASE_URL',
        `postgresql://postgres:${dbPassword}@127.0.0.1:${port}/${dbName}`,
      );
      vi.stubEnv('JWT_SECRET', randomBytes(32).toString('hex'));
      vi.stubEnv('APPROVAL_OPERATOR_IDS', operators.join(','));
      ({ prisma } = await import('@framelogic/database'));
      const [database] = await prisma.$queryRaw<{ name: string }[]>`
      SELECT current_database() AS name
    `;
      if (database.name !== dbName) {
        throw new Error('La conexión no apunta a la base desechable');
      }
      const { AppModule } = await import('../src/app.module.js');
      const passwordHash = await bcrypt.hash(password, 4);
      await prisma.user.createMany({
        data: operators.map((id) => ({
          id,
          name: id,
          email: emailFor(id),
          password: passwordHash,
          approved: true,
        })),
      });
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      http = request(app.getHttpServer());
    }, 60_000);

    afterAll(async () => {
      try {
        await app?.close();
        await prisma?.$disconnect();
      } finally {
        vi.unstubAllEnvs();
        if (ownsContainer) docker(['stop', container]);
      }
    }, 30_000);

    it('registra, aprueba y bloquea por HTTP sin cambiar la contraseña guardada', async () => {
      const email = 'new-account@example.test';
      const name = 'Cuenta de prueba';
      const registered = await http
        .post('/auth/register')
        .send({ name, email, password })
        .expect(201);
      expect(registered.body.approved).toBe(false);
      const id: string = registered.body.id;
      const before = await prisma!.user.findUniqueOrThrow({ where: { id } });
      const operator = await login(emailFor(operators[0])).expect(200);

      await login(email).expect(401);
      await approval(operator.body.accessToken, id, true).expect(200);
      await login(email).expect(200);
      await approval(operator.body.accessToken, id, false).expect(200);
      await login(email).expect(401);

      const after = await prisma!.user.findUniqueOrThrow({ where: { id } });
      expect(after.approved).toBe(false);
      expect(after.name).toBe(before.name);
      expect(after.email).toBe(before.email);
      expect(after.password === before.password).toBe(true);
    });

    it('preserva un operador activo ante bloqueos cruzados concurrentes', async () => {
      const [first, second, third] = operators;
      const [firstLogin, secondLogin] = await Promise.all([
        login(emailFor(first)).expect(200),
        login(emailFor(second)).expect(200),
      ]);
      const firstToken: string = firstLogin.body.accessToken;
      const secondToken: string = secondLogin.body.accessToken;
      await approval(firstToken, third, false).expect(200);

      let attempts: Promise<number[]> | undefined;
      try {
        await prisma!.$transaction(async (tx) => {
          // SHARE permite ambas lecturas y detiene las escrituras hasta el commit.
          await tx.$executeRaw`LOCK TABLE "User" IN SHARE MODE`;
          attempts = Promise.all([
            approval(firstToken, second, false).then(({ status }) => status),
            approval(secondToken, first, false).then(({ status }) => status),
          ]);
          await waitFor(
            async () => {
              const [locks] = await tx.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting
            FROM pg_locks
            WHERE relation = '"User"'::regclass AND mode = 'RowExclusiveLock' AND NOT granted
          `;
              return locks.waiting === 2;
            },
            3_000,
            'Las dos transacciones de aprobación no coincidieron',
          );
        });
      } finally {
        if (attempts)
          expect((await attempts).sort((a, b) => a - b)).toEqual([200, 403]);
      }

      const active = await prisma!.user.findMany({
        where: { id: { in: operators }, approved: true },
        select: { id: true },
      });
      expect(active).toHaveLength(1);
      const survivor = active[0].id;
      await approval(
        survivor === first ? secondToken : firstToken,
        survivor,
        false,
      ).expect(403);
    }, 15_000);
  },
);

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

async function waitFor(
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
