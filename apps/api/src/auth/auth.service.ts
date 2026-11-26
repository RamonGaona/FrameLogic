import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  createAccountSchema,
  loginSchema,
  type LoginResponse,
} from '@framelogic/contracts';
import { prisma } from '@framelogic/database';
import { authError, validateAuthBody } from './auth-errors.js';

// Servicio de Acceso: registrar una cuenta nueva.
// En orden: valida con el contrato del Día 7, cifra la contraseña con
// bcrypt, crea el usuario con approved en false (el modelo lo pone por
// defecto) y responde sin devolver nunca la contraseña ni su hash.
// El cliente `prisma` viene del paquete compartido `@framelogic/database`,
// igual que lo usa el /health: no se inyecta por constructor porque noz
// hay ningún PrismaService en el proyecto.
@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async register(input: unknown) {
    const data = validateAuthBody(createAccountSchema, input, 'register');

    // El 10 es el costo de bcrypt: cuántas vueltas da el algoritmo.
    // Más vueltas, más seguro y más lento. 10 es el estándar.
    const hash = await bcrypt.hash(data.password, 10);

    try {
      // No se pasa `approved`: el modelo lo deja en false por defecto,
      // así nadie nace aprobado.
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hash,
        },
      });

      // Respuesta campo por campo, nunca el objeto de Prisma completo,
      // porque ese objeto trae el hash y se filtraría.
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        approved: false,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      // Correo duplicado: el email es @unique, Prisma rechaza con P2002.
      if (isUniqueConstraintError(error)) {
        throw authError('duplicateEmail');
      }
      throw error;
    }
  }

  async login(input: unknown): Promise<LoginResponse> {
    const { email, password } = validateAuthBody(loginSchema, input, 'login');
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        approved: true,
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw authError('invalidCredentials');
    }

    if (!user.approved) {
      throw authError('unapprovedAccount');
    }

    const accessToken = await this.jwtService.signAsync({ sub: user.id });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        approved: true,
      },
    };
  }
}

// Prisma marca el correo duplicado con el código P2002. Se revisa el código
// sin importar la clase del error, porque el `catch` recibe `unknown`.
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
