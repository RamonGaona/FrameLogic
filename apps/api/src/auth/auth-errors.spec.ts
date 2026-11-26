import {
  createAccountSchema,
  loginSchema,
  setUserApprovalSchema,
} from '@framelogic/contracts';
import { describe, expect, it } from 'vitest';
import { validateAuthBody } from './auth-errors.js';

describe('Errores de validación de autenticación', () => {
  it('describe los campos del contrato sin reflejar valores ni nombres de campos extra', () => {
    const marker = 'MARCADOR_DE_PRUEBA';
    expect(() =>
      validateAuthBody(
        createAccountSchema,
        {
          name: 'x',
          email: marker,
          password: 'breve',
          [marker]: marker,
        },
        'register',
      ),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        body: {
          message: 'Los datos del registro no son válidos.',
          issues: [
            'name: no cumple la longitud mínima.',
            'email: el formato no es válido.',
            'password: no cumple la longitud mínima.',
            'El cuerpo contiene campos no permitidos.',
          ],
        },
      }),
    );
  });

  it('indica que la contraseña de login es obligatoria', () => {
    expect(() =>
      validateAuthBody(
        loginSchema,
        {
          email: 'user@example.test',
          password: '',
        },
        'login',
      ),
    ).toThrow(
      expect.objectContaining({
        body: {
          message: 'Los datos del inicio de sesión no son válidos.',
          issues: ['password: este campo es obligatorio.'],
        },
      }),
    );
  });

  it('exige un booleano en el cuerpo de aprobación', () => {
    expect(() =>
      validateAuthBody(
        setUserApprovalSchema,
        {
          id: 'account-id',
          approved: 'true',
        },
        'approval',
      ),
    ).toThrow(
      expect.objectContaining({
        body: {
          message: 'Los datos de aprobación no son válidos.',
          issues: ['approved: debe ser verdadero o falso.'],
        },
      }),
    );
  });

  it('describe un cuerpo inválido sin revelar su contenido', () => {
    expect(() =>
      validateAuthBody(setUserApprovalSchema, [], 'approval'),
    ).toThrow(
      expect.objectContaining({
        body: {
          message: 'Los datos de aprobación no son válidos.',
          issues: ['El cuerpo debe ser un objeto válido.'],
        },
      }),
    );
  });
});
