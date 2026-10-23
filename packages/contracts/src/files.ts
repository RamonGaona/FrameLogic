import { z } from 'zod';

export const fileResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    size: z.number().int().nonnegative(),
    projectId: z.string(),
    createdAt: z.string(),
});

export type FileResponse = z.infer<typeof fileResponseSchema>;

// 9. Subir archivo (el binario va aparte en multipart, Zod valida los campos)
export const uploadFileSchema = z
    .object({
        projectId: z.string().min(1),
        name: z.string().trim().min(1).max(255).optional(),
    })
    .strict();

export type UploadFileInput = z.infer<typeof uploadFileSchema>;

// 10. Ver archivos de un proyecto
export const listFilesSchema = z
    .object({ projectId: z.string().min(1) })
    .strict();

export type ListFilesInput = z.infer<typeof listFilesSchema>;

export const listFilesResponseSchema = z.array(
    fileResponseSchema.omit({ projectId: true }),
);

// 11. Descargar archivo: NO tiene schema JSON, devuelve el binario mismo
export const downloadFileSchema = z
    .object({ id: z.string().min(1) })
    .strict();

export type DownloadFileInput = z.infer<typeof downloadFileSchema>;

// 12. Borrar archivo
export const deleteFileSchema = z
    .object({ id: z.string().min(1) })
    .strict();

export type DeleteFileInput = z.infer<typeof deleteFileSchema>;

export const deleteFileResponseSchema = z.object({ success: z.boolean() });

export type DeleteFileResponse = z.infer<typeof deleteFileResponseSchema>;
