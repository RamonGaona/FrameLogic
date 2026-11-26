import { randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { loginResponseSchema } from '@framelogic/contracts';
import { prisma } from '@framelogic/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { createJwtOptions } from './jwt.config.js';

vi.mock('@framelogic/database', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

const findUser = vi.mocked(prisma.user.findUnique);

describe('AuthService.login', () => {
  const password = randomBytes(16).toString('hex');
  const jwtSecret = randomBytes(32).toString('hex');
  const publicUser = {
    id: 'account-id',
    name: 'Cuenta de prueba',
    email: 'login@example.test',
  };
  let pendingUser: NonNullable<
    Awaited<ReturnType<typeof prisma.user.findUnique>>
  >;
  let jwtService: JwtService;
  let authService: AuthService;

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', jwtSecret);
    try {
      jwtService = new JwtService(createJwtOptions());
    } finally {
      vi.unstubAllEnvs();
    }
    authService = new AuthService(jwtService);
    pendingUser = {
      ...publicUser,
      password: await bcrypt.hash(password, 4),
      approved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  beforeEach(() => {
    findUser.mockReset();
  });

  it.each([
    { label: 'correo inválido', body: { email: 'invalido', password } },
    {
      label: 'contraseña vacía',
      body: { email: publicUser.email, password: '' },
    },
    {
      label: 'campo extra',
      body: { email: publicUser.email, password, approved: true },
    },
  ])('devuelve 400 antes de consultar Prisma: $label', async ({ body }) => {
    await expect(authService.login(body)).rejects.toMatchObject({
      status: 400,
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('devuelve el mismo 401 si el correo no existe o la contraseña es incorrecta', async () => {
    const wrongCredentials = { email: publicUser.email, password: 'x' };
    const expected = {
      status: 401,
      message: 'Correo o contraseña incorrectos.',
    };

    findUser.mockResolvedValueOnce(null);
    await expect(authService.login(wrongCredentials)).rejects.toMatchObject(
      expected,
    );

    // Una cuenta pendiente con clave incorrecta recibe el error genérico.
    findUser.mockResolvedValueOnce(pendingUser);
    await expect(authService.login(wrongCredentials)).rejects.toMatchObject(
      expected,
    );
  });

  it('devuelve 401 de cuenta no aprobada solo con una contraseña correcta', async () => {
    findUser.mockResolvedValueOnce(pendingUser);

    await expect(
      authService.login({ email: publicUser.email, password }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'La cuenta no está aprobada.',
    });
  });

  it('normaliza el correo y emite un JWT válido por 24 horas para una cuenta aprobada', async () => {
    findUser.mockResolvedValueOnce({ ...pendingUser, approved: true });

    const result = await authService.login({
      email: ' LOGIN@EXAMPLE.TEST ',
      password,
    });

    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: publicUser.email },
      }),
    );
    expect(loginResponseSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(result).sort()).toEqual(['accessToken', 'user']);
    expect(Object.keys(result.user).sort()).toEqual([
      'approved',
      'email',
      'id',
      'name',
    ]);
    expect(result.user).toEqual({ ...publicUser, approved: true });

    const payload = await jwtService.verifyAsync<{
      sub: string;
      iat: number;
      exp: number;
    }>(result.accessToken, { algorithms: ['HS256'] });
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe(publicUser.id);
    expect(payload.exp - payload.iat).toBe(86_400);
  });
});
