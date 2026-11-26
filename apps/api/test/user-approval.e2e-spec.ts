import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { setUserApprovalResponseSchema } from '@framelogic/contracts';
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
import { AppModule } from '../src/app.module.js';

const { transaction, findUser, updateUser } = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('@framelogic/database', () => ({
  prisma: { $transaction: transaction },
}));

describe('PATCH /internal/users/approval', () => {
  const operators = ['operator-a', 'operator-b', 'operator-c'];
  const ordinaryId = 'ordinary-user';
  const path = '/internal/users/approval';
  const tokenSecret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret: tokenSecret });
  const updatedAt = new Date('2026-01-01T00:00:00Z');
  let app: INestApplication | undefined;
  let http: ReturnType<typeof request>;
  let jwtVerifier: JwtService;
  let users: Map<
    string,
    {
      id: string;
      email: string;
      name: string;
      approved: boolean;
      updatedAt: Date;
    }
  >;

  const tokenFor = (id: string) => jwt.sign({ sub: id }, { expiresIn: '1h' });

  beforeAll(async () => {
    vi.stubEnv('APPROVAL_OPERATOR_IDS', operators.join(','));
    vi.stubEnv('JWT_SECRET', tokenSecret);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    jwtVerifier = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    users = new Map(
      [...operators, ordinaryId].map((id) => [
        id,
        {
          id,
          name: id,
          email: `${id}@example.test`,
          approved: true,
          updatedAt,
        },
      ]),
    );
    const tx = { user: { findUnique: findUser, update: updateUser } };
    transaction.mockImplementation((run: (client: typeof tx) => unknown) =>
      run(tx),
    );
    findUser.mockImplementation(
      ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    );
    updateUser.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { approved: boolean };
      }) => {
        const updated = { ...users.get(where.id)!, approved: data.approved };
        users.set(where.id, updated);
        return updated;
      },
    );
  });

  it('rechaza tokens ausentes, mal firmados, vencidos, de otro algoritmo o sin claims obligatorios', async () => {
    const subject = { sub: operators[0] };
    const otherSigner = new JwtService({ secret: randomBytes(32) });
    const invalid = [
      otherSigner.sign(subject, { expiresIn: '1h' }),
      jwt.sign(subject, { expiresIn: -60 }),
      jwt.sign(subject, { expiresIn: '1h', algorithm: 'HS384' }),
      jwt.sign(subject),
      jwt.sign({ sub: '' }, { expiresIn: '1h' }),
      jwt.sign({}, { expiresIn: '1h' }),
    ];
    const body = { id: ordinaryId, approved: false };
    await http
      .patch(path)
      .send(body)
      .expect(401, { message: 'Se requiere un token de acceso.' });
    for (const token of invalid) {
      await http
        .patch(path)
        .auth(token, { type: 'bearer' })
        .send(body)
        .expect(401)
        .expect(({ body: error }) => {
          expect(Object.keys(error)).toEqual(['message']);
          expect(error.message).toMatch(/^Token de acceso inválido/);
        });
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it('responde 500 si el verificador JWT falla inesperadamente', async () => {
    const token = tokenFor(operators[0]);
    const verify = vi
      .spyOn(jwtVerifier, 'verifyAsync')
      .mockRejectedValueOnce(new Error('DETALLE_INTERNO_DE_PRUEBA'));
    try {
      await http
        .patch(path)
        .auth(token, { type: 'bearer' })
        .send({ id: ordinaryId, approved: false })
        .expect(500, { message: 'Ocurrió un error interno.' });
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      verify.mockRestore();
    }
  });

  it('sanitiza JSON malformado sin consultar Prisma', async () => {
    await http
      .patch(path)
      .auth(tokenFor(operators[0]), { type: 'bearer' })
      .type('json')
      .send('{"dato": DETALLE_INTERNO_DE_PRUEBA')
      .expect(400, { message: 'El cuerpo de la solicitud no es válido.' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('deniega la autoaprobación y la administración por un usuario ordinario', async () => {
    users.get(ordinaryId)!.approved = false;
    await http
      .patch(path)
      .auth(tokenFor(ordinaryId), { type: 'bearer' })
      .send({ id: ordinaryId, approved: true })
      .expect(403, { message: 'No tiene permiso para administrar cuentas.' });
    users.get(ordinaryId)!.approved = true;
    await http
      .patch(path)
      .auth(tokenFor(ordinaryId), { type: 'bearer' })
      .send({ id: operators[0], approved: false })
      .expect(403, { message: 'No tiene permiso para administrar cuentas.' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza a un operador bloqueado antes de resolver el destinatario', async () => {
    const token = tokenFor(operators[0]);
    users.get(operators[0])!.approved = false;
    const response = await http
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({ id: ordinaryId, approved: false })
      .expect(403, { message: 'No tiene permiso para administrar cuentas.' });
    await http
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({ id: 'missing', approved: false })
      .expect(403, response.body);
    expect(findUser).toHaveBeenCalledTimes(2);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('valida estrictamente y distingue destinatario ausente y autobloqueo', async () => {
    const send = (body: object) =>
      http
        .patch(path)
        .auth(tokenFor(operators[0]), { type: 'bearer' })
        .send(body);
    const validationMessage = 'Los datos de aprobación no son válidos.';
    await send({ id: '', approved: true }).expect(400, {
      message: validationMessage,
      issues: ['id: este campo es obligatorio.'],
    });
    await send({ id: ordinaryId, approved: 'true' }).expect(400, {
      message: validationMessage,
      issues: ['approved: debe ser verdadero o falso.'],
    });
    await send({
      id: ordinaryId,
      approved: true,
      actorId: operators[1],
    }).expect(400, {
      message: validationMessage,
      issues: ['El cuerpo contiene campos no permitidos.'],
    });
    await send({ id: 'missing', approved: true }).expect(404, {
      message: 'No se encontró la cuenta solicitada.',
    });
    await send({ id: operators[0], approved: false }).expect(409, {
      message: 'Un operador no puede bloquear su propia cuenta.',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('conserva el 409 tras agotar los reintentos de la transacción', async () => {
    transaction.mockRejectedValue({
      code: 'P2034',
      message: 'DETALLE_INTERNO_DE_PRUEBA',
    });
    await http
      .patch(path)
      .auth(tokenFor(operators[0]), { type: 'bearer' })
      .send({ id: ordinaryId, approved: false })
      .expect(409, {
        message:
          'Hubo un conflicto al actualizar la aprobación. Inténtelo de nuevo.',
      });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('oculta los fallos inesperados de la transacción', async () => {
    transaction.mockRejectedValueOnce(new Error('DETALLE_INTERNO_DE_PRUEBA'));
    await http
      .patch(path)
      .auth(tokenFor(operators[0]), { type: 'bearer' })
      .send({ id: ordinaryId, approved: false })
      .expect(500, { message: 'Ocurrió un error interno.' });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each(operators)('concede los mismos permisos a %s', async (operator) => {
    const send = (approved: boolean) =>
      http
        .patch(path)
        .auth(tokenFor(operator), { type: 'bearer' })
        .send({ id: ordinaryId, approved })
        .expect(200);
    const blocked = await send(false);
    expect(setUserApprovalResponseSchema.safeParse(blocked.body).success).toBe(
      true,
    );
    expect(blocked.body).toEqual({
      ...users.get(ordinaryId),
      updatedAt: updatedAt.toISOString(),
    });
    expect(blocked.body.approved).toBe(false);
    await send(false);
    expect(updateUser).toHaveBeenCalledTimes(1);
    const approved = await send(true);
    expect(approved.body.approved).toBe(true);
  });

  it('responde 503 al deshabilitar la lista administrativa', async () => {
    vi.stubEnv('APPROVAL_OPERATOR_IDS', '');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const disabled = module.createNestApplication({ logger: false });
    vi.stubEnv('APPROVAL_OPERATOR_IDS', operators.join(','));
    try {
      await disabled.listen(0, '127.0.0.1');
      await request(disabled.getHttpServer()).patch(path).send({}).expect(503, {
        message: 'La aprobación de usuarios no está configurada.',
      });
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      await disabled.close();
    }
  });
});
