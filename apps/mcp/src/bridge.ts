import { createServer } from "node:http";
import { randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { resultSchema, toolSchemas, type ToolName, type OperationResult } from "../../../packages/contracts/src/automation";

export function createLocalBridge(origin = "http://localhost:5173", timeoutMs = 120000) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Only local development origins supported");
  const token = randomBytes(32).toString("hex");
  let session: string | undefined;
  let lastPoll = 0;
  let pending: { id: string; tool: ToolName; args: unknown; delivered: boolean;
    resolve: (r: OperationResult) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  const server = createServer(async (req, res) => {
    const host = req.headers.host;
    if (host !== `127.0.0.1:${(server.address() as {port:number})?.port}` || req.headers.origin !== origin) {
      res.writeHead(403).end(); return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.writeHead(204).end(); return;
    }
    const auth = Buffer.from(req.headers.authorization ?? ""), expected = Buffer.from(`Bearer ${token}`);
    if (req.method !== "POST" || auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      res.writeHead(403).end(); return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString(); if (body.length > 4_000_000) throw new Error("Payload too large");
      }
      const raw: unknown = JSON.parse(body);
      const parsed = z.object({ session: z.string().uuid() }).passthrough().parse(raw);
      if (session && parsed.session !== session) { res.writeHead(409).end(); return; }
      session = parsed.session;
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/poll") {
        lastPoll = Date.now();
        if (pending && !pending.delivered) {
          pending.delivered = true;
          res.end(JSON.stringify({ id: pending.id, tool: pending.tool, args: pending.args }));
        } else res.end("null");
      } else if (req.url === "/result") {
        const reply = z.object({ session: z.string(), id: z.string(), result: resultSchema }).strict().parse(raw);
        if (!pending || reply.id !== pending.id || !pending.delivered) { res.writeHead(409).end(); return; }
        clearTimeout(pending.timer); pending.resolve(reply.result); pending = undefined;
        res.end("null");
      } else res.writeHead(404).end();
    } catch { res.writeHead(400).end(); }
  });
  server.requestTimeout = 15000;
  return { server, token,
    call(tool: ToolName, args: unknown): Promise<OperationResult> {
      const validated = toolSchemas[tool].parse(args);
      if (!session || Date.now() - lastPoll > 5000) return Promise.resolve({ ok: false, error: "No active browser session; connect the local modeler first" });
      if (pending) return Promise.resolve({ ok: false, error: "Another operation is pending" });
      return new Promise(resolve => {
        pending = { id: randomUUID(), tool, args: validated, resolve, delivered: false,
          timer: setTimeout(() => {
            resolve({ ok: false, error: "Browser response timed out; result is unknown. Inspect model before retrying." }); pending = undefined;
          }, timeoutMs) };
      });
    },
    async close() {
      if (pending) { clearTimeout(pending.timer); pending.resolve({ ok: false, error: "Bridge closed" }); pending = undefined; }
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
