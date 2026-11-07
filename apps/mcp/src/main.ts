import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLocalBridge } from "./bridge";
import { createMcpServer } from "./server";
const bridge = createLocalBridge();
bridge.server.on("error", error => { console.error(error); process.exitCode = 1; });
await new Promise<void>((resolve, reject) => {
  bridge.server.once("error", reject);
  bridge.server.listen(43185, "127.0.0.1", resolve);
});
console.error(`FrameLogic local bridge token: ${bridge.token}`);
console.error("Open http://localhost:5173 and explicitly connect from the browser console. Token is valid only for this process.");
const server = createMcpServer(bridge.call);
await server.connect(new StdioServerTransport());
const close = async () => { await bridge.close(); await server.close(); };
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
process.stdin.on("end", () => void close());
