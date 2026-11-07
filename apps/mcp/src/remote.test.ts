import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import worker, { ModelSession, type SessionState, type RemoteEnv } from "./remote";
import { connectAutomationBridge } from "../../../packages/bim/core/src/automation/BrowserBridge";
import { createAutomationFixture } from "../../../packages/bim/core/src/automation/fixture";

function fixture() {
  const objects = new Map<string, ModelSession>();
  const env: RemoteEnv = { ALLOWED_ORIGIN: "https://framelogic-dev.pages.dev", SESSION_KEY: "test-key-".repeat(8), SESSIONS: {
    idFromName: name => name,
    get(id) {
      if (!objects.has(String(id))) {
        const data = new Map<string, unknown>();
        const state: SessionState = { blockConcurrencyWhile: fn => fn(), storage: {
          get: async <T>(key: string) => data.get(key) as T | undefined,
          put: async (key, value) => { data.set(key, value); }, deleteAll: async () => { data.clear(); }, setAlarm: async () => {},
        } };
        objects.set(String(id), new ModelSession(state));
      }
      return objects.get(String(id))!;
    },
  } };
  const fetchWorker = async (input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), env);
  const create = async () => {
    const r = await fetchWorker("https://relay.test/sessions", { method: "POST", headers: { Authorization: `Bearer ${env.SESSION_KEY}`, Origin: env.ALLOWED_ORIGIN } });
    expect(r.status).toBe(201);
    return await r.json() as { id: string; browserToken: string; agentToken: string; expires: number };
  };
  return { env, fetchWorker, create, objects };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("remote MCP worker", () => {
  it("isolates credentials, rejects origins and revokes sessions", async () => {
    const f = fixture();
    expect((await f.fetchWorker("https://relay.test/sessions", { method: "POST" })).status).toBe(401);
    expect((await f.fetchWorker("https://relay.test/sessions", { method: "POST", headers: { Origin: "https://evil.test", Authorization: `Bearer ${f.env.SESSION_KEY}` } })).status).toBe(403);
    const a = await f.create(), b = await f.create();
    const post = (id: string, path: string, token: string, body: unknown = { session: crypto.randomUUID() }) => f.fetchWorker(`https://relay.test/sessions/${id}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    expect((await post(a.id, "poll", b.browserToken)).status).toBe(401);
    expect((await post(a.id, "poll", a.agentToken)).status).toBe(401);
    expect((await post(a.id, "mcp", a.browserToken)).status).toBe(401);
    expect((await post(a.id, "poll", a.browserToken)).status).toBe(200);
    expect((await post(a.id, "poll", a.browserToken)).status).toBe(409);
    expect((await post(a.id, "close", a.browserToken)).status).toBe(200);
    expect((await post(a.id, "poll", a.browserToken)).status).toBe(410);
    expect((await post(b.id, "poll", b.browserToken)).status).toBe(200);
    await f.objects.get(b.id)!.alarm();
    expect((await post(b.id, "poll", b.browserToken)).status).toBe(410);
  });
  it("runs the official HTTP MCP client through browser approval to the real model, undo and refusal", async () => {
    const f = fixture(), session = await f.create();
    vi.stubGlobal("fetch", f.fetchWorker);
    const model = createAutomationFixture();
    const approve = vi.fn(() => true);
    const base = `https://relay.test/sessions/${session.id}`;
    const stop = connectAutomationBridge(model.operations, session.browserToken, approve, base);
    const client = new Client({ name: "remote-test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${session.agentToken}` } }, fetch: f.fetchWorker });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(10);
      const call = async (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }, undefined, { timeout: 10000 });
      expect((await call("list_pieces")).isError).toBe(false);
      const proposal = await call("prepare_operation", { request: { operation: "copy_piece_array", id: "REC1500-instance", space: "local", direction: { x: 1, y: 0, z: 0 }, distance: 1500, count: 4 } });
      const id = (proposal.structuredContent as { data: { id: string } }).data.id;
      expect(model.model.pieceInstances.count).toBe(1);
      expect((await call("confirm_operation", { proposalId: id })).isError).toBe(false);
      expect(model.model.pieceInstances.count).toBe(5);
      expect((await call("undo")).isError).toBe(false);
      expect(model.model.pieceInstances.count).toBe(1);
      approve.mockReturnValue(false);
      expect((await call("redo")).isError).toBe(true);
      expect(model.model.pieceInstances.count).toBe(1);
      const late = await call("prepare_operation", { request: { operation: "copy_piece", id: "REC1500-instance", space: "world", direction: { x: 1, y: 0, z: 0 }, distance: 100, count: 1 } });
      approve.mockImplementation(() => { vi.spyOn(Date, "now").mockReturnValue(Date.now() + 100000); return true; });
      expect((await call("confirm_operation", { proposalId: (late.structuredContent as { data: { id: string } }).data.id })).isError).toBe(true);
      expect(model.model.pieceInstances.count).toBe(1);
      vi.restoreAllMocks();
    } finally { stop(); await client.close(); await f.objects.get(session.id)!.alarm(); }
  }, 20000);
  it("delivers once, rejects concurrent calls and never retries a timed-out mutation", async () => {
    vi.useFakeTimers();
    const f = fixture(), session = await f.create(), tab = crypto.randomUUID();
    const poll = () => f.fetchWorker(`https://relay.test/sessions/${session.id}/poll`, { method: "POST", headers: { Authorization: `Bearer ${session.browserToken}` }, body: JSON.stringify({ session: tab }) });
    await poll();
    const object = f.objects.get(session.id)!;
    const waiting = object.call("undo", {});
    expect((await object.call("redo", {})).ok).toBe(false);
    expect(await (await poll()).json()).toMatchObject({ tool: "undo" });
    expect(await (await poll()).json()).toBeNull();
    await vi.advanceTimersByTimeAsync(90001);
    expect(await waiting).toMatchObject({ ok: false, error: expect.stringContaining("unknown") });
    expect(await (await poll()).json()).toBeNull();
    await object.alarm();
  });
});
