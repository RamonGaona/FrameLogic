import { describe, expect, it } from "vitest";
import { shouldSyncLegacyDrawingSelect } from "./DrawingExperienceController";

describe("Unified PDF dropdown ownership", () => {
  it("does not let the legacy section timer replace the unified PDF options", () => {
    const select = { dataset: { framelogicUnifiedPdf: "GENERAL_PDF" } };
    expect(shouldSyncLegacyDrawingSelect(select as unknown as HTMLSelectElement)).toBe(false);
  });
  it("still refreshes genuine legacy section dropdowns", () => {
    const select = { dataset: {} };
    expect(shouldSyncLegacyDrawingSelect(select as unknown as HTMLSelectElement)).toBe(true);
  });
});
