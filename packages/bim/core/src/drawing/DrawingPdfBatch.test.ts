import { describe, expect, it } from "vitest";
import {
  buildDrawingPdfZip, buildMultiPageDrawingPdf, pdfExportFilename,
  pdfCanvasPlacement, pdfSheetDimensions,
} from "./DrawingPdfBatch";

const decoder = new TextDecoder("latin1");
describe("exportación de planos PDF por tamaño real", () => {
  it("uses ISO A0–A4 physical millimetres in landscape and portrait", () => {
    const known = {
      A0: [1189, 841], A1: [841, 594], A2: [594, 420],
      A3: [420, 297], A4: [297, 210],
    } as const;
    for (const size of ["A0", "A1", "A2", "A3", "A4"] as const) {
      for (const orientation of ["LANDSCAPE", "PORTRAIT"] as const) {
        const measured = pdfSheetDimensions(size, orientation);
        const [w, h] = known[size];
        expect(measured.widthMm).toBe(orientation === "LANDSCAPE" ? w : h);
        expect(measured.heightMm).toBe(orientation === "LANDSCAPE" ? h : w);
        expect(measured.widthPt * 25.4 / 72).toBeCloseTo(measured.widthMm, 10);
        expect(measured.heightPt * 25.4 / 72).toBeCloseTo(measured.heightMm, 10);
      }
    }
  });
  it("keeps printed geometry isotropic across A3 landscape and A4 portrait", () => {
    for (const [size, orientation] of [
      ["A3", "LANDSCAPE"], ["A4", "PORTRAIT"], ["A2", "PORTRAIT"],
    ] as const) {
      const page = pdfSheetDimensions(size, orientation);
      const placement = pdfCanvasPlacement(page.widthPt, page.heightPt);
      const physicalMm = 150; // 3000 model mm at 1:20
      const modelPixels = physicalMm * placement.canvasUnitsPerPaperMm;
      expect(modelPixels * placement.scalePtPerCanvasUnit * 25.4 / 72)
        .toBeCloseTo(physicalMm, 8);
      expect(placement.offsetXPt).toBeGreaterThanOrEqual(0);
      expect(placement.offsetYPt).toBeGreaterThanOrEqual(0);
    }
    const portrait = pdfSheetDimensions("A4", "PORTRAIT");
    const t = pdfCanvasPlacement(portrait.widthPt, portrait.heightPt);
    expect(t.offsetYPt).toBeGreaterThan(0);
    expect(t.offsetXPt).toBeCloseTo(0, 7);
    expect(() => pdfCanvasPlacement(0, 20)).toThrow();
  });
  it("builds one valid PDF with distinct MediaBoxes, two vector content streams and JPEG", () => {
    const a3 = pdfSheetDimensions("A3", "LANDSCAPE");
    const a4 = pdfSheetDimensions("A4", "PORTRAIT");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
    const result = buildMultiPageDrawingPdf([
      { width: a3.widthPt, height: a3.heightPt,
        stream: "q 0 0 m 25 25 l S /Im1 Do Q", images: [{ bytes: jpeg, width: 240, height: 120 }] },
      { width: a4.widthPt, height: a4.heightPt,
        stream: "BT /F1 12 Tf 25 25 Td (BOM) Tj ET", images: [] },
    ]);
    const text = decoder.decode(result);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("/MediaBox [0 0 " + Number(a3.widthPt.toFixed(3)));
    expect(text).toContain("/MediaBox [0 0 " + Number(a4.widthPt.toFixed(3)));
    expect(text).toContain("/Im1 6 0 R");
    expect(text).toContain("240 /Height 120");
    expect(text).toContain("BOM");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("xref\n0 9\n");
    const last = text.lastIndexOf("startxref\n");
    const offset = Number(text.slice(last + 10).split("\n")[0]);
    expect(text.slice(offset, offset + 4)).toBe("xref");
    expect(() => buildMultiPageDrawingPdf([])).toThrow();
  });
  it("creates a standards-readable ZIP containing separately named PDFs", () => {
    const fileA = new TextEncoder().encode("%PDF-1.4\nA3");
    const fileB = new TextEncoder().encode("%PDF-1.4\nA4");
    const zipped = buildDrawingPdfZip([
      { name: "001_Ensamble_A3_HORIZONTAL.pdf", bytes: fileA },
      { name: "002_Pieza_A4_VERTICAL.pdf", bytes: fileB },
    ]);
    const data = new DataView(zipped.buffer);
    expect(data.getUint32(0, true)).toBe(0x04034b50);
    expect(data.getUint16(8, true)).toBe(0);
    const last = zipped.length - 22;
    expect(data.getUint32(last, true)).toBe(0x06054b50);
    expect(data.getUint16(last + 10, true)).toBe(2);
    expect(decoder.decode(zipped)).toContain("Ensamble_A3_HORIZONTAL.pdf");
    expect(decoder.decode(zipped)).toContain("Pieza_A4_VERTICAL.pdf");
    const crcExample = buildDrawingPdfZip([
      { name: "crc.pdf", bytes: new TextEncoder().encode("123456789") },
    ]);
    expect(new DataView(crcExample.buffer).getUint32(14, true)).toBe(0xcbf43926);
    expect(() => buildDrawingPdfZip([])).toThrow();
    expect(() => buildDrawingPdfZip([
      { name: "x.pdf", bytes: fileA }, { name: "x.pdf", bytes: fileB },
    ])).toThrow();
  });
  it("generates collision-proof sortable filenames with size, orientation and revision", () => {
    const sheet = {
      titleBlock: { drawingNumber: "E-17 / Pórtico" },
      size: "A2", orientation: "PORTRAIT",
      revisions: [{ code: "B" }],
    };
    expect(pdfExportFilename(sheet, 0)).toBe("001_E-17_Portico_A2_VERTICAL_RB.pdf");
    expect(pdfExportFilename(sheet, 1)).toBe("002_E-17_Portico_A2_VERTICAL_RB.pdf");
  });
});
