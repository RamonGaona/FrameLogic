import { messageSchema } from "../../../../contracts/src/automation";
import { createOperationDispatcher } from "./dispatch";
import type { ModelOperations } from "./ModelOperations";

/** Explicit opt-in bridge. Credentials stay in memory; mutations are never retried. */
export function connectAutomationBridge(ops: ModelOperations, token: string,
  approve: (summary: unknown) => boolean | Promise<boolean>, base = "http://127.0.0.1:43185",
  onState: (state: "connected" | "disconnected" | "error", message?: string) => void = () => {}) {
  const url = new URL(base);
  const remote = url.protocol === "https:" && /^\/sessions\/[a-f0-9-]{36}$/.test(url.pathname);
  if (url.username || url.password || url.search || url.hash || (!remote && !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)))
    throw new Error("Use an HTTPS session URL or IPv4 loopback");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Expected the 64-character bridge token");
  const controller = new AbortController();
  let expiresAt = Infinity;
  const dispatch = createOperationDispatcher(ops, async summary => {
    const accepted = await approve(summary);
    return accepted && !controller.signal.aborted && Date.now() < expiresAt;
  });
  let connected = false;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const session = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const response = await fetch(`${base}/poll`, { method: "POST", headers,
        body: JSON.stringify({ session }), signal: controller.signal });
      if (!response.ok) throw new Error(`Bridge rejected connection (${response.status})`);
      const raw: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!connected) { connected = true; onState("connected"); }
      if (raw !== null) {
        const message = messageSchema.parse(raw);
        expiresAt = message.expiresAt ?? Infinity;
        const result = Date.now() >= expiresAt ? { ok: false, error: "Request expired; prepare a new operation" }
          : await dispatch(message.tool, message.args);
        const reply = await fetch(`${base}/result`, { method: "POST", headers,
          body: JSON.stringify({ session, id: message.id, result }), signal: controller.signal });
        if (!reply.ok) throw new Error("Bridge rejected result; inspect model before retrying");
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), remote ? 1000 : 150);
    } catch (error) {
      if (!controller.signal.aborted) onState("error", error instanceof Error ? error.message : String(error));
      controller.abort();
    }
  };
  void poll();
  return () => { controller.abort(); if (timer) clearTimeout(timer); onState("disconnected"); };
}
