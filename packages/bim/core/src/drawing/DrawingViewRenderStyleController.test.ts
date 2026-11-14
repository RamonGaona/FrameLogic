import { describe, expect, it } from "vitest";
import {
  buildPdf,
  isRenderMode,
  restoreDrawingViewModes,
  resolveDrawingViewRenderMode,
} from "./DrawingViewRenderStyleController";

describe("Independent drawing View render state", () => {
  it("restores two View modes without overwriting either", () => {
    const modes = restoreDrawingViewModes([
      { viewId: "assembly-front", mode: "BLACK_WHITE" },
      { viewId: "assembly-iso", mode: "SOLID_EDGES" },
      { viewId: "assembly-plan", mode: "VISIBLE_HIDDEN" },
      { viewId: "invalid", mode: "made-up" },
    ]);
    expect(modes.size).toBe(3);
    expect(modes.get("assembly-front")).toBe("BLACK_WHITE");
    expect(modes.get("assembly-iso")).toBe("SOLID_EDGES");
    expect(modes.get("assembly-plan")).toBe("VISIBLE_HIDDEN");
    expect(modes.has("invalid")).toBe(false);
    modes.set("assembly-front", "MONOCHROME");
    expect(modes.get("assembly-iso")).toBe("SOLID_EDGES");
  });

  it("round-trips independent View styles through DrawingProduction sheet JSON", () => {
    const sheet = {
      ownerSectionId: "assembly", views: [
        { id: "front", sectionId: "a", renderMode: "BLACK_WHITE" },
        { id: "iso", sectionId: "b", renderMode: "SOLID_EDGES" },
        { id: "plan", sectionId: "c", renderMode: "VISIBLE_HIDDEN" },
      ],
    };
    const restored = JSON.parse(JSON.stringify(sheet)) as typeof sheet;
    const legacy = restoreDrawingViewModes([{ viewId: "iso", mode: "MONOCHROME" }]);
    expect(restored.views.map((v) => resolveDrawingViewRenderMode(v, legacy)))
      .toEqual(["BLACK_WHITE", "SOLID_EDGES", "VISIBLE_HIDDEN"]);
    // Migrated projects with only professional styles retain that setting.
    expect(resolveDrawingViewRenderMode({ id: "iso" }, legacy)).toBe("MONOCHROME");
  });

  it("accepts supported modes while rejecting unknown modes", () => {
    for (const mode of ["BLACK_WHITE", "VISIBLE_HIDDEN", "WIREFRAME",
      "SOLID", "SOLID_EDGES", "MONOCHROME", "TRANSPARENT"]) {
      expect(isRenderMode(mode)).toBe(true);
    }
    expect(isRenderMode("BOGUS")).toBe(false);
  });
});

describe("PDF shaded raster and vector page", () => {
  it("embeds a binary JPEG XObject with exact cross-reference offsets", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]);
    const bytes = buildPdf(400, 300, "q\n/Im1 Do\nQ", [
      { bytes: jpeg, width: 300, height: 200 },
    ]);
    const value = new TextDecoder("latin1").decode(bytes);
    expect(value).toContain("/XObject << /Im1 6 0 R >>");
    expect(value).toContain("/Subtype /Image /Width 300 /Height 200");
    expect(value).toContain("/Filter /DCTDecode /Length 8");
    expect(value).toContain("q\n/Im1 Do\nQ");
    expect(value).toContain("xref\n0 7\n");
    expect(value).toMatch(/startxref\n\d+\n%%EOF$/);

    const xrefOffset = Number(value.match(/startxref\n(\d+)/)?.[1]);
    expect(value.slice(xrefOffset, xrefOffset + 4)).toBe("xref");
    const entries = value.slice(xrefOffset).split("\n").slice(3, 9);
    for (let objectId = 1; objectId <= 6; objectId++) {
      const offset = Number(entries[objectId - 1]?.slice(0, 10));
      expect(value.slice(offset, offset + 7)).toBe(objectId + " 0 obj");
    }
  });

  it("retains the vector-only PDF path without any XObjects", () => {
    const value = new TextDecoder().decode(buildPdf(100, 100, "q\n0 0 m 1 1 l S\nQ"));
    expect(value).toContain("xref\n0 6\n");
    expect(value).toContain("/Length 17");
    expect(value).not.toContain("/Subtype /Image");
  });
});
