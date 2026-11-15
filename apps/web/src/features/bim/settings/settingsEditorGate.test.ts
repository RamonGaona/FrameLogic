import { describe, expect, it } from "vitest";
import { mayUnlockSettings } from "./settingsEditorGate";

describe("temporary global settings editor lock", () => {
  it("is unlocked only by accepting with both user and password empty", () => {
    expect(mayUnlockSettings("", "")).toBe(true);
    expect(mayUnlockSettings("admin", "")).toBe(false);
    expect(mayUnlockSettings("", "secret")).toBe(false);
    expect(mayUnlockSettings(" ", "")).toBe(false);
    expect(mayUnlockSettings("", " ")).toBe(false);
  });
});
