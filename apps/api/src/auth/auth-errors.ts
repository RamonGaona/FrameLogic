import { HttpException, HttpStatus } from '@nestjs/common';

type AuthErrorBody = Readonly<{ message: string; issues?: readonly string[] }>;

export class AuthHttpException extends HttpException {
  constructor(
    readonly body: AuthErrorBody,
    status: HttpStatus,
  ) {
    super(body, status);
  }
}

const publicErrors = {
  duplicateEmail: [HttpStatus.CONFLICT, 'Ya existe una cuenta con ese correo.'],
  invalidCredentials: [
    HttpStatus.UNAUTHORIZED,
    'Correo o contraseña incorrectos.',
  ],
  unapprovedAccount: [HttpStatus.UNAUTHORIZED, 'La cuenta no está aprobada.'],
  approvalUnavailable: [
    HttpStatus.SERVICE_UNAVAILABLE,
    'La aprobación de usuarios no está configurada.',
  ],
  approvalForbidden: [
    HttpStatus.FORBIDDEN,
    'No tiene permiso para administrar cuentas.',
  ],
  tokenRequired: [HttpStatus.UNAUTHORIZED, 'Se requiere un token de acceso.'],
  invalidToken: [HttpStatus.UNAUTHORIZED, 'Token de acceso inválido.'],
  invalidOrExpiredToken: [
    HttpStatus.UNAUTHORIZED,
    'Token de acceso inválido o vencido.',
  ],
  expiredToken: [HttpStatus.UNAUTHORIZED, 'Token de acceso vencido.'],
  selfBlock: [
    HttpStatus.CONFLICT,
    'Un operador no puede bloquear su propia cuenta.',
  ],
  accountNotFound: [
    HttpStatus.NOT_FOUND,
    'No se encontró la cuenta solicitada.',
  ],
  approvalConflict: [
    HttpStatus.CONFLICT,
    'Hubo un conflicto al actualizar la aprobación. Inténtelo de nuevo.',
  ],
} as const;

export function authError(key: keyof typeof publicErrors): AuthHttpException {
  const [status, message] = publicErrors[key];
  return new AuthHttpException({ message }, status);
}

const validationMessages = {
  register: 'Los datos del registro no son válidos.',
  login: 'Los datos del inicio de sesión no son válidos.',
  approval: 'Los datos de aprobación no son válidos.',
};

type ValidationIssue = {
  code: string;
  path: readonly PropertyKey[];
  expected?: string;
  minimum?: number | bigint;
};

type BodySchema<T> = {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly ValidationIssue[] } };
};

export function validateAuthBody<T>(
  schema: BodySchema<T>,
  input: unknown,
  operation: keyof typeof validationMessages,
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new AuthHttpException(
    {
      message: validationMessages[operation],
      issues: result.error.issues.map(describeIssue),
    },
    HttpStatus.BAD_REQUEST,
  );
}

const fields = new Map<PropertyKey, string>([
  ['name', 'name'],
  ['email', 'email'],
  ['password', 'password'],
  ['id', 'id'],
  ['approved', 'approved'],
]);

function describeIssue(issue: ValidationIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return 'El cuerpo contiene campos no permitidos.';
  }

  const field = issue.path.length === 1 ? fields.get(issue.path[0]) : undefined;
  if (!field) {
    return 'El cuerpo debe ser un objeto válido.';
  }

  switch (issue.code) {
    case 'invalid_type':
      return issue.expected === 'boolean'
        ? `${field}: debe ser verdadero o falso.`
        : `${field}: debe ser un texto.`;
    case 'invalid_format':
      return `${field}: el formato no es válido.`;
    case 'too_small':
      return issue.minimum === 1
        ? `${field}: este campo es obligatorio.`
        : `${field}: no cumple la longitud mínima.`;
    case 'too_big':
      return `${field}: supera la longitud máxima.`;
    default:
      return `${field}: el valor no es válido.`;
  }
}
