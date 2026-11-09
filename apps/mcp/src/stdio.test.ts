import { toolSchemas } from "../../../packages/contracts/src/automation";
import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
it("starts the real stdio entrypoint and reports absence of a browser", async () => {
  const client = new Client({ name:"stdio-smoke", version:"1" });
  const transport = new StdioClientTransport({ command:process.execPath,
    args:["--import","tsx",fileURLToPath(new URL("./main.ts",import.meta.url))], stderr:"pipe" });
  try {
    await client.connect(transport);
    const listed=await client.listTools();
    expect(listed.tools.map(t=>t.name)).toContain("prepare_operation");
    expect(listed.tools.map(t=>t.name)).toContain("prepare_commands");
    expect(listed.tools.map(t=>t.name)).toContain("query_objects");
    expect(listed.tools).toHaveLength(Object.keys(toolSchemas).length);
    expect((await client.callTool({name:"get_model_info",arguments:{}})).isError).toBe(true);
  } finally { await client.close(); await transport.close(); }
},10000);
