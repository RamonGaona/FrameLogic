import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("Model Space orthographic-only safety workaround", () => {
  it("prevents UI, keyboard and legacy API callers from activating perspective", () => {
    const core = read("../packages/bim/core/src/engine/createBimCore.ts");
    const start = core.indexOf("async function toggleCameraProjection()");
    const end = core.indexOf("// CAMERA FIT / RECOVERY", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const toggle = core.slice(start, end);
    const guard = 'if (getCameraProjectionMode() === "ORTHOGRAPHIC")';
    expect(toggle).toContain(guard);
    expect(toggle).toContain('return "ORTHOGRAPHIC";');
    expect(toggle.indexOf(guard)).toBeLessThan(
      toggle.indexOf("await world.camera.projection.toggle();"),
    );
  });

  it("starts in orthographic and preserves it on IFC import", () => {
    const precision = read("../packages/bim/core/src/engine/createFrameLogicBimCorePrecision.ts");
    expect(precision).toContain(
      'if (core.getCameraProjectionMode() === "PERSPECTIVE")',
    );
    expect(precision).not.toContain('if (core.getCameraProjectionMode() === "ORTHOGRAPHIC")');
    const viewport = read("../apps/web/src/features/bim/BimViewport.tsx");
    expect(viewport).toMatch(/useState<[\s\S]*?"PERSPECTIVE"\s*\| "ORTHOGRAPHIC"[\s\S]*?>\(\s*"ORTHOGRAPHIC"/);
    const step = read("../apps/web/src/features/bim/step/StepPieceEditor.tsx");
    const direct = read("../apps/web/src/features/bim/step/StepPieceEditorDirect.tsx");
    expect(step).toContain('useState<CameraProjectionMode>(\n      "ORTHOGRAPHIC"');
    expect(direct).toContain('useState<CameraProjectionMode>(\n      "ORTHOGRAPHIC"');
  });

  it("hides the O/P projection toggle without hiding the other standard views", () => {
    const cube = read("../apps/web/src/features/bim/components/ViewCube.tsx");
    expect(cube).toContain("projectionToggleEnabled = false");
    expect(cube).toContain("{projectionToggleEnabled && (");
    expect(cube).toContain('onViewChange(\n                  "ISO"');
    const step = read("../apps/web/src/features/bim/step/StepPieceEditor.tsx");
    const direct = read("../apps/web/src/features/bim/step/StepPieceEditorDirect.tsx");
    expect(step).not.toContain('?"ORTO"');
    expect(direct).not.toContain('{projectionMode === "PERSPECTIVE" ? "ORTO" : "PERS"}');
  });

  it("restores old perspective snapshots in ortho without stale orthographic zoom", () => {
    const nav = read("../packages/bim/core/src/navigationIndex.ts");
    const project = read("../packages/bim/core/src/project/ProjectCameraStateController.ts");
    expect(nav).toContain("allowPerspective: false");
    expect(project).toContain('this.options.allowPerspective === false');
    expect(project).toContain('targetProjection === "ORTHOGRAPHIC"\n      && snapshot.projection === "ORTHOGRAPHIC"');
    // Drawing and PDF still need their own precise orthographic projection.
    const drawing = read("../packages/bim/core/src/drawing/AssemblyViewShadingRenderer.ts");
    expect(drawing).toContain("new THREE.OrthographicCamera(");
  });
});
