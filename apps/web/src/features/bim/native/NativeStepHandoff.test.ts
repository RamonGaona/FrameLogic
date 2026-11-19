import { describe, expect, it } from "vitest";

import {
  isNativeStepFile,
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

  it("has a bounded one-shot channel and does not depend on persistent storage", () => {
    expect(NATIVE_STEP_HANDOFF_CHANNEL).toBe("framelogic.step-native-handoff.v1");
    expect(NATIVE_STEP_HANDOFF_TIMEOUT_MS).toBe(20_000);
  });
});
