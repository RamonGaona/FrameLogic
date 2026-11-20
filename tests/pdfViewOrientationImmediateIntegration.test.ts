import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { resolveAssemblyViewBasis } from "../packages/bim/core/src/drawing/AssemblyViewOrientationControls";

const source = readFileSync(
  new URL("../packages/bim/core/src/drawing/GeneralPdfController.ts", import.meta.url),
  "utf8",
);
const handler = source.slice(
  source.indexOf("  private async changeSelectedPdfViewOrientation("),
  source.indexOf("  private renderGeneralViews(): void {"),
);

describe("Paper Space selected View orientation", () => {
  it("projects the selected direction immediately before asynchronous STEP/HLR", () => {
    const previewIndex = handler.indexOf("const preview = this.buildPlanGeometry(view.instanceIds, plane);");
    const drawIndex = handler.indexOf("this.workspace.render();", previewIndex);
    const exactIndex = handler.indexOf("const projection = await projectAssembly(", previewIndex);
    expect(previewIndex).toBeGreaterThan(0);
    expect(drawIndex).toBeGreaterThan(previewIndex);
    expect(exactIndex).toBeGreaterThan(drawIndex);
    expect(handler).toContain("view.workPlane = snapshotWorkPlane(plane);");
    expect(handler).toContain("view.orientationMode = orientationMode;");
    expect(handler).toContain("view.orientationLabel = this.orientationModeLabel(orientationMode);");
  });

  it("keeps exact failure as a warning when a mesh preview is available", () => {
    expect(handler).toContain("if (!preview) throw error;");
    expect(handler).toContain("const geometry = projection ?? preview;");
    expect(handler).toContain("exactFailure");
    expect(handler).toContain("this.getActiveSheetId() !== sheetId");
  });

  it("preserves old orientation's dimension edits and does not change instance transforms", () => {
    expect(handler).toContain("const previousDimensionState = {");
    expect(handler).toContain("previousDimensionState, orientationMode,");
    expect(handler).not.toContain("registerPieceInstance(");
    expect(handler).not.toContain("setInstanceTransform(");
    const points = [-6, 6].flatMap(x => [-0.2, 0.2].map(y => ({ x, y, z: 0 })));
    const original = JSON.stringify(points);
    const front = resolveAssemblyViewBasis("LONGITUDINAL", points);
    const top = resolveAssemblyViewBasis("LOCAL_TOP", points);
    const end = resolveAssemblyViewBasis("LOCAL_END", points);
    expect(front?.normal).not.toEqual(top?.normal);
    expect(front?.normal).not.toEqual(end?.normal);
    expect(JSON.stringify(points)).toBe(original);
  });
});
