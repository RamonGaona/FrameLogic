import { z } from "zod";
const id = z.string().min(1).max(200);
const vec = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict();
const space = z.enum(["local", "world"]);
export const changeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("move_piece"), id, space, position: vec.optional(), displacement: vec.optional() }).strict(),
  z.object({ operation: z.literal("copy_piece"), id, space, direction: vec, distance: z.number().positive().finite(), count: z.literal(1) }).strict(),
  z.object({ operation: z.literal("copy_piece_array"), id, space, direction: vec, distance: z.number().positive().finite(), count: z.number().int().min(1).max(100) }).strict(),
]);
export const toolSchemas = {
  get_model_info: z.object({}).strict(),
  list_pieces: z.object({}).strict(),
  get_piece: z.object({ id }).strict(),
  list_piece_snaps: z.object({ id }).strict(),
  get_piece_axes: z.object({ id }).strict(),
  select_pieces: z.object({ ids: z.array(id).max(1000) }).strict(),
  prepare_operation: z.object({ request: changeSchema }).strict(),
  confirm_operation: z.object({ proposalId: id }).strict(),
  undo: z.object({}).strict(),
  redo: z.object({}).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export const resultSchema = z.object({ ok: z.boolean(), data: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() }).strict();
export type OperationResult = z.infer<typeof resultSchema>;
export const messageSchema = z.object({ id, tool: z.enum(Object.keys(toolSchemas) as [ToolName, ...ToolName[]]), args: z.unknown(), expiresAt: z.number().finite().optional() }).strict();
