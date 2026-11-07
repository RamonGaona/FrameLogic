import "./workerRuntime";
import { z } from "zod";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server";
import { resultSchema, toolSchemas, type ToolName, type OperationResult } from "../../../packages/contracts/src/automation";

// Structural interfaces keep the worker independent of Node and generated account types.
export interface SessionState {
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>;
    deleteAll(): Promise<void>; setAlarm(time: number): Promise<void> };
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}
export interface RemoteEnv {
  ALLOWED_ORIGIN: string;
  SESSION_KEY: string;
  SESSIONS: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
const bearer = (request: Request) => request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
const credentialSchema = z.object({ browserHash: z.string().length(64), agentHash: z.string().length(64), expires: z.number() }).strict();
type Credentials = z.infer<typeof credentialSchema>;
async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 4_000_000) throw new Error("Payload too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.length;
    if (length > 4_000_000) { await reader.cancel(); throw new Error("Payload too large"); }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(body));
}

export default {
  async fetch(request: Request, env: RemoteEnv): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin rejected" }, 403);
    const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id");
    headers.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
    let response: Response;
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "OPTIONS") response = new Response(null, { status: 204 });
      else if (path === "/health" && request.method === "GET") response = json({ service: "framelogic-mcp", version: "0.1.87" });
      else if (path === "/sessions" && request.method === "POST") {
        if (!env.SESSION_KEY || env.SESSION_KEY.length < 32 || !bearer(request) || await hash(bearer(request)) !== await hash(env.SESSION_KEY)) {
          response = json({ error: "Invalid session creation key" }, 401);
        } else {
          const id = crypto.randomUUID(), browserToken = secret(), agentToken = secret(), expires = Date.now() + 60 * 60 * 1000;
          const target = env.SESSIONS.get(env.SESSIONS.idFromName(id));
          const initialized = await target.fetch(new Request("https://session/init", { method: "POST", body: JSON.stringify({
            browserHash: await hash(browserToken), agentHash: await hash(agentToken), expires,
          }) }));
          if (!initialized.ok) throw new Error("Cannot create session");
          response = json({ id, browserToken, agentToken, expires }, 201);
        }
      } else {
        const match = /^\/sessions\/([a-f0-9-]{36})\/(poll|result|close|mcp)$/.exec(path);
        if (!match || !z.string().uuid().safeParse(match[1]).success) response = json({ error: "Not found" }, 404);
        else {
          const target = env.SESSIONS.get(env.SESSIONS.idFromName(match[1]));
          const url = new URL(request.url); url.pathname = `/${match[2]}`;
          response = await target.fetch(new Request(url, request));
        }
      }
    } catch { response = json({ error: "Invalid request or unavailable session" }, 400); }
    for (const [key, value] of response.headers) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};

export class ModelSession {
  private state: SessionState;
  private credentials?: Credentials;
  private ready: Promise<void>;
  private browserSession?: string;
  private lastPoll = 0;
  private pending?: { id: string; tool: ToolName; args: unknown; expiresAt: number; delivered: boolean;
    resolve: (result: OperationResult) => void; timer: ReturnType<typeof setTimeout> };
  constructor(state: SessionState) {
    this.state = state;
    this.ready = state.blockConcurrencyWhile(async () => { this.credentials = await state.storage.get<Credentials>("credentials"); this.browserSession = await state.storage.get<string>("browserSession"); });
  }
  private finish(result: OperationResult) {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.resolve(result); this.pending = undefined; }
  }
  async alarm() {
    this.finish({ ok: false, error: "Session expired; inspect model before retrying" });
    this.credentials = undefined;
    await this.state.storage.deleteAll();
  }
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const path = new URL(request.url).pathname;
    try {
      // /init is only routed internally after authenticating SESSION_KEY.
      if (path === "/init" && request.method === "POST") {
        if (this.credentials) return json({ error: "Already initialized" }, 409);
        this.credentials = credentialSchema.parse(await readJson(request));
        await this.state.storage.put("credentials", this.credentials);
        await this.state.storage.setAlarm(this.credentials.expires);
        return json({ ok: true });
      }
      const credentials = this.credentials;
      if (!credentials || credentials.expires <= Date.now()) return json({ error: "Session expired or closed" }, 410);
      const tokenHash = await hash(bearer(request));
      if (tokenHash !== (path === "/mcp" ? credentials.agentHash : credentials.browserHash)) return json({ error: "Unauthorized" }, 401);
      if (path === "/mcp") {
        if (request.method !== "POST") return json({ error: "Use MCP POST requests" }, 405);
        const body = await readJson(request);
        const server = createMcpServer((name, args) => this.call(name, args));
        const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
        try {
          await server.connect(transport);
          return await transport.handleRequest(request, { parsedBody: body });
        } finally { await server.close(); }
      }
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (path === "/close") { await this.alarm(); return json({ ok: true }); }
      const raw = await readJson(request);
      const { session } = z.object({ session: z.string().uuid() }).parse(raw);
      if (this.browserSession && session !== this.browserSession) return json({ error: "Another tab owns this session" }, 409);
      if (!this.browserSession) { this.browserSession = session; await this.state.storage.put("browserSession", session); }
      if (path === "/poll") {
        this.lastPoll = Date.now();
        if (this.pending && !this.pending.delivered) {
          this.pending.delivered = true;
          return json({ id: this.pending.id, tool: this.pending.tool, args: this.pending.args, expiresAt: this.pending.expiresAt });
        }
        return json(null);
      }
      if (path === "/result") {
        const reply = z.object({ session: z.string().uuid(), id: z.string().uuid(), result: resultSchema }).strict().parse(raw);
        if (!this.pending || this.pending.id !== reply.id || !this.pending.delivered) return json({ error: "Unknown result; inspect model" }, 409);
        this.finish(reply.result); return json(null);
      }
      return json({ error: "Not found" }, 404);
    } catch { return json({ error: "Invalid request" }, 400); }
  }
  call(tool: ToolName, args: unknown): Promise<OperationResult> {
    const validated = toolSchemas[tool].parse(args);
    if (!this.credentials || this.credentials.expires <= Date.now() || !this.browserSession || Date.now() - this.lastPoll > 15000)
      return Promise.resolve({ ok: false, error: "Keep the connected FrameLogic tab open and active" });
    if (this.pending) return Promise.resolve({ ok: false, error: "Another operation is pending" });
    return new Promise(resolve => {
      this.pending = { id: crypto.randomUUID(), tool, args: validated, expiresAt: Math.min(Date.now() + 90000, this.credentials!.expires), delivered: false, resolve,
        timer: setTimeout(() => this.finish({ ok: false, error: "Response timed out; result unknown. Inspect model before retrying." }), 90000) };
    });
  }
}
