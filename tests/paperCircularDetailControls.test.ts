import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Paper Space circular detail toolbar and mouse interaction", () => {
  it("exposes exactly the contextual button, not the duplicate professional Detail action", () => {
    const professional = source("../packages/bim/core/src/drawing/DrawingProfessionalController.ts");
    const general = source("../packages/bim/core/src/drawing/GeneralPdfController.ts");
    expect(professional).not.toContain('this.makeButton("Detalle", "Crear detalle desde dos puntos")');
    expect(general).toContain('detail.dataset["framelogicCircularDetail"] = "true"');
  });
  it("renders all four radial controls while retaining ring MOVE and invalid-drag rollback", () => {
    const general = source("../packages/bim/core/src/drawing/GeneralPdfController.ts");
    expect(general).toContain("for (const grip of circularDetailRadiusGrips(");
    expect(general).toContain('handle.dataset["framelogicDetailGrip"] = grip.direction');
    expect(general).toContain('handle.dataset["framelogicDetailDrag"] = "RADIUS"');
    expect(general).toContain('ring.dataset["framelogicDetailDrag"] = "MOVE"');
    expect(general).toContain("if (!detail.segments.length || outside)");
    expect(general).toContain("detail.circularDetail.radius = drag.original.radius");
  });
});
