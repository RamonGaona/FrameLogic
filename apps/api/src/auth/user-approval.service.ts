import { Injectable, Logger } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import {
  setUserApprovalSchema,
  type SetUserApprovalResponse,
} from '@framelogic/contracts';
import { prisma } from '@framelogic/database';
import { readApiEnv } from './api-env.js';
import { authError, validateAuthBody } from './auth-errors.js';

const publicUserFields = {
  id: true,
  name: true,
  email: true,
  approved: true,
  updatedAt: true,
} as const;
const maxAttempts = 3;

@Injectable()
export class UserApprovalService {
  private readonly logger = new Logger(UserApprovalService.name);
  private readonly operatorIds = readOperatorIds();

  constructor(private readonly jwt: JwtService) {}

  async setApproval(
    authorization: string | undefined,
    body: unknown,
  ): Promise<SetUserApprovalResponse> {
    const operatorIds = this.operatorIds;
    if (!operatorIds) {
      throw authError('approvalUnavailable');
    }

    const token = await this.verifyToken(authorization);
    if (!operatorIds.has(token.sub)) {
      throw authError('approvalForbidden');
    }

    for (let attempt = 1; ; attempt++) {
      try {
        const user = await prisma.$transaction(
          async (tx) => {
            if (token.exp <= Date.now() / 1000) {
              throw authError('expiredToken');
            }

            // La autorización se vuelve a comprobar en cada intento, dentro de la transacción.
            const operator = await tx.user.findUnique({
              where: { id: token.sub },
              select: { approved: true },
            });
            if (!operator?.approved) {
              throw authError('approvalForbidden');
            }

            const { id, approved } = validateAuthBody(
              setUserApprovalSchema,
              body,
              'approval',
            );
            if (id === token.sub && !approved) {
              throw authError('selfBlock');
            }

            const target = await tx.user.findUnique({
              where: { id },
              select: publicUserFields,
            });
            if (!target) {
              throw authError('accountNotFound');
            }
            if (target.approved === approved) {
              return target;
            }

            return tx.user.update({
              where: { id },
              data: { approved },
              select: publicUserFields,
            });
          },
          { isolationLevel: 'Serializable' },
        );

        this.logger.log({
          event: 'user_approval',
          actorId: token.sub,
          targetId: user.id,
          approved: user.approved,
          outcome: 'success',
        });
        return { ...user, updatedAt: user.updatedAt.toISOString() };
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;
        if (code === 'P2025') {
          throw authError('accountNotFound');
        }
        if (code !== 'P2034' && !isAdapterWriteConflict(error)) {
          throw error;
        }
        if (attempt === maxAttempts) {
          throw authError('approvalConflict');
        }
      }
    }
  }

  private async verifyToken(authorization: string | undefined) {
    const bearer = /^Bearer +([^\s,]+)$/i.exec(authorization ?? '');
    if (!bearer) {
      throw authError('tokenRequired');
    }

    const payload = await this.jwt
      .verifyAsync<Record<string, unknown>>(bearer[1], {
        algorithms: ['HS256'],
      })
      .catch((error: unknown) => {
        if (error instanceof JsonWebTokenError) {
          throw authError('invalidOrExpiredToken');
        }
        throw error;
      });

    const sub = payload?.sub;
    const exp = payload?.exp;
    if (
      typeof sub !== 'string' ||
      !sub.trim() ||
      typeof exp !== 'number' ||
      !Number.isFinite(exp)
    ) {
      throw authError('invalidToken');
    }
    return { sub, exp };
  }
}

function readOperatorIds(): ReadonlySet<string> | undefined {
  let value: string | undefined;
  try {
    value = readApiEnv('APPROVAL_OPERATOR_IDS');
  } catch {
    // Una configuración administrativa inaccesible debe dejar la ruta en 503.
    return undefined;
  }

  const entries = value?.split(',').map((id) => id.trim()) ?? [];
  const ids = new Set(entries);
  if (entries.length === 3 && ids.size === 3 && !ids.has('')) {
    return ids;
  }
}

function isAdapterWriteConflict(error: unknown): boolean {
  // Prisma 7 puede propagar el error del adaptador directamente al fallar COMMIT.
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') {
    return false;
  }

  const cause = error.cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'kind' in cause &&
    cause.kind === 'TransactionWriteConflict'
  );
}
