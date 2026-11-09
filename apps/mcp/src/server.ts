import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolSchemas, resultSchema, type ToolName, type OperationResult } from "../../../packages/contracts/src/automation";
export function createMcpServer(call: (name: ToolName, args: unknown) => Promise<OperationResult>) {
  const server = new McpServer({ name: "framelogic-experimental", version: "0.1.93" });
  for (const name of Object.keys(toolSchemas) as ToolName[]) {
    server.registerTool(name, {
      description: name === "prepare_operation" ? "Validate and preview move_piece/copy_piece/copy_piece_array. Does not modify model. Distances in mm."
        : name === "confirm_operation" ? "Request browser human approval of the prepared proposal; never bypasses approval."
        : name === "prepare_commands" ? "PREVIEW ONLY: validate up to 12 ordered move/copy commands (max 100 new pieces). No model changes. Call confirm_commands for browser approval."
        : name === "confirm_commands" ? "Request a single human approval for a prepared command sequence. Executes all commands atomically as one Undo step."
        : name === "query_objects" ? "Read-only: filter CAD instances by ID, name/code or selection; return identity, transforms and detailed-asset bounds in mm."
        : name === "describe_object" ? "Read-only: inspect a piece instance's model data, local axes and persistent snaps."
        : `FrameLogic ${name}`,
      inputSchema: toolSchemas[name].shape, outputSchema: resultSchema.shape,
      annotations: { readOnlyHint: name.startsWith("get_") || name.startsWith("list_") || name === "prepare_operation" || name === "prepare_commands" || name === "query_objects" || name === "describe_object", openWorldHint: false },
    }, async (args: unknown) => {
      try {
        const result = resultSchema.parse(await call(name, args));
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok };
      } catch (e) {
        const result = { ok: false, error: String(e) };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result, isError: true };
      }
    });
  }
  return server;
}
