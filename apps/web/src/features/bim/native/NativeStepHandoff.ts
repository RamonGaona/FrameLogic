/**
 * Transfer a user-selected STEP File from Model Space to a separately hosted
 * native Three.js tab, without uploading bytes or retaining them in storage.
 *
 * The handoff is intentionally one-shot and session-local. It is NOT a CAD
 * project serialization or a way to apply visual edits back to Model Space.
 */
export const NATIVE_STEP_HANDOFF_CHANNEL = "framelogic.step-native-handoff.v1";
export const NATIVE_STEP_HANDOFF_TIMEOUT_MS = 20_000;
const MAX_STEP_HANDOFF_BYTES = 256 * 1024 * 1024;

export interface NativeStepHandoffRequest {
  readonly type: "STEP_NATIVE_REQUEST";
  readonly ticket: string;
}

export interface NativeStepHandoffResponse {
  readonly type: "STEP_NATIVE_RESPONSE";
  readonly ticket: string;
  readonly file: File;
}

export function isNativeStepFile(value: unknown): value is File {
  if (!value || typeof value !== "object") return false;
  const file = value as { name?: unknown; size?: unknown; arrayBuffer?: unknown };
  return typeof file.name === "string"
    && /\.(step|stp)$/i.test(file.name)
    && typeof file.size === "number" && Number.isFinite(file.size)
    && file.size > 0 && file.size <= MAX_STEP_HANDOFF_BYTES
    && typeof file.arrayBuffer === "function";
}

export function isNativeStepHandoffRequest(
  value: unknown, ticket: string,
): value is NativeStepHandoffRequest {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<NativeStepHandoffRequest>;
  return ticket.length > 0 && data.type === "STEP_NATIVE_REQUEST"
    && data.ticket === ticket;
}

export function isNativeStepHandoffResponse(
  value: unknown, ticket: string,
): value is NativeStepHandoffResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<NativeStepHandoffResponse>;
  return ticket.length > 0 && data.type === "STEP_NATIVE_RESPONSE"
    && data.ticket === ticket && isNativeStepFile(data.file);
}

/**
 * Must be called by a direct user click: opens a separate tab, keeps the full
 * CAD workspace mounted, and optionally sends the last imported STEP once.
 */
export function openNativeStepWorkspace(file: File | null): {
  opened: boolean;
  handoffAvailable: boolean;
} {
  const eligible = isNativeStepFile(file);
  const supported = typeof BroadcastChannel !== "undefined"
    && typeof crypto !== "undefined"
    && typeof crypto.randomUUID === "function";
  const ticket = eligible && supported ? crypto.randomUUID() : null;
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("threeNative", "1");
  if (ticket) url.searchParams.set("handoff", ticket);
  url.hash = "";

  let channel: BroadcastChannel | null = null;
  let closeTimer: number | undefined;
  if (ticket && file) {
    channel = new BroadcastChannel(NATIVE_STEP_HANDOFF_CHANNEL);
    const sender = channel;
    const cleanup = () => {
      window.clearTimeout(closeTimer);
      sender.close();
    };
    closeTimer = window.setTimeout(cleanup, NATIVE_STEP_HANDOFF_TIMEOUT_MS);
    sender.onmessage = (event: MessageEvent<unknown>) => {
      if (!isNativeStepHandoffRequest(event.data, ticket)) return;
      try {
        sender.postMessage({
          type: "STEP_NATIVE_RESPONSE",
          ticket,
          file,
        } satisfies NativeStepHandoffResponse);
      } catch (error) {
        console.warn("Transferencia local STEP al visor Three.js no disponible:", error);
      } finally {
        cleanup();
      }
    };
  }

  // No "noopener" here: a popup can return null when opened with that feature
  // even if the browser created a tab. Immediately sever the opener reference.
  const tab = window.open(url.toString(), "_blank");
  if (!tab) {
    if (channel) {
      window.clearTimeout(closeTimer);
      channel.close();
    }
    return { opened: false, handoffAvailable: false };
  }
  try { tab.opener = null; } catch { /* Some browsers deny this property. */ }
  return { opened: true, handoffAvailable: Boolean(ticket) };
}

/** Receives a one-time file only from the matching same-origin handoff ticket. */
export function receiveNativeStepHandoff(
  ticket: string,
  onFile: (file: File) => void,
  onTimeout: () => void,
): () => void {
  if (!ticket || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(NATIVE_STEP_HANDOFF_CHANNEL);
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    channel.close();
  };
  const timer = window.setTimeout(() => {
    cleanup();
    onTimeout();
  }, NATIVE_STEP_HANDOFF_TIMEOUT_MS);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isNativeStepHandoffResponse(event.data, ticket) || closed) return;
    cleanup();
    onFile(event.data.file);
  };
  channel.postMessage({
    type: "STEP_NATIVE_REQUEST",
    ticket,
  } satisfies NativeStepHandoffRequest);
  return cleanup;
}
