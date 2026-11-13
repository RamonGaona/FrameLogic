/**
 * Cota-compatible CAD conversion entry point (DWG and ASCII/binary DXF).
 *
 * Adapted from Cota, Copyright 2026 Christian Orengia,
 * Apache-2.0; see github.com/mxchristian17/cota and
 * docs/THIRD_PARTY_COTA.md.
 *
 * Reuses Cota's acad-ts read/repair/write architecture instead of the
 * dwgdxf WASM intermediate. Geometry is interpreted by FrameLogic's
 * own parser afterward, so the full Cota editor is NOT bundled.
 */
export type CotaCadFormat = "dwg" | "dxf";

export function isBinaryDxf(data: Uint8Array): boolean {
  return data.length > 18
    && new TextDecoder("latin1").decode(data.subarray(0, 18)) === "AutoCAD Binary DXF";
}

export async function convertWithCotaCadReader(
  buffer: ArrayBuffer, format: CotaCadFormat,
): Promise<string> {
  const header = new Uint8Array(buffer);
  if (format === "dxf" && !isBinaryDxf(header))
    return new TextDecoder().decode(buffer);

  const {
    DwgReader, DxfReader, DxfWriter, CadDictionary, Field, FieldList,
    DimensionArc, Insert, MultiLeader, Polyline3D, MText, Solid, XYZ,
  } = await import("@node-projects/acad-ts");
  const doc = format === "dwg"
    ? DwgReader.readFromStream(buffer, null)
    : DxfReader.readFromStream(new Uint8Array(buffer));

  // Cota adopts orphaned FIELDs before serializing. Some nested attributes
  // otherwise make the entire DXF writer fail.
  type Node = { owner?: unknown; xDictionary?: unknown } | null | undefined;
  const visited = new Set<object>();
  const adopt = (value: Node, parent: unknown): void => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (value.owner == null && parent) value.owner = parent;
    adopt(value.xDictionary as Node, value);
    if (value instanceof CadDictionary)
      for (const entry of value) adopt(entry as Node, value);
    if (value instanceof Field)
      for (const child of value.children ?? []) adopt(child as Node, value);
    if (value instanceof FieldList)
      for (const child of value.fields ?? []) adopt(child as Node, value);
  };
  adopt(doc.rootDictionary as Node, null);
  for (const record of doc.blockRecords ?? []) {
    adopt(record as Node, null);
    for (const entity of [...record.entities]) {
      adopt(entity as Node, record);
      const replacements: typeof entity[] = [];
      if (entity instanceof DimensionArc && entity.block) {
        replacements.push(new Insert(entity.block));
      } else if (entity instanceof MultiLeader && entity.contextData) {
        const ctx = entity.contextData;
        for (const root of ctx.leaderRoots ?? [])
          for (const leader of root.lines ?? []) {
            const points = [...(leader.points ?? []), root.connectionPoint].filter(Boolean);
            if (points.length >= 2) replacements.push(new Polyline3D(points));
          }
        if (ctx.hasTextContents && ctx.textLabel?.trim()) {
          const label = new MText(ctx.textLabel);
          label.insertPoint = ctx.textLocation;
          label.height = ctx.textHeight || 2.5;
          replacements.push(label);
        }
      }
      if (!replacements.length) continue;
      for (const replacement of replacements) {
        replacement.layer = entity.layer;
        replacement.color = entity.color;
        replacement.lineType = entity.lineType;
        replacement.lineTypeScale = entity.lineTypeScale;
        replacement.lineWeight = entity.lineWeight;
        record.entities.add(replacement);
      }
      record.entities.remove(entity);
    }
  }

  // Writer generates many tiny strings for a large CAD document; Cota avoids
  // joining them into a giant fragmented string, encoding directly to UTF-8.
  const encoder = new TextEncoder();
  let output = new Uint8Array(4 * 1024 * 1024);
  let size = 0;
  const sink = {
    write(part: string): void {
      if (size + part.length * 3 > output.length) {
        const grown = new Uint8Array(Math.max(output.length * 2, size + part.length * 3));
        grown.set(output.subarray(0, size));
        output = grown;
      }
      size += encoder.encodeInto(part, output.subarray(size)).written;
    },
    flush(): void {}, close(): void {},
  };
  DxfWriter.writeToStream(sink as Parameters<typeof DxfWriter.writeToStream>[0], doc, false);
  return new TextDecoder().decode(output.subarray(0, size));
}
