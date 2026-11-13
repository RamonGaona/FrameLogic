import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("Cota DWG/DXF integration stays connected", () => {
  it("uses the compact CAD reader through one public menu option", () => {
    const menu = source("../packages/bim/core/src/navigation/FileMenuController.ts");
    const importController = source("../packages/bim/core/src/import/CadReferenceImportController.ts");
    expect(menu).toContain('id: "open-cad"');
    expect(menu).not.toContain('id: "open-cad-cota"');
    expect(menu).not.toContain('id: "recover-cad"');
    expect(importController).toContain('this.cotaNextImport = true');
    expect(importController).toContain('engine: cotaMode ? "cota" : "framelogic"');
    expect(importController).toContain("registerPackedBatch");
  });
  it("worker packs geometries into transferable Float64 buffers with backpressure", () => {
    const worker = source("../packages/bim/core/src/import/CadReferenceImportWorker.ts");
    expect(worker).toContain('engine === "cota"');
    expect(worker).toContain("convertWithCotaCadReader");
    expect(worker).toContain("onSegment: compact.add");
    expect(worker).toContain("packet.positions.buffer");
    expect(worker).toContain('phase: "packed"');
  });
  it("preserves packed references across project save/restore, and avoids huge autosaves", () => {
    const project = source("../packages/bim/core/src/project/FrameLogicProjectPackageController.ts");
    const autosave = source("../packages/bim/core/src/project/ProjectAutosaveController.ts");
    expect(project).toContain("readonly cadPackedLines?");
    expect(project).toContain("dataBase64: encodeBase64");
    expect(project).toContain("registerPackedBatch({");
    expect(autosave).toContain("this.options.hasHugeCompactCad?.()");
  });
});
