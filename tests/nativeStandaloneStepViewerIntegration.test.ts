import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("Standalone native Three.js test route", () => {
  it("does not mount That Open CAD simultaneously with native WebGL", () => {
    const app = read("../apps/web/src/App.tsx");
    expect(app).toContain('get("threeNative") === "1"');
    expect(app).toContain("nativeViewer ? <NativeStepViewer /> : <BimViewport />");
    expect(app).toContain('import("./features/bim/native/NativeStepViewer")');
    expect(app).toContain('import("./features/bim/BimViewport")');
    expect(app).toContain("if (nativeViewer) return;");
  });

  it("can return to stable CAD and warns before leaving unsaved projects", () => {
    const cad = read("../apps/web/src/features/bim/BimViewport.tsx");
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    expect(cad).toContain('window.location.assign(`${window.location.pathname}?threeNative=1`)');
    expect(cad).toContain("Guarda primero tu proyecto .flproject");
    expect(native).toContain("Volver al visor actual");
    expect(native).toContain("window.location.assign(window.location.pathname)");
  });

  it("loads STEP with the existing OCCT adapter but owns one native renderer", () => {
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    expect(native).toContain("new THREE.WebGLRenderer({ antialias: true })");
    expect(native).toContain("new OcctStepGeometryAdapter()");
    expect(native).toContain('targetUnit: "millimeter"');
    expect(native).toContain("includeExactFeatures: false");
    expect(native).toContain("renderer.forceContextLoss()");
    expect(native).not.toContain("createBimCore(");
    expect(native).not.toContain("OrthoPerspectiveCamera");
    expect(native).not.toContain("mountExperimentalNativeThreePreview");
  });

  it("keeps perspective blocked and existing CAD drawings untouched", () => {
    const engine = read("../packages/bim/core/src/engine/createBimCore.ts");
    const drawing = read("../packages/bim/core/src/drawing/AssemblyViewShadingRenderer.ts");
    expect(engine).toContain('if (getCameraProjectionMode() === "ORTHOGRAPHIC")');
    expect(drawing).toContain("new THREE.OrthographicCamera(");
  });
});
