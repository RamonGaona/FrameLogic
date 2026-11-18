import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coreSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("POINT in the isolated piece editor", () => {
  it("shows a button that creates POINT distinct from converting a CAD point to SNAP", () => {
    const workspace = coreSource("../packages/bim/core/src/interaction/PieceFrameLogicWorkspaceController.ts");
    const runtime = coreSource("../packages/bim/core/src/engine/createFrameLogicBimCorePrecision.ts");
    expect(workspace).toContain('"Crear punto (P)"');
    expect(workspace).toContain('"Punto → SNAP"');
    expect(workspace).toContain("const started = this.actions.startPoint()");
    expect(workspace).toContain("readonly startPoint: () => boolean");
    expect(runtime).toContain("startPoint: () => core.startPointCommand()");
  });
  it("does not intercept T for TRIM while typing PUNTO into the text command HUD", () => {
    const trim = coreSource("../packages/bim/core/src/interaction/CadTrimController.ts");
    const input = coreSource("../packages/bim/core/src/interaction/CadCommandInputController.ts");
    expect(trim).toContain("__frameLogicTextCommandInputActive?.()");
    expect(input).toContain('command === "P" || command === "PU" || command === "PUN"');
  });
});
