import { z } from 'zod';

export const projectResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

// 4. Crear proyecto
export const createProjectSchema = z
    .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
    })
    .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// 5. Ver mis proyectos: sin schema de entrada, el dueño sale del token
export const listMyProjectsResponseSchema = z.array(projectResponseSchema);

// 6. Ver un proyecto
export const getProjectSchema = z
    .object({ id: z.string().min(1) })
    .strict();

export type GetProjectInput = z.infer<typeof getProjectSchema>;

// 7. Editar proyecto
export const updateProjectSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
    })
    .strict()
    .refine((data) => data.name !== undefined || data.description !== undefined, {
        message: 'Nada que editar: manda name y/o description',
    });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const updateProjectResponseSchema = projectResponseSchema.extend({
    updatedAt: z.string(),
});

// 8. Borrar proyecto
export const deleteProjectSchema = z
    .object({ id: z.string().min(1) })
    .strict();

export type DeleteProjectInput = z.infer<typeof deleteProjectSchema>;

export const deleteProjectResponseSchema = z.object({ success: z.boolean() });

export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;
