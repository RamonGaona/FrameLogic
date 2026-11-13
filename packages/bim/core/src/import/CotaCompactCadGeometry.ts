/**
 * Compact CAD reference packets, adapted from Cota's packed Web Worker transfer
 * architecture (Apache-2.0): services/web/src/core/io/meshTransfer.ts.
 *
 * Copyright 2026 Christian Orengia (Cota). Adapted by FrameLogic.
 * See docs/THIRD_PARTY_COTA.md.
 *
 * Each segment is stored as 6 Float64 coordinates, NOT 2 point objects plus
 * an editable CAD entity. No global 240k quota, no per-line UUIDs and no
 * giant JS object arrays. Rendering and on-demand SNAP use the buffers.
 */
import type { ImportedCadSegment } from "./CadDxfGeometryParser";

export const COTA_CAD_PACKET_SEGMENTS = 8192;

export interface CotaPackedCadPacket {
  readonly layer: string;
  readonly color: string;
  readonly positions: Float64Array;
}

export class CotaCompactCadGeometry {
  private readonly groups = new Map<string, {
    layer: string;
    color: string;
    positions: Float64Array;
    count: number;
  }>();
  private packets: CotaPackedCadPacket[] = [];
  private pointer = 0;
  private total = 0;
  private minX = Infinity; private minY = Infinity; private minZ = Infinity;
  private maxX = -Infinity; private maxY = -Infinity; private maxZ = -Infinity;

  get count(): number { return this.total; }
  get rawExtent(): number {
    return Number.isFinite(this.minX)
      ? Math.max(this.maxX - this.minX, this.maxY - this.minY, this.maxZ - this.minZ)
      : 0;
  }

  add = (segment: ImportedCadSegment): void => {
    const a = segment.start, b = segment.end;
    if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) return;
    const key = segment.layer.toLowerCase() + "\0" + segment.color.toLowerCase();
    let group = this.groups.get(key);
    if (!group) {
      group = {
        layer: segment.layer, color: segment.color,
        positions: new Float64Array(COTA_CAD_PACKET_SEGMENTS * 6), count: 0,
      };
      this.groups.set(key, group);
    }
    if (group.count === COTA_CAD_PACKET_SEGMENTS) {
      this.packets.push({ layer: group.layer, color: group.color, positions: group.positions });
      group.positions = new Float64Array(COTA_CAD_PACKET_SEGMENTS * 6);
      group.count = 0;
    }
    const off = group.count * 6;
    group.positions.set([a.x, a.y, a.z, b.x, b.y, b.z], off);
    group.count++;
    this.total++;
    this.minX = Math.min(this.minX, a.x, b.x);
    this.minY = Math.min(this.minY, a.y, b.y);
    this.minZ = Math.min(this.minZ, a.z, b.z);
    this.maxX = Math.max(this.maxX, a.x, b.x);
    this.maxY = Math.max(this.maxY, a.y, b.y);
    this.maxZ = Math.max(this.maxZ, a.z, b.z);
  };

  finish(): void {
    for (const group of this.groups.values()) {
      if (!group.count) continue;
      // Copy only the final partial packet: most large packets transfer zero-copy.
      this.packets.push({
        layer: group.layer, color: group.color,
        positions: group.positions.slice(0, group.count * 6),
      });
    }
    this.groups.clear();
  }

  take(): CotaPackedCadPacket | null {
    const result = this.packets[this.pointer];
    if (!result) return null;
    this.packets[this.pointer++] = null as unknown as CotaPackedCadPacket;
    if (this.pointer === this.packets.length) {
      this.packets = [];
      this.pointer = 0;
    }
    return result;
  }

  get remaining(): number { return this.packets.length - this.pointer; }
}
