import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  createAccountResponseSchema,
  loginResponseSchema,
  setUserApprovalResponseSchema,
} from '@framelogic/contracts';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  approvalOperators as operators,
  operatorEmail,
  seedApprovalOperators,
  startApprovalPostgres,
  waitFor,
} from './support/approval-postgres.fixture.js';

// Activar con APPROVAL_POSTGRES_TEST=1. Cada ejecución crea su propio PostgreSQL.
describe.skipIf(process.env.APPROVAL_POSTGRES_TEST !== '1')(
  'Aprobación con PostgreSQL',
  () => {
    const path = '/internal/users/approval';
    const password = randomBytes(16).toString('hex');
    let app: INestApplication | undefined;
    let prisma: (typeof import('@framelogic/database'))['prisma'] | undefined;
    let http: ReturnType<typeof request>;
    let jwt: JwtService;
    let fixture: Awaited<ReturnType<typeof startApprovalPostgres>> | undefined;

    const login = (email: string) =>
      http.post('/auth/login').send({ email, password });
    const approval = (token: string, id: string, approved: boolean) =>
      http.patch(path).auth(token, { type: 'bearer' }).send({ id, approved });

    beforeAll(async () => {
      fixture = await startApprovalPostgres();
      vi.stubEnv('DATABASE_URL', fixture.url);
      vi.stubEnv('JWT_SECRET', randomBytes(32).toString('hex'));
      vi.stubEnv('APPROVAL_OPERATOR_IDS', operators.join(','));
      ({ prisma } = await import('@framelogic/database'));
      await seedApprovalOperators(prisma, fixture.database, password);
      const { AppModule } = await import('../src/app.module.js');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      jwt = module.get(JwtService);
      app = module.createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      http = request(app.getHttpServer());
    }, 60_000);

    beforeEach(async () => {
      await prisma!.user.updateMany({
        where: { id: { in: [...operators] } },
        data: { approved: true },
      });
    });

    afterAll(async () => {
      try {
        await app?.close();
        await prisma?.$disconnect();
      } finally {
        vi.unstubAllEnvs();
        fixture?.stop();
      }
    }, 30_000);

    it('registra, aprueba y bloquea por HTTP sin cambiar la contraseña guardada', async () => {
      const email = 'new-account@example.test';
      const name = 'Cuenta de prueba';
      const { body: registerBody } = await http
        .post('/auth/register')
        .send({ name, email, password })
        .expect(201);
      const registered = verifyBody(createAccountResponseSchema, registerBody, [
        'id',
        'name',
        'email',
        'approved',
        'createdAt',
      ]);
      expect(registered).toMatchObject({ name, email, approved: false });
      const { id } = registered;
      const before = await prisma!.user.findUniqueOrThrow({ where: { id } });
      const [first, second, third] = await Promise.all(
        operators.map(async (operatorId) => {
          const { body } = await login(operatorEmail(operatorId)).expect(200);
          return (await verifyLogin(body, operatorId)).accessToken;
        }),
      );

      const denied = { message: 'La cuenta no está aprobada.' };
      await login(email).expect(401, denied);
      await checkApproval(first, true);
      const { body: loginBody } = await login(email).expect(200);
      const session = await verifyLogin(loginBody, id);
      expect(session.user).toEqual({ id, name, email, approved: true });
      await approval(session.accessToken, id, true).expect(403, {
        message: 'No tiene permiso para administrar cuentas.',
      });
      await checkApproval(second, false);
      await login(email).expect(401, denied);

      await checkApproval(third, true);
      await checkApproval(third, false);

      const after = await prisma!.user.findUniqueOrThrow({ where: { id } });
      expect(after.approved).toBe(false);
      expect(after.name).toBe(before.name);
      expect(after.email).toBe(before.email);
      expect(after.password === before.password).toBe(true);

      async function checkApproval(token: string, approved: boolean) {
        const { body } = await approval(token, id, approved).expect(200);
        const result = verifyBody(setUserApprovalResponseSchema, body, [
          'id',
          'name',
          'email',
          'approved',
          'updatedAt',
        ]);
        expect(result).toMatchObject({ id, name, email, approved });
        const stored = await prisma!.user.findUniqueOrThrow({
          where: { id },
          select: { approved: true },
        });
        expect(stored.approved).toBe(approved);
      }

      async function verifyLogin(body: unknown, subject: string) {
        const session = verifyBody(loginResponseSchema, body, [
          'accessToken',
          'user',
        ]);
        expect(Object.keys((body as typeof session).user).sort()).toEqual([
          'approved',
          'email',
          'id',
          'name',
        ]);
        expect(session.user.id).toBe(subject);
        const claims = await jwt.verifyAsync<{
          sub: string;
          iat: number;
          exp: number;
        }>(session.accessToken, { algorithms: ['HS256'] });
        expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub']);
        expect(claims.sub).toBe(subject);
        expect(claims.exp - claims.iat).toBe(86_400);
        return session;
      }
    });

    it('preserva un operador activo ante bloqueos cruzados concurrentes', async () => {
      const [first, second, third] = operators;
      const [firstLogin, secondLogin] = await Promise.all([
        login(operatorEmail(first)).expect(200),
        login(operatorEmail(second)).expect(200),
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
        where: { id: { in: [...operators] }, approved: true },
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

function verifyBody<T>(
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
  },
  body: unknown,
  keys: string[],
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error('La respuesta HTTP incumple su contrato Zod.');
  }
  expect(Object.keys(body as object).sort()).toEqual(keys.sort());
  return parsed.data;
}
