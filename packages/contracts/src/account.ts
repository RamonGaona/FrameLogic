import { z } from 'zod';

const utf8 = new TextEncoder();
const bcryptMaxBytes = 72;

export const createAccountSchema = z
    .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8).superRefine((password, ctx) => {
            if (utf8.encode(password).byteLength > bcryptMaxBytes) {
                ctx.addIssue({
                    code: 'too_big',
                    origin: 'string',
                    maximum: bcryptMaxBytes,
                    inclusive: true,
                    message: 'La contraseña supera los 72 bytes UTF-8.',
                });
            }
        }),
    })
    .strict();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const createAccountResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    approved: z.literal(false),
    createdAt: z.string(),
});

export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;

export const loginSchema = z
    .object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(1),
    })
    .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const loginResponseSchema = z.object({
    accessToken: z.string().min(1),
    user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
        approved: z.literal(true),
    }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const setUserApprovalSchema = z
    .object({
        id: z.string().min(1),
        approved: z.boolean(),
    })
    .strict();

export type SetUserApprovalInput = z.infer<typeof setUserApprovalSchema>;

export const setUserApprovalResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    approved: z.boolean(),
    updatedAt: z.string(),
});

export type SetUserApprovalResponse = z.infer<typeof setUserApprovalResponseSchema>;
