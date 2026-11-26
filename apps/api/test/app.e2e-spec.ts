import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createAccountResponseSchema,
  loginResponseSchema,
} from '@framelogic/contracts';
import { prisma } from '@framelogic/database';
import { AppModule } from '../src/app.module.js';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@framelogic/database', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    $queryRaw: queryRaw,
  },
}));

const findUser = vi.mocked(prisma.user.findUnique);
const createUser = vi.mocked(prisma.user.create);

afterEach(() => {
  vi.unstubAllEnvs();
});

it('rechaza el arranque de Nest si JWT_SECRET está vacío', async () => {
  vi.stubEnv('JWT_SECRET', '');
  vi.stubEnv('APPROVAL_OPERATOR_IDS', '');

  await expect(
    Test.createTestingModule({ imports: [AppModule] }).compile(),
  ).rejects.toThrow('JWT_SECRET debe estar configurado');
});

describe('API HTTP (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let http: ReturnType<typeof request>;
  const password = randomBytes(16).toString('hex');
  const jwtSecret = randomBytes(32).toString('hex');
  const account = { name: 'Cuenta de prueba', email: 'account@example.test' };
  const createdAt = new Date();
  let pendingUser: NonNullable<
    Awaited<ReturnType<typeof prisma.user.findUnique>>
  >;

  beforeAll(async () => {
    pendingUser = {
      ...account,
      id: 'account-id',
      approved: false,
      password: await bcrypt.hash(password, 4),
      createdAt,
      updatedAt: createdAt,
    };
  });

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', jwtSecret);
    vi.stubEnv('APPROVAL_OPERATOR_IDS', '');
    findUser.mockReset();
    createUser.mockReset();
    queryRaw.mockReset();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('/ (GET)', () => {
    return http.get('/').expect(200).expect('Hello World!');
  });

  it('conserva las respuestas de éxito y error de /health', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await http.get('/health').expect(200, { status: 'ok', database: 'ok' });

    queryRaw.mockRejectedValueOnce(new Error('DETALLE_INTERNO_DE_PRUEBA'));
    await http
      .get('/health')
      .expect(503, { status: 'error', database: 'down' });
  });

  it('delega a Nest las rutas inexistentes y los métodos fuera del alcance', async () => {
    for (const path of ['/ruta-inexistente', '/auth/login']) {
      await http.get(path).expect(404, {
        message: `Cannot GET ${path}`,
        error: 'Not Found',
        statusCode: 404,
      });
    }
    await http
      .post('/ruta-inexistente')
      .type('json')
      .send('{')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: 'Bad Request', statusCode: 400 });
      });
  });

  it.each(['register', 'login'])(
    'sanitiza JSON malformado en %s antes de llamar al servicio',
    async (operation) => {
      await http
        .post(`/auth/${operation}`)
        .type('json')
        .send('{"dato": DETALLE_INTERNO_DE_PRUEBA')
        .expect(400, { message: 'El cuerpo de la solicitud no es válido.' });
      expect(findUser).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
    },
  );

  it.each(['register', 'login'])(
    'oculta fallos inesperados de Prisma en %s',
    async (operation) => {
      const failure = new Error('DETALLE_INTERNO_DE_PRUEBA');
      const dbCall = operation === 'register' ? createUser : findUser;
      dbCall.mockRejectedValueOnce(failure);

      await http
        .post(`/auth/${operation}`)
        .send({
          email: account.email,
          password,
          ...(operation === 'register' ? { name: account.name } : {}),
        })
        .expect(500, { message: 'Ocurrió un error interno.' });
    },
  );

  describe('POST /auth/login', () => {
    it('devuelve 400 antes de consultar Prisma ante un campo extra', async () => {
      await http
        .post('/auth/login')
        .send({ email: account.email, password, approved: true })
        .expect(400, {
          message: 'Los datos del inicio de sesión no son válidos.',
          issues: ['El cuerpo contiene campos no permitidos.'],
        });
      expect(findUser).not.toHaveBeenCalled();
    });

    it('devuelve el mismo 401 para correo inexistente y contraseña incorrecta', async () => {
      findUser.mockResolvedValueOnce(null);
      findUser.mockResolvedValueOnce(pendingUser);

      const body = { email: account.email, password: 'x' };
      const missingEmail = await http
        .post('/auth/login')
        .send(body)
        .expect(401);
      const wrongPassword = await http
        .post('/auth/login')
        .send(body)
        .expect(401);

      expect(missingEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body).toEqual({
        message: 'Correo o contraseña incorrectos.',
      });
    });

    it('devuelve 401 para una cuenta no aprobada con contraseña correcta', async () => {
      findUser.mockResolvedValueOnce(pendingUser);

      const { body } = await http
        .post('/auth/login')
        .send({ email: account.email, password })
        .expect(401);
      expect(body).toEqual({ message: 'La cuenta no está aprobada.' });
    });

    it('devuelve 200 con la forma pública del contrato para una cuenta aprobada', async () => {
      findUser.mockResolvedValueOnce({ ...pendingUser, approved: true });

      const { body } = await http
        .post('/auth/login')
        .send({ email: ' ACCOUNT@EXAMPLE.TEST ', password })
        .expect(200);

      expect(loginResponseSchema.safeParse(body).success).toBe(true);
      expect(Object.keys(body).sort()).toEqual(['accessToken', 'user']);
      expect(Object.keys(body.user).sort()).toEqual([
        'approved',
        'email',
        'id',
        'name',
      ]);
    });
  });

  describe('POST /auth/register', () => {
    it('conserva el 201, el usuario pendiente y el hash bcrypt de costo 10', async () => {
      createUser.mockResolvedValueOnce(pendingUser);

      const { body } = await http
        .post('/auth/register')
        .send({ ...account, password })
        .expect(201);

      expect(createAccountResponseSchema.safeParse(body).success).toBe(true);
      expect(Object.keys(body).sort()).toEqual([
        'approved',
        'createdAt',
        'email',
        'id',
        'name',
      ]);
      const { data } = createUser.mock.calls[0][0];
      expect(Object.hasOwn(data, 'approved')).toBe(false);
      expect(bcrypt.getRounds(data.password)).toBe(10);
      expect(await bcrypt.compare(password, data.password)).toBe(true);
    });

    it('conserva el 400 para un campo extra y el 409 para un correo duplicado', async () => {
      await http
        .post('/auth/register')
        .send({ ...account, password, approved: true })
        .expect(400, {
          message: 'Los datos del registro no son válidos.',
          issues: ['El cuerpo contiene campos no permitidos.'],
        });
      expect(createUser).not.toHaveBeenCalled();

      createUser.mockRejectedValueOnce({ code: 'P2002' });
      await http
        .post('/auth/register')
        .send({ ...account, password })
        .expect(409, { message: 'Ya existe una cuenta con ese correo.' });
    });
  });
});
