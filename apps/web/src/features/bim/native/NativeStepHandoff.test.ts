import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isNativeStepFile,
  openNativeStepWorkspace,
  receiveNativeStepHandoff,
  isNativeStepHandoffRequest,
  isNativeStepHandoffResponse,
  NATIVE_STEP_HANDOFF_CHANNEL,
  NATIVE_STEP_HANDOFF_TIMEOUT_MS,
} from "./NativeStepHandoff";

const step = (name = "frame.step", size = 100) => ({
  name,
  size,
  arrayBuffer: async () => new ArrayBuffer(size),
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("same-origin Model Space to native Three.js STEP handoff", () => {
  it("accepts only plausible STEP files within the bounded local handoff size", () => {
    expect(isNativeStepFile(step())).toBe(true);
    expect(isNativeStepFile(step("base.STP"))).toBe(true);
    expect(isNativeStepFile(step("wrong.ifc"))).toBe(false);
    expect(isNativeStepFile(step("frame.step", 0))).toBe(false);
    expect(isNativeStepFile(step("frame.step", 257 * 1024 * 1024))).toBe(false);
    expect(isNativeStepFile({ name: "frame.step", size: 100 })).toBe(false);
    expect(isNativeStepFile(null)).toBe(false);
  });

  it("validates an unpredictable one-time ticket for both protocol directions", () => {
    const ticket = "a-random-session-ticket";
    expect(isNativeStepHandoffRequest({ type: "STEP_NATIVE_REQUEST", ticket }, ticket)).toBe(true);
    expect(isNativeStepHandoffRequest({ type: "STEP_NATIVE_REQUEST", ticket: "other" }, ticket)).toBe(false);
    expect(isNativeStepHandoffRequest({ type: "STEP_NATIVE_RESPONSE", ticket }, ticket)).toBe(false);
    expect(isNativeStepHandoffRequest({ type: "STEP_NATIVE_REQUEST", ticket }, "")).toBe(false);
    expect(isNativeStepHandoffResponse({
      type: "STEP_NATIVE_RESPONSE", ticket, file: step(),
    }, ticket)).toBe(true);
    expect(isNativeStepHandoffResponse({
      type: "STEP_NATIVE_RESPONSE", ticket: "other", file: step(),
    }, ticket)).toBe(false);
    expect(isNativeStepHandoffResponse({
      type: "STEP_NATIVE_RESPONSE", ticket, file: step("bad.dwg"),
    }, ticket)).toBe(false);
    expect(isNativeStepHandoffResponse(null, ticket)).toBe(false);
  });

  it("transfers the actual File between simulated tabs without uploading or navigating CAD", () => {
    class LocalChannel {
      static instances: LocalChannel[] = [];
      onmessage: ((event: { data: unknown }) => void) | null = null;
      closed = false;
      readonly name: string;
      constructor(name: string) {
        this.name = name;
        LocalChannel.instances.push(this);
      }
      postMessage(data: unknown) {
        for (const receiver of LocalChannel.instances) {
          if (receiver !== this && !receiver.closed && receiver.name === this.name) {
            receiver.onmessage?.({ data });
          }
        }
      }
      close() { this.closed = true; }
    }
    const opened = { opener: {} as object | null };
    const open = vi.fn(() => opened);
    vi.stubGlobal("BroadcastChannel", LocalChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "ticket-from-secure-crypto" });
    vi.stubGlobal("window", {
      location: { href: "https://framelogic-dev.pages.dev/?oldQuery=1" },
      open, setTimeout, clearTimeout,
    });
    const source = step("profile.step", 512) as unknown as File;
    const result = openNativeStepWorkspace(source);
    expect(result).toEqual({ opened: true, handoffAvailable: true });
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target] = open.mock.calls[0] as unknown as [string, string];
    expect(target).toBe("_blank");
    expect(new URL(url).searchParams.get("threeNative")).toBe("1");
    expect(new URL(url).searchParams.get("handoff")).toBe("ticket-from-secure-crypto");
    expect(opened.opener).toBeNull();

    let received: File | null = null;
    const timeout = vi.fn();
    const cleanup = receiveNativeStepHandoff(
      "ticket-from-secure-crypto", (f) => { received = f; }, timeout,
    );
    expect(received).toBe(source);
    expect(timeout).not.toHaveBeenCalled();
    expect(LocalChannel.instances.every((ch) => ch.closed)).toBe(true);
    cleanup();
  });

  it("has a bounded one-shot channel and does not depend on persistent storage", () => {
    expect(NATIVE_STEP_HANDOFF_CHANNEL).toBe("framelogic.step-native-handoff.v1");
    expect(NATIVE_STEP_HANDOFF_TIMEOUT_MS).toBe(20_000);
  });
});
