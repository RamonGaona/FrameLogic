import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("Model Space perspective-only safety workaround", () => {
  it("prevents UI, keyboard and legacy API callers from activating orthographic", () => {
    const core = read("../packages/bim/core/src/engine/createBimCore.ts");
    const start = core.indexOf("async function toggleCameraProjection()");
    const end = core.indexOf("// CAMERA FIT / RECOVERY", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const toggle = core.slice(start, end);
    const guard = 'if (getCameraProjectionMode() === "PERSPECTIVE")';
    expect(toggle).toContain(guard);
    expect(toggle).toContain('return "PERSPECTIVE";');
    // The only remaining actual toggle is for recovering an existing ortho camera.
    expect(toggle.indexOf(guard)).toBeLessThan(
      toggle.indexOf("await world.camera.projection.toggle();"),
    );
  });

  it("starts perspective and does not force orthographic on IFC import", () => {
    const precision = read("../packages/bim/core/src/engine/createFrameLogicBimCorePrecision.ts");
    expect(precision).toContain(
      'if (core.getCameraProjectionMode() === "ORTHOGRAPHIC")',
    );
    expect(precision).not.toContain('core.getCameraProjectionMode()\n    !== "ORTHOGRAPHIC"');
    expect(precision).not.toContain('core.getCameraProjectionMode()\n        !== "ORTHOGRAPHIC"');
    const viewport = read("../apps/web/src/features/bim/BimViewport.tsx");
    expect(viewport).toMatch(/useState<[\s\S]*?"PERSPECTIVE"\s*\| "ORTHOGRAPHIC"[\s\S]*?>\(\s*"PERSPECTIVE"/);
  });

  it("hides O/P in the 3D view cube and standalone piece editors", () => {
    const cube = read("../apps/web/src/features/bim/components/ViewCube.tsx");
    expect(cube).toContain("projectionToggleEnabled = false");
    expect(cube).toContain("{projectionToggleEnabled && (");
    const step = read("../apps/web/src/features/bim/step/StepPieceEditor.tsx");
    const direct = read("../apps/web/src/features/bim/step/StepPieceEditorDirect.tsx");
    expect(step).not.toContain('?"ORTO"');
    expect(direct).not.toContain('{projectionMode === "PERSPECTIVE" ? "ORTO" : "PERS"}');
  });

  it("keeps saved orthographic Model Space project snapshots from re-enabling it", () => {
    const nav = read("../packages/bim/core/src/navigationIndex.ts");
    const project = read("../packages/bim/core/src/project/ProjectCameraStateController.ts");
    expect(nav).toContain("allowOrthographic: false");
    expect(project).toContain('this.options.allowOrthographic === false');
    expect(project).toContain('targetProjection\n      === "ORTHOGRAPHIC"');
    // Do not remove orthographic calculations for the separate Drawing/PDF renderer.
    const drawing = read("../packages/bim/core/src/drawing/AssemblyViewShadingRenderer.ts");
    expect(drawing).toContain("new THREE.OrthographicCamera(");
  });
});
