/**
 * Independent DWG decoder based on acad-ts (MIT) and Cota's streaming
 * DWG -> DXF strategy (Apache-2.0). Used only in recovery mode.
 * https://github.com/mxchristian17/cota
 */
export async function convertWithAlternateCadReader(buffer: ArrayBuffer): Promise<string> {
  const { DwgReader, DxfWriter, CadDictionary, Field, FieldList, DimensionArc, Insert } =
    await import("@node-projects/acad-ts");
  const doc = DwgReader.readFromStream(buffer, null);

  // Fix orphan nested fields before DXF serialization (adapted from Cota).
  const seen = new Set<object>();
  type Node = { owner?: unknown; xDictionary?: unknown } | null | undefined;
  const adopt = (value: Node, parent: unknown): void => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
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
      if (entity instanceof DimensionArc && entity.block) {
        const insert = new Insert(entity.block);
        insert.layer = entity.layer;
        insert.color = entity.color;
        record.entities.add(insert);
        record.entities.remove(entity);
      }
    }
  }

  // Growing UTF-8 output avoids massive string fragmentation on large DWGs.
  let output = new Uint8Array(4 * 1024 * 1024);
  let length = 0;
  const encoder = new TextEncoder();
  const sink = {
    write(chunk: string): void {
      if (length + chunk.length * 3 > output.length) {
        const next = new Uint8Array(Math.max(output.length * 2, length + chunk.length * 3));
        next.set(output.subarray(0, length));
        output = next;
      }
      length += encoder.encodeInto(chunk, output.subarray(length)).written;
    },
    flush(): void {},
    close(): void {},
  };
  DxfWriter.writeToStream(sink as Parameters<typeof DxfWriter.writeToStream>[0], doc, false);
  return new TextDecoder().decode(output.subarray(0, length));
}
