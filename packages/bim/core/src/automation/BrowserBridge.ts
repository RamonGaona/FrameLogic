import { messageSchema } from "../../../../contracts/src/automation";
import { createOperationDispatcher } from "./dispatch";
import type { ModelOperations } from "./ModelOperations";

/** Explicit opt-in, loopback development bridge. No token persistence or production auto-connect. */
export function connectAutomationBridge(ops: ModelOperations, token: string,
  approve: (summary: unknown) => boolean | Promise<boolean>, base = "http://127.0.0.1:43185") {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Bridge must use IPv4 loopback");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Expected the 64-character bridge token");
  const controller = new AbortController();
  const dispatch = createOperationDispatcher(ops, approve);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const session = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const response = await fetch(`${base}/poll`, { method: "POST", headers,
        body: JSON.stringify({ session }), signal: controller.signal });
      if (!response.ok) throw new Error(`Bridge rejected connection (${response.status})`);
      const raw: unknown = await response.json();
      if (raw !== null) {
        const message = messageSchema.parse(raw);
        const result = await dispatch(message.tool, message.args);
        const reply = await fetch(`${base}/result`, { method: "POST", headers,
          body: JSON.stringify({ session, id: message.id, result }), signal: controller.signal });
        if (!reply.ok) throw new Error("Bridge rejected result; inspect model before retrying");
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 150);
    } catch (error) {
      if (!controller.signal.aborted) console.error("FrameLogic automation disconnected", error);
      controller.abort();
    }
  };
  void poll();
  return () => { controller.abort(); if (timer) clearTimeout(timer); };
}
