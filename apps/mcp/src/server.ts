import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolSchemas, resultSchema, type ToolName, type OperationResult } from "../../../packages/contracts/src/automation";
export function createMcpServer(call: (name: ToolName, args: unknown) => Promise<OperationResult>) {
  const server = new McpServer({ name: "framelogic-experimental", version: "0.1.87" });
  for (const name of Object.keys(toolSchemas) as ToolName[]) {
    server.registerTool(name, {
      description: name === "prepare_operation" ? "Validate and preview move_piece/copy_piece/copy_piece_array. Does not modify model. Distances in mm."
        : name === "confirm_operation" ? "Request browser human approval of the prepared proposal; never bypasses approval." : `FrameLogic ${name}`,
      inputSchema: toolSchemas[name].shape, outputSchema: resultSchema.shape,
      annotations: { readOnlyHint: name.startsWith("get_") || name.startsWith("list_") || name === "prepare_operation", openWorldHint: false },
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
