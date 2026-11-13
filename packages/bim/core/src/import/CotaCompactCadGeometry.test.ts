import { describe, expect, it } from "vitest";
import { CotaCompactCadGeometry, COTA_CAD_PACKET_SEGMENTS } from "./CotaCompactCadGeometry";
import { convertWithCotaCadReader, isBinaryDxf } from "./CotaCadReader";
import { parseCadDxf } from "./CadDxfGeometryParser";

describe("Cota CAD compact reader and packed geometry", () => {
  it("reads ASCII DXF and detects binary DXF signature without false matches", async () => {
    const text = "0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n3000\n21\n0\n0\nENDSEC\n0\nEOF\n";
    expect(await convertWithCotaCadReader(new TextEncoder().encode(text).buffer, "dxf")).toBe(text);
    expect(isBinaryDxf(new TextEncoder().encode("AutoCAD Binary DXF\r\n"))).toBe(true);
    expect(isBinaryDxf(new TextEncoder().encode(text))).toBe(false);
    const compact = new CotaCompactCadGeometry();
    const parsed = parseCadDxf(text, { unlimitedSegments: true, onSegment: compact.add });
    compact.finish();
    expect(parsed.segments).toHaveLength(0);
    expect(parsed.totalSegments).toBe(1);
    expect(compact.count).toBe(1);
    expect(compact.rawExtent).toBe(3000);
    const packet = compact.take()!;
    expect(Array.from(packet.positions)).toEqual([0, 0, 0, 3000, 0, 0]);
    expect(compact.take()).toBeNull();
  });

  it("streams 250,001 lines using only compact typed packets, never allocating a per-line registry", () => {
    const compact = new CotaCompactCadGeometry();
    for (let i = 0; i < 250_001; i++) {
      compact.add({
        layer: i % 2 ? "TUBOS" : "DIAGONALES", color: "#ffffff",
        start: { x: i, y: 0, z: 0 }, end: { x: i + 3, y: 5, z: 0 },
      });
    }
    compact.finish();
    expect(compact.count).toBe(250_001);
    expect(compact.rawExtent).toBe(250_003);
    let count = 0, batches = 0;
    for (let p = compact.take(); p; p = compact.take()) {
      expect(p.positions).toBeInstanceOf(Float64Array);
      expect(p.positions.length / 6).toBeLessThanOrEqual(COTA_CAD_PACKET_SEGMENTS);
      count += p.positions.length / 6;
      batches++;
    }
    expect(count).toBe(250_001);
    expect(batches).toBeGreaterThan(30);
    expect(compact.remaining).toBe(0);
  });
});
