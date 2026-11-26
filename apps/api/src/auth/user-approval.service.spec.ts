import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserApprovalService } from './user-approval.service.js';

const { transaction, findUser, updateUser } = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('@framelogic/database', () => ({
  prisma: { $transaction: transaction },
}));
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));

const readEnvFile = vi.mocked(readFileSync);

describe('UserApprovalService', () => {
  const jwt = new JwtService({ secret: randomBytes(32) });
  const operators = ['operator-a', 'operator-b', 'operator-c'];
  const target = {
    id: 'target',
    name: 'Cuenta de prueba',
    email: 'target@example.test',
    approved: false,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  let service: UserApprovalService;
  let authorization: string;
  const audit = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('APPROVAL_OPERATOR_IDS', operators.join(','));
    vi.spyOn(Logger.prototype, 'log').mockImplementation(audit);
    service = new UserApprovalService(jwt);
    authorization = `Bearer ${await jwt.signAsync({ sub: operators[0] }, { expiresIn: '1h' })}`;
    const tx = { user: { findUnique: findUser, update: updateUser } };
    transaction.mockImplementation((run: (client: typeof tx) => unknown) =>
      run(tx),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('carga tres operadores de apps/api/.env cuando la variable está ausente', async () => {
    vi.stubEnv('APPROVAL_OPERATOR_IDS', undefined);
    readEnvFile.mockReturnValue(
      `APPROVAL_OPERATOR_IDS="${operators.join(', ')}"\n`,
    );
    findUser
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce(target);

    await expect(
      new UserApprovalService(jwt).setApproval(authorization, {
        id: target.id,
        approved: false,
      }),
    ).resolves.toMatchObject({ id: target.id, approved: false });
    expect(readEnvFile).toHaveBeenCalledWith(
      new URL('../../.env', import.meta.url),
      'utf8',
    );
    expect(process.env.APPROVAL_OPERATOR_IDS).toBeUndefined();
  });

  it('prioriza la lista del entorno cuando el archivo autoriza a otro operador', async () => {
    readEnvFile.mockReturnValue(
      'APPROVAL_OPERATOR_IDS=other-a,other-b,other-c\n',
    );
    findUser
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce(target);

    await expect(
      new UserApprovalService(jwt).setApproval(authorization, {
        id: target.id,
        approved: false,
      }),
    ).resolves.toMatchObject({ id: target.id, approved: false });
    expect(readEnvFile).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'operator-a,operator-b',
    'operator-a,operator-a,operator-c',
    'operator-a,,operator-c',
  ])(
    'deshabilita la operación con un entorno inválido aunque el archivo sea válido',
    async (value) => {
      vi.stubEnv('APPROVAL_OPERATOR_IDS', value);
      readEnvFile.mockReturnValue(
        `APPROVAL_OPERATOR_IDS=${operators.join(',')}\n`,
      );
      await expect(
        new UserApprovalService(jwt).setApproval(authorization, {}),
      ).rejects.toMatchObject({ status: 503 });
      expect(readEnvFile).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    'OTHER_SETTING=test\n',
    'APPROVAL_OPERATOR_IDS=operator-a,operator-a,operator-c\n',
  ])(
    'deshabilita la operación si el archivo omite la lista o contiene una lista inválida',
    async (file) => {
      vi.stubEnv('APPROVAL_OPERATOR_IDS', undefined);
      readEnvFile.mockReturnValue(file);

      await expect(
        new UserApprovalService(jwt).setApproval(authorization, {}),
      ).rejects.toMatchObject({ status: 503 });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['ENOENT', 'EACCES'])(
    'deshabilita la operación si el archivo local no está disponible',
    async (code) => {
      vi.stubEnv('APPROVAL_OPERATOR_IDS', undefined);
      readEnvFile.mockImplementation(() => {
        throw Object.assign(new Error(), { code });
      });

      await expect(
        new UserApprovalService(jwt).setApproval(authorization, {}),
      ).rejects.toMatchObject({ status: 503 });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('exige que el actor exista y esté aprobado antes de consultar al destinatario', async () => {
    findUser.mockResolvedValueOnce(null);
    await expect(
      service.setApproval(authorization, { id: target.id, approved: true }),
    ).rejects.toMatchObject({ status: 403 });
    expect(findUser).toHaveBeenCalledTimes(1);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('revalida al actor cuando se reintenta la transacción', async () => {
    findUser
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ approved: false });
    updateUser.mockRejectedValueOnce({ code: 'P2034' });

    await expect(
      service.setApproval(authorization, { id: target.id, approved: true }),
    ).rejects.toMatchObject({ status: 403 });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it('limita los reintentos y responde 409 si persiste el conflicto', async () => {
    transaction.mockRejectedValue({ code: 'P2034' });
    await expect(
      service.setApproval(authorization, { id: target.id, approved: true }),
    ).rejects.toMatchObject({ status: 409 });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(audit).not.toHaveBeenCalled();
  });

  it('mantiene updatedAt y evita escribir al repetir el mismo estado', async () => {
    findUser
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce(target);
    await expect(
      service.setApproval(authorization, { id: target.id, approved: false }),
    ).resolves.toEqual({
      ...target,
      updatedAt: target.updatedAt.toISOString(),
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledExactlyOnceWith({
      event: 'user_approval',
      actorId: operators[0],
      targetId: target.id,
      approved: false,
      outcome: 'success',
    });
  });
});
