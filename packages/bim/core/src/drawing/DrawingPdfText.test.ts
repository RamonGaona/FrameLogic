import { describe, expect, it } from "vitest";
import { pdfSafeTechnicalText } from "./DrawingPdfText";
describe("technical labels in PDF without embedded Unicode fonts", () => {
  it("keeps repeated hole counts and diameters legible", () => {
    expect(pdfSafeTechnicalText("4× Ø10")).toBe("4x DIA 10");
    expect(pdfSafeTechnicalText("2× ⌀12,5")).toBe("2x DIA 12,5");
  });
  it("preserves ordinary measurement and translates degrees", () => {
    expect(pdfSafeTechnicalText("Ángulo 90°")).toBe("Angulo 90deg");
    expect(pdfSafeTechnicalText("1500 mm")).toBe("1500 mm");
  });
});
