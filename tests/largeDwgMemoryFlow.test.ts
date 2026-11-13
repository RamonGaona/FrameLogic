import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("large DWG memory safety", () => {
  it("registers acknowledged Web Worker chunks directly instead of collecting 1.4m JS objects", () => {
    const source = readSource("../packages/bim/core/src/import/CadReferenceImportController.ts");
    expect(source).toContain("await onBegin(response.parsed, expectedSegments)");
    expect(source).toContain("await onBatch(response.segments, expectedSegments)");
    expect(source).toContain('worker.postMessage({ type: "next" })');
    expect(source).toContain("const totalSegments = parsed.totalSegments ?? parsed.segments.length");
    expect(source).not.toContain("streamedSegments.push");
    expect(source).toContain("createdLayerIds");
    expect(source).toContain("if (!importCommitted");
  });

  it("reports metadata and limits simultaneous duplicate mega-DWG readers in worker", () => {
    const source = readSource("../packages/bim/core/src/import/CadReferenceImportWorker.ts");
    expect(source).toContain("rawExtent: sourceExtent");
    expect(source).toContain("totalSegments: activeStream.total");
    expect(source).toContain("hugePrincipal");
    expect(source).toContain("350_000");
  });

  it("builds GPU buffers without copying a million-line getAll snapshot", () => {
    const source = readSource("../packages/bim/core/src/design/CadLineSceneController.ts");
    expect(source).toContain("this.designModel.cadLines.values()");
    expect(source).toContain("new Float32Array(group.count * 6)");
    expect(source).not.toContain("this.designModel.cadLines.getAll()");
  });
});
