/**
 * Binary-safe standalone PDF package builder for FrameLogic Paper Space.
 *
 * Every page has its own MediaBox. This is essential for mixed A0–A4 and
 * portrait/landscape sets; no page is rasterized or silently rescaled.
 * Content streams contain the same vector geometry and shaded JPEG XObjects
 * used by the existing one-sheet export.
 */
export interface DrawingPdfPage {
  readonly width: number;  // PDF points
  readonly height: number; // PDF points
  readonly stream: string;
  readonly images: readonly {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
  }[];
}

export function pdfSheetDimensions(
  size: "A0" | "A1" | "A2" | "A3" | "A4",
  orientation: "LANDSCAPE" | "PORTRAIT",
): { widthMm: number; heightMm: number; widthPt: number; heightPt: number } {
  const dimensions = {
    A0: [1189, 841], A1: [841, 594], A2: [594, 420],
    A3: [420, 297], A4: [297, 210],
  } as const;
  const pair = dimensions[size];
  if (!pair) throw new Error("Tamaño de hoja PDF no válido.");
  const widthMm = orientation === "LANDSCAPE" ? pair[0] : pair[1];
  const heightMm = orientation === "LANDSCAPE" ? pair[1] : pair[0];
  return {
    widthMm, heightMm, widthPt: widthMm * 72 / 25.4,
    heightPt: heightMm * 72 / 25.4,
  };
}

export function buildMultiPageDrawingPdf(
  pages: readonly DrawingPdfPage[],
): Uint8Array<ArrayBuffer> {
  if (!pages.length) throw new Error("No hay hojas para exportar.");
  for (const page of pages) {
    if (![page.width, page.height].every((v) => Number.isFinite(v) && v > 0)
      || !page.images.every((image) => image.width > 0 && image.height > 0
        && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height))) {
      throw new Error("Dimensiones de PDF o imagen no válidas.");
    }
  }
  const encoder = new TextEncoder();
  const allocations: Array<{
    page: DrawingPdfPage; pageId: number; contentId: number; imageIds: number[];
  }> = [];
  let next = 5;
  for (const [index, page] of pages.entries()) {
    const pageId = index === 0 ? 3 : next++;
    const contentId = next++;
    const imageIds = page.images.map(() => next++);
    allocations.push({ page, pageId, contentId, imageIds });
  }
  const maxId = next - 1;
  const objects = new Map<number, Array<string | Uint8Array>>();
  const fmt = (v: number): string => Number(v.toFixed(3)).toString();
  objects.set(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  objects.set(2, ["<< /Type /Pages /Kids [",
    allocations.map((entry) => entry.pageId + " 0 R").join(" "),
    "] /Count ", String(allocations.length), " >>"]);
  objects.set(4, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]);
  for (const { page, pageId, contentId, imageIds } of allocations) {
    const xObjects = imageIds.map((id, index) => "/Im" + (index + 1)
      + " " + id + " 0 R").join(" ");
    objects.set(pageId, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ",
      fmt(page.width), " ", fmt(page.height),
      "] /Resources << /Font << /F1 4 0 R >> /XObject << ",
      xObjects, " >> >> /Contents ", contentId + " 0 R >>"]);
    const bytes = encoder.encode(page.stream);
    objects.set(contentId, ["<< /Length " + bytes.length + " >>\nstream\n",
      bytes, "\nendstream"]);
    page.images.forEach((image, index) => {
      objects.set(imageIds[index]!, [
        "<< /Type /XObject /Subtype /Image /Width " + image.width
          + " /Height " + image.height
          + " /ColorSpace /DeviceRGB /BitsPerComponent 8"
          + " /Filter /DCTDecode /Length " + image.bytes.length
          + " >>\nstream\n",
        image.bytes, "\nendstream",
      ]);
    });
  }
  const chunks: Uint8Array[] = [];
  const offsets = new Array<number>(maxId + 1).fill(0);
  let position = 0;
  const write = (value: string | Uint8Array): void => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    position += bytes.byteLength;
  };
  write("%PDF-1.4\n");
  for (let id = 1; id <= maxId; id++) {
    const parts = objects.get(id);
    if (!parts) throw new Error("Referencia de objeto PDF no resuelta: " + id);
    offsets[id] = position;
    write(id + " 0 obj\n");
    for (const part of parts) write(part);
    write("\nendobj\n");
  }
  const xref = position;
  write("xref\n0 " + (maxId + 1) + "\n0000000000 65535 f \n");
  for (let id = 1; id <= maxId; id++) {
    write(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
  }
  write("trailer\n<< /Size " + (maxId + 1)
    + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
  const output = new Uint8Array(position);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export interface DrawingZipFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}
const ZIP_ENCODER = new TextEncoder();
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let bit = 0; bit < 8; bit++) c = (c & 1)
    ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function concatByteChunks(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

/** ZIP STORE: no new dependency, no re-encoding of a PDF, UTF-8 names,
 * CRC-32 checked by standard ZIP readers. Each PDF stays a separate file.
 */
export function buildDrawingPdfZip(
  files: readonly DrawingZipFile[],
): Uint8Array<ArrayBuffer> {
  if (!files.length) throw new Error("No hay archivos PDF para guardar.");
  if (files.length > 65535) throw new Error("Demasiados archivos para un ZIP.");
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let position = 0;
  const names = new Set<string>();
  const append = (buffer: Uint8Array): void => { chunks.push(buffer); position += buffer.length; };
  for (const file of files) {
    const name = file.name.replace(/[\\/]+/g, "_");
    if (!name || !name.toLowerCase().endsWith(".pdf") || names.has(name)) {
      throw new Error("Nombre de PDF duplicado o no válido: " + name);
    }
    names.add(name);
    const nameBytes = ZIP_ENCODER.encode(name);
    const size = file.bytes.length;
    if (nameBytes.length > 65535 || size > 0xffffffff || position > 0xffffffff) {
      throw new Error("Archivo demasiado grande para ZIP tradicional.");
    }
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true); // STORE
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true);
    l.setUint32(22, size, true);
    l.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const localOffset = position;
    append(local);
    append(file.bytes);

    const directory = new Uint8Array(46 + nameBytes.length);
    const d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x0800, true);
    d.setUint16(10, 0, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, size, true);
    d.setUint32(24, size, true);
    d.setUint16(28, nameBytes.length, true);
    d.setUint32(42, localOffset, true);
    directory.set(nameBytes, 46);
    central.push(directory);
  }
  const directoryStart = position;
  for (const entry of central) append(entry);
  const directoryLength = position - directoryStart;
  if (position > 0xffffffff) throw new Error("ZIP excede el límite de 4 GB.");
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directoryLength, true);
  view.setUint32(16, directoryStart, true);
  append(eocd);
  return concatByteChunks(chunks);
}

/** Deterministic unique filenames, preserving size, orientation and page order. */
export function pdfExportFilename(
  sheet: { titleBlock: { drawingNumber: string }; size: string;
    orientation: string; revisions: readonly { code: string }[] },
  index: number,
): string {
  const cleaned = (sheet.titleBlock.drawingNumber || "PLANO")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 62) || "PLANO";
  const rev = (sheet.revisions.at(-1)?.code ?? "0").replace(/[^A-Za-z0-9_-]/g, "_");
  const orientation = sheet.orientation === "PORTRAIT" ? "VERTICAL" : "HORIZONTAL";
  return String(index + 1).padStart(3, "0") + "_" + cleaned + "_"
    + sheet.size + "_" + orientation + "_R" + rev + ".pdf";
}
