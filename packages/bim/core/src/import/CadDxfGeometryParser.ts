import * as THREE from "three";

interface DxfPair { readonly code: number; readonly value: string }
interface DxfRecord { readonly type: string; readonly pairs: readonly DxfPair[] }
export interface CadDxfPoint3 { readonly x: number; readonly y: number; readonly z: number }
export interface ImportedCadSegment {
  readonly layer: string;
  readonly color: string;
  readonly start: CadDxfPoint3;
  readonly end: CadDxfPoint3;
}
export interface ImportedCadText {
  readonly layer: string;
  readonly color: string;
  readonly kind: "TEXT" | "MTEXT" | "ATTRIB" | "ATTDEF";
  readonly text: string;
  readonly position: CadDxfPoint3;
  /** Endpoints of one-height local text axes, already in world coordinates. */
  readonly axisX: CadDxfPoint3;
  readonly axisY: CadDxfPoint3;
  readonly horizontalAlign: "left" | "center" | "right";
  readonly verticalAlign: "baseline" | "middle" | "top";
}

export interface ImportedCadPoint {
  readonly layer: string;
  readonly color: string;
  readonly point: CadDxfPoint3;
}
export interface DxfLayerAppearance { readonly color: string; readonly visible: boolean }
export interface ParsedCadReference {
  readonly segments: readonly ImportedCadSegment[];
  readonly points: readonly ImportedCadPoint[];
  readonly texts: readonly ImportedCadText[];
  readonly insUnits: number;
  readonly skippedEntities: number;
  readonly skippedTypes: ReadonlyMap<string, number>;
  readonly expandedBlocks: number;
  readonly truncated: boolean;
  readonly sourceLayers: ReadonlyMap<string, DxfLayerAppearance>;
  readonly unresolvedExternalReferences: readonly string[];
  readonly unresolvedBlocks: readonly string[];
  readonly incompleteRootEntities: number;
}
interface DxfBlock {
  readonly base: CadDxfPoint3;
  readonly entities: readonly DxfRecord[];
  readonly external: boolean;
  readonly path: string;
}
interface Vertex extends CadDxfPoint3 { readonly bulge: number }
interface ExpandContext {
  readonly matrix: THREE.Matrix4;
  readonly inheritedLayer: string | null;
  readonly inheritedColor: string | null;
  readonly depth: number;
  readonly path: ReadonlySet<string>;
}

const MAX_BLOCK_DEPTH = 24;
// Keep geometry from ALL regions of a DWG. The old 80k hard stop discarded
// every subsequent INSERT; with batched GPU rendering and indexed SNAP we can
// accommodate a larger bounded reference without freezing Firefox.
export const MAX_RENDERED_SEGMENTS = 240_000;
const IDENTITY = new THREE.Matrix4();
const WHITE = "#ffffff";

function pairsFromDxf(text: string): DxfPair[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i]!.trim(), 10);
    if (Number.isFinite(code)) pairs.push({ code, value: lines[i + 1]!.trim() });
  }
  return pairs;
}

function recordsInSection(pairs: readonly DxfPair[], name: string): DxfRecord[] {
  const out: DxfRecord[] = [];
  let active = false;
  for (let i = 0; i < pairs.length;) {
    const pair = pairs[i]!;
    if (pair.code === 0 && pair.value.toUpperCase() === "SECTION"
      && pairs[i + 1]?.code === 2) {
      active = pairs[i + 1]?.value.toUpperCase() === name;
      i += 2;
      continue;
    }
    if (pair.code === 0 && pair.value.toUpperCase() === "ENDSEC") {
      active = false; i++; continue;
    }
    if (!active || pair.code !== 0) { i++; continue; }
    const type = pair.value.toUpperCase();
    i++;
    const record: DxfPair[] = [];
    while (i < pairs.length && pairs[i]?.code !== 0) record.push(pairs[i++]!);
    out.push({ type, pairs: record });
  }
  return out;
}

function str(record: DxfRecord, code: number, fallback = ""): string {
  return record.pairs.find(p => p.code === code)?.value ?? fallback;
}
function num(record: DxfRecord, code: number, fallback = 0): number {
  const value = record.pairs.find(p => p.code === code)?.value;
  if (value === undefined) return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}
function pt(record: DxfRecord, x: number, y: number, z: number): CadDxfPoint3 {
  return { x: num(record, x), y: num(record, y), z: num(record, z) };
}
function toVector(point: CadDxfPoint3): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}
function coords(point: THREE.Vector3): CadDxfPoint3 {
  return { x: point.x, y: point.y, z: point.z };
}
function hexFromRgbNumber(rgb: number): string {
  return "#" + (rgb & 0xffffff).toString(16).padStart(6, "0");
}
function aciColor(index: number): string {
  const base = [
    WHITE, "#ff0000", "#ffff00", "#00ff00", "#00ffff",
    "#0000ff", "#ff00ff", WHITE, "#808080", "#c0c0c0",
  ];
  if (index >= 1 && index <= 9) return base[index]!;
  if (index <= 0 || index > 255) return WHITE;
  // AutoCAD ACI 10-249: 24 hues × 10 brightness/saturation variants.
  const hue = Math.floor((index - 10) / 10) / 24;
  const variant = (index - 10) % 10;
  const saturation = variant % 2 === 0 ? 1 : 0.45;
  const brightness = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][variant]!;
  const color = new THREE.Color().setHSL(hue, saturation,
    brightness === 1 ? 0.5 : Math.max(0.08, brightness * 0.44));
  return "#" + color.getHexString();
}
function sourceLayersFrom(pairs: readonly DxfPair[]): Map<string, DxfLayerAppearance> {
  const layers = new Map<string, DxfLayerAppearance>();
  layers.set("0", { color: WHITE, visible: true });
  for (const record of recordsInSection(pairs, "TABLES")) {
    if (record.type !== "LAYER") continue;
    const name = str(record, 2, "0");
    const aci = num(record, 62, 7);
    const rgb = record.pairs.find(p => p.code === 420);
    const color = rgb ? hexFromRgbNumber(Number(rgb.value)) : aciColor(Math.abs(aci));
    const flags = num(record, 70);
    layers.set(name.toLowerCase(), {
      color,
      visible: aci >= 0 && (flags & (1 | 2)) === 0,
    });
  }
  return layers;
}
function blockDefinitions(pairs: readonly DxfPair[]): Map<string, DxfBlock> {
  const definitions = new Map<string, DxfBlock>();
  let current: { name: string; base: CadDxfPoint3; entities: DxfRecord[];
    external: boolean; path: string } | null = null;
  for (const record of recordsInSection(pairs, "BLOCKS")) {
    if (record.type === "BLOCK") {
      if (current) definitions.set(current.name.toUpperCase(),
        { base: current.base, entities: current.entities,
          external: current.external, path: current.path });
      current = { name: str(record, 2, str(record, 3)), base: pt(record, 10, 20, 30),
        entities: [], external: (num(record, 70) & 12) !== 0, path: str(record, 1) };
      continue;
    }
    if (record.type === "ENDBLK") {
      if (current) definitions.set(current.name.toUpperCase(),
        { base: current.base, entities: current.entities,
          external: current.external, path: current.path });
      current = null;
      continue;
    }
    if (current) current.entities.push(record);
  }
  return definitions;
}
function insUnits(pairs: readonly DxfPair[]): number {
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]?.code !== 9 || pairs[i]?.value !== "$INSUNITS") continue;
    for (let j = i + 1; j <= i + 4 && j < pairs.length; j++) {
      if (pairs[j]?.code === 70) return Number.parseInt(pairs[j]!.value, 10) || 0;
    }
  }
  return 0;
}
function lwVertices(record: DxfRecord): Vertex[] {
  const result: Vertex[] = [];
  const elevation = num(record, 38, 0);
  let x: number | null = null, y = 0, z = elevation, bulge = 0;
  const flush = () => {
    if (x !== null) result.push({ x, y, z, bulge });
  };
  for (const pair of record.pairs) {
    if (pair.code === 10) {
      flush(); x = Number(pair.value); y = 0; z = elevation; bulge = 0;
    } else if (pair.code === 20) y = Number(pair.value);
    else if (pair.code === 30) z = Number(pair.value);
    else if (pair.code === 42) bulge = Number(pair.value);
  }
  flush();
  return result;
}
function normalizedVertex(pt3: CadDxfPoint3, bulge = 0): Vertex {
  return { ...pt3, bulge };
}

export function parseCadDxf(
  text: string,
  options?: { readonly maxSegments?: number },
): ParsedCadReference {
  const maxSegments = Number.isFinite(options?.maxSegments)
    ? Math.max(16, Math.min(MAX_RENDERED_SEGMENTS,
      Math.floor(options!.maxSegments!)))
    : MAX_RENDERED_SEGMENTS;
  const pairs = pairsFromDxf(text);
  const sourceLayers = sourceLayersFrom(pairs);
  const blocks = blockDefinitions(pairs);
  const segments: ImportedCadSegment[] = [];
  const points: ImportedCadPoint[] = [];
  const texts: ImportedCadText[] = [];
  const skippedTypes = new Map<string, number>();
  let expandedBlocks = 0;
  let truncated = false;
  let incompleteRootEntities = 0;
  const externalReferences = new Set<string>();
  const unresolvedBlocks = new Set<string>();

  // A large array INSERT at the start must never consume the entire budget
  // and silently remove everything after it. The first pass reserves a
  // bounded share for every top-level entity, then distributes remaining
  // capacity to the entities that require more detail.
  let rootQuota = Number.POSITIVE_INFINITY;
  let rootEmitted = 0;
  let rootReplaySkip = 0;
  let rootSeen = 0;
  let rootLimited = false;
  let pass = 0;

  const skip = (type: string): void => {
    // Replaying a root to fill its remaining quota must not count the same
    // unsupported entity again.
    if (pass > 0 && type !== "LIMITE_SEGMENTOS") return;
    skippedTypes.set(type, (skippedTypes.get(type) ?? 0) + 1);
  };
  const appearanceForLayer = (layer: string): DxfLayerAppearance =>
    sourceLayers.get(layer.toLowerCase()) ?? { color: WHITE, visible: true };
  const effectiveColor = (
    record: DxfRecord, layer: string, inherited: string | null,
  ): string => {
    const trueColor = record.pairs.find(p => p.code === 420);
    if (trueColor && Number.isFinite(Number(trueColor.value))) {
      return hexFromRgbNumber(Number(trueColor.value));
    }
    const aci = num(record, 62, 256);
    if (aci === 0) return inherited ?? appearanceForLayer(layer).color;
    if (aci !== 256 && aci > 0 && aci <= 255) return aciColor(aci);
    return appearanceForLayer(layer).color;
  };
  /** DXF AutoCAD escape codes are literal strings, not geometry. */
  const textContent = (record: DxfRecord): string => {
    const raw = record.type === "MTEXT"
      ? record.pairs.filter((p) => p.code === 3).map((p) => p.value).join("")
        + str(record, 1)
      : str(record, 1);
    return raw
      .replace(/\\P/g, "\n")
      .replace(/\\~/g, " ")
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/%%[dD]/g, "°")
      .replace(/%%[pP]/g, "±")
      .replace(/%%[cC]/g, "⌀")
      .replace(/\\[LlOoKk]/g, "")
      .replace(/\\[HhWwFfCcAaTtQq][^;]*;/g, "")
      .replace(/\\S([^;]*);/g, (_, fraction: string) =>
        fraction.replace(/[\\^#]/g, "/"))
      .replace(/[{}]/g, "")
      .trim();
  };
  const addText = (
    record: DxfRecord, layer: string, color: string,
    context: ExpandContext,
  ): void => {
    if (texts.length >= 15_000) {
      rootLimited = true;
      return;
    }
    const flags = num(record, 70);
    if (record.type === "ATTDEF" && !(flags & 2)) return;
    if (record.type === "ATTRIB" && (flags & 1)) return;
    const value = textContent(record);
    if (!value) return;
    const height = Math.abs(num(record, 40, 2.5));
    if (!Number.isFinite(height) || height <= 1e-8) return;
    const alignH = num(record, 72);
    const alignV = num(record, 73);
    const isMtext = record.type === "MTEXT";
    const attachment = isMtext ? num(record, 71, 1) : 0;
    const useAlignmentPoint = !isMtext && (alignH !== 0 || alignV !== 0)
      && record.pairs.some((p) => p.code === 11);
    const location = useAlignmentPoint
      ? pt(record, 11, 21, 31) : pt(record, 10, 20, 30);
    const angleDeg = num(record, 50);
    const textDir = isMtext && record.pairs.some((p) => p.code === 11)
      ? pt(record, 11, 21, 31) : null;
    const direction = textDir && Math.hypot(textDir.x, textDir.y) > 1e-9
      ? Math.atan2(textDir.y, textDir.x)
      : angleDeg * Math.PI / 180;
    const scaleX = !isMtext ? num(record, 41, 1) : 1;
    const dx = Math.cos(direction) * height * scaleX;
    const dy = Math.sin(direction) * height * scaleX;
    const ux = -Math.sin(direction) * height;
    const uy = Math.cos(direction) * height;
    const o = toVector(location).applyMatrix4(context.matrix);
    const x = toVector({ x: location.x + dx, y: location.y + dy, z: location.z })
      .applyMatrix4(context.matrix);
    const y = toVector({ x: location.x + ux, y: location.y + uy, z: location.z })
      .applyMatrix4(context.matrix);
    if (!o.toArray().every(Number.isFinite) ||
      !x.toArray().every(Number.isFinite) ||
      !y.toArray().every(Number.isFinite)) return;
    const horizontalAlign: ImportedCadText["horizontalAlign"] = isMtext
      ? attachment % 3 === 2 ? "center" : attachment % 3 === 0 ? "right" : "left"
      : alignH === 1 || alignH === 4 ? "center" : alignH === 2 ? "right" : "left";
    const verticalAlign: ImportedCadText["verticalAlign"] = isMtext
      ? attachment <= 3 ? "top" : attachment <= 6 ? "middle" : "baseline"
      : alignV === 3 ? "top" : alignV === 2 ? "middle" : "baseline";
    texts.push({
      kind: record.type as ImportedCadText["kind"],
      layer, color, text: value, position: coords(o),
      axisX: coords(x), axisY: coords(y),
      horizontalAlign, verticalAlign,
    });
  };

  const line = (
    layer: string, color: string, context: ExpandContext,
    start: CadDxfPoint3, end: CadDxfPoint3,
  ): void => {
    // Validate before counting: only actual visible segments consume quotas.
    const a = toVector(start).applyMatrix4(context.matrix);
    const b = toVector(end).applyMatrix4(context.matrix);
    if (!a.toArray().every(Number.isFinite) || !b.toArray().every(Number.isFinite)
      || a.distanceToSquared(b) <= 1e-20) return;
    rootSeen++;
    if (rootSeen <= rootReplaySkip) return;
    if (rootEmitted >= rootQuota || segments.length >= maxSegments) {
      rootLimited = true;
      return;
    }
    segments.push({ layer, color, start: coords(a), end: coords(b) });
    rootEmitted++;
  };
  const polyline = (layer: string, color: string, context: ExpandContext,
    vertices: readonly Vertex[], closed: boolean): void => {
    const count = closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < count && !rootLimited; i++) {
      const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
      const bulge = a.bulge;
      if (Math.abs(bulge) < 1e-9) { line(layer, color, context, a, b); continue; }
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      if (chord <= 1e-12) continue;
      const theta = 4 * Math.atan(bulge);
      const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
      const middleX = (a.x + b.x) / 2, middleY = (a.y + b.y) / 2;
      const centerOffset = chord / (2 * Math.tan(theta / 2));
      const centerX = middleX - (b.y - a.y) / chord * centerOffset;
      const centerY = middleY + (b.x - a.x) / chord * centerOffset;
      const startAngle = Math.atan2(a.y - centerY, a.x - centerX);
      const steps = Math.min(128, Math.max(8, Math.ceil(Math.abs(theta) / (Math.PI / 18))));
      let previous: CadDxfPoint3 = a;
      for (let j = 1; j <= steps; j++) {
        const angle = startAngle + theta * j / steps;
        const next: CadDxfPoint3 = j === steps ? b : {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
          z: a.z + (b.z - a.z) * j / steps,
        };
        line(layer, color, context, previous, next);
        previous = next;
      }
    }
  };
  const sampleArc = (layer: string, color: string, ctx: ExpandContext,
    center: CadDxfPoint3, radius: number, start: number, sweep: number): void => {
    if (!(radius > 0) || !Number.isFinite(radius)) return;
    const steps = Math.max(12, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
    let previous = { x: center.x + radius * Math.cos(start),
      y: center.y + radius * Math.sin(start), z: center.z };
    for (let i = 1; i <= steps; i++) {
      const angle = start + sweep * i / steps;
      const next = { x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle), z: center.z };
      line(layer, color, ctx, previous, next);
      previous = next;
    }
  };
  const sampleEllipse = (layer: string, color: string, ctx: ExpandContext,
    center: CadDxfPoint3, major: CadDxfPoint3, ratio: number,
    start: number, sweep: number): void => {
    const majorLength = Math.hypot(major.x, major.y);
    if (majorLength < 1e-12 || ratio <= 0) return;
    const ux = major.x / majorLength, uy = major.y / majorLength;
    const at = (t: number): CadDxfPoint3 => ({
      x: center.x + ux * majorLength * Math.cos(t) - uy * majorLength * ratio * Math.sin(t),
      y: center.y + uy * majorLength * Math.cos(t) + ux * majorLength * ratio * Math.sin(t),
      z: center.z,
    });
    const steps = Math.max(20, Math.ceil(Math.abs(sweep) / (Math.PI / 48)));
    let previous = at(start);
    for (let i = 1; i <= steps; i++) {
      const next = at(start + sweep * i / steps);
      line(layer, color, ctx, previous, next);
      previous = next;
    }
  };

  const expand = (records: readonly DxfRecord[], ctx: ExpandContext): void => {
    let legacy: { layer: string; color: string; vertices: Vertex[]; closed: boolean } | null = null;
    const finish = (): void => {
      if (!legacy) return;
      polyline(legacy.layer, legacy.color, ctx, legacy.vertices, legacy.closed);
      legacy = null;
    };
    for (const record of records) {
      if (rootLimited) break;
      const sourceLayer = str(record, 8, "0");
      const layer = sourceLayer === "0" && ctx.inheritedLayer
        ? ctx.inheritedLayer : sourceLayer;
      const color = effectiveColor(record, layer, ctx.inheritedColor);
      if (pass === 2
        && record.type !== "INSERT"
        && record.type !== "DIMENSION"
        && record.type !== "TEXT"
        && record.type !== "MTEXT"
        && record.type !== "ATTRIB"
        && record.type !== "ATTDEF") continue;
      if (record.type === "POLYLINE") {
        finish();
        legacy = { layer, color, vertices: [], closed: (num(record, 70) & 1) !== 0 };
        continue;
      }
      if (record.type === "VERTEX" && legacy) {
        legacy.vertices.push(normalizedVertex(pt(record, 10, 20, 30), num(record, 42)));
        continue;
      }
      if (record.type === "SEQEND" && legacy) { finish(); continue; }
      finish();
      switch (record.type) {
        case "INSERT":
        case "DIMENSION": {
          const name = str(record, 2).toUpperCase();
          const block = blocks.get(name);
          if (!block || ctx.depth >= MAX_BLOCK_DEPTH || ctx.path.has(name)) {
            if (!block) unresolvedBlocks.add(name);
            if (pass === 0) skip(record.type);
            break;
          }
          if (block.external && block.entities.length === 0) {
            externalReferences.add(block.path || name);
            if (pass === 0) skip("XREF");
            break;
          }
          if (pass === 0) expandedBlocks++;
          const countX = record.type === "INSERT" ? Math.max(1, Math.min(128, num(record, 70, 1))) : 1;
          const countY = record.type === "INSERT" ? Math.max(1, Math.min(128, num(record, 71, 1))) : 1;
          const rotation = num(record, 50) * Math.PI / 180;
          // DIMENSION group 10 is its definition point, NOT the insertion
          // of its anonymous graphic block. DXF group 12 is the insert
          // displacement; without it the dimension graphics are already in
          // world coordinates (see AutoCAD AcDbDimension / ezdxf).
          const translation = record.type === "DIMENSION"
            ? pt(record, 12, 22, 32)
            : pt(record, 10, 20, 30);
          const parent = ctx.matrix.clone()
            .multiply(new THREE.Matrix4().makeTranslation(translation.x, translation.y, translation.z))
            .multiply(new THREE.Matrix4().makeRotationZ(rotation))
            .multiply(new THREE.Matrix4().makeScale(
              num(record, 41, 1), num(record, 42, 1), num(record, 43, 1),
            ));
          const path = new Set(ctx.path);
          path.add(name);
          for (let row = 0; row < countY && !rootLimited; row++)
            for (let col = 0; col < countX && !rootLimited; col++) {
            const matrix = parent.clone().multiply(new THREE.Matrix4().makeTranslation(
              col * num(record, 44) - block.base.x,
              row * num(record, 45) - block.base.y,
              -block.base.z,
            ));
            expand(block.entities, {
              matrix, inheritedLayer: layer, inheritedColor: color,
              depth: ctx.depth + 1, path,
            });
          }
          break;
        }
        case "LINE":
          line(layer, color, ctx, pt(record, 10, 20, 30), pt(record, 11, 21, 31));
          break;
        case "POINT": {
          const position = toVector(pt(record, 10, 20, 30)).applyMatrix4(ctx.matrix);
          if (pass === 0 && position.toArray().every(Number.isFinite)
            && points.length < maxSegments) {
            points.push({ layer, color, point: coords(position) });
          }
          break;
        }
        case "LWPOLYLINE":
          polyline(layer, color, ctx, lwVertices(record), (num(record, 70) & 1) !== 0);
          break;
        case "CIRCLE":
          sampleArc(layer, color, ctx, pt(record, 10, 20, 30),
            Math.abs(num(record, 40)), 0, Math.PI * 2);
          break;
        case "ARC": {
          let sweep = (num(record, 51) - num(record, 50)) * Math.PI / 180;
          while (sweep <= 0) sweep += 2 * Math.PI;
          sampleArc(layer, color, ctx, pt(record, 10, 20, 30),
            Math.abs(num(record, 40)), num(record, 50) * Math.PI / 180, sweep);
          break;
        }
        case "ELLIPSE": {
          const start = num(record, 41), end = num(record, 42, Math.PI * 2);
          const sweep = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
            || Math.PI * 2;
          sampleEllipse(layer, color, ctx, pt(record, 10, 20, 30),
            pt(record, 11, 21, 31), Math.abs(num(record, 40, 1)), start, sweep);
          break;
        }
        case "TRACE":
        case "SOLID":
        case "3DFACE": {
          const a = pt(record, 10, 20, 30), b = pt(record, 11, 21, 31);
          const c = pt(record, 12, 22, 32), d = pt(record, 13, 23, 33);
          const corners = record.type === "3DFACE"
            ? [a, b, c, d] : [a, b, d, c];
          const edgeFlags = record.type === "3DFACE" ? num(record, 70) : 0;
          for (let i = 0; i < 4; i++) {
            if (edgeFlags & (1 << i)) continue;
            const previous = corners[i]!, next = corners[(i + 1) % 4]!;
            line(layer, color, ctx, previous, next);
          }
          break;
        }
        case "SPLINE": {
          const fit = triples(record, 11, 21, 31);
          const control = triples(record, 10, 20, 30);
          const vertices = fit.length > 1 ? fit : control;
          if (vertices.length < 2) { skip("SPLINE"); break; }
          // Exact NURBS/fit-point reconstruction is a separate CAD feature;
          // preserve the available control/fit geometry as connected segments.
          polyline(layer, color, ctx, vertices.map(v => normalizedVertex(v)),
            (num(record, 70) & 1) !== 0);
          break;
        }
        case "HATCH": {
          // Boundary polyline loops are stored as DXF 92/93/10/20 sequences.
          // Render their outlines; patterned/solid fill is not yet supported.
          const loops = hatchPolylineLoops(record);
          if (!loops.length) { skip("HATCH"); break; }
          for (const loop of loops) polyline(layer, color, ctx, loop, true);
          break;
        }
        case "ATTRIB":
        case "ATTDEF":
        case "TEXT":
        case "MTEXT":
          if (pass === 2) addText(record, layer, color, ctx);
          break;
        case "MLEADER":
        case "MULTILEADER":
        case "LEADER":
        case "IMAGE":
        case "OLE2FRAME":
        case "WIPEOUT":
        case "ACAD_PROXY_ENTITY":
          skip(record.type);
          break;
        case "SEQEND":
        case "ENDBLK":
          break;
        default:
          if (record.type) skip(record.type);
      }
    }
    finish();
  };

  // Preserve POLYLINE/VERTEX/SEQEND as ONE logical root. Treating each VERTEX
  // as a separate root would erase the original polyline on budgeted imports.
  const entities = recordsInSection(pairs, "ENTITIES");
  const roots: DxfRecord[][] = [];
  for (let i = 0; i < entities.length; i++) {
    const record = entities[i]!;
    const group = [record];
    if (record.type === "POLYLINE") {
      while (i + 1 < entities.length) {
        const next = entities[++i]!;
        group.push(next);
        if (next.type === "SEQEND") break;
      }
    }
    roots.push(group);
  }
  const context: ExpandContext = {
    matrix: IDENTITY, inheritedLayer: null, inheritedColor: null,
    depth: 0, path: new Set(),
  };
  const runRoot = (root: DxfRecord[], quota: number, replaySkip = 0): {
    readonly used: number; readonly limited: boolean;
  } => {
    rootQuota = Math.max(0, quota);
    rootEmitted = 0;
    rootReplaySkip = replaySkip;
    rootSeen = 0;
    rootLimited = false;
    expand(root, context);
    return { used: rootEmitted, limited: rootLimited };
  };
  // Reserve a fair share for every logical entity before expanding any
  // potentially enormous MINSERT/HATCH. Extra budget restores full detail.
  const fairShare = Math.max(16,
    Math.min(4096, Math.floor(maxSegments * 0.75 / Math.max(1, roots.length))));
  const pending: Array<{ root: DxfRecord[]; cursor: number }> = [];
  let visitedRoots = 0;
  for (const root of roots) {
    const result = runRoot(root, Math.min(fairShare,
      maxSegments - segments.length));
    if (result.limited) pending.push({ root, cursor: result.used });
    visitedRoots++;
    if (segments.length >= maxSegments) break;
  }
  // Preserve geometry detail by replaying only the un-emitted suffix. Passes
  // are bounded by the shrinking candidate set; all main roots have already
  // been represented by the first pass.
  pass = 1;
  let remaining = pending;
  for (let iteration = 0;
    iteration < 6 && remaining.length && segments.length < maxSegments;
    iteration++) {
    const next: typeof pending = [];
    let emittedThisPass = 0;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i]!;
      const capacity = maxSegments - segments.length;
      if (capacity <= 0) { next.push(item); continue; }
      const quota = Math.max(1, Math.floor(capacity / (remaining.length - i)));
      const result = runRoot(item.root, quota, item.cursor);
      item.cursor += result.used;
      emittedThisPass += result.used;
      if (result.limited) next.push(item);
    }
    // If no progress can be made, stop rather than loop forever.
    if (emittedThisPass === 0) {
      remaining = next;
      break;
    }
    remaining = next;
  }
  incompleteRootEntities = remaining.length + (roots.length - visitedRoots);
  truncated = incompleteRootEntities > 0;
  if (truncated) skip("LIMITE_SEGMENTOS");

  // Text has its own independent pass so a large early MINSERT cannot use
  // the geometric segment budget and erase later part labels.
  pass = 2;
  for (const root of roots) {
    if (texts.length >= 15_000) break;
    rootQuota = Number.POSITIVE_INFINITY;
    rootEmitted = 0;
    rootReplaySkip = 0;
    rootSeen = 0;
    rootLimited = false;
    expand(root, context);
  }
  if (texts.length >= 15_000) skip("LIMITE_TEXTOS");

  return {
    segments, points, texts, insUnits: insUnits(pairs), expandedBlocks, sourceLayers,
    truncated, incompleteRootEntities,
    unresolvedExternalReferences: [...externalReferences],
    unresolvedBlocks: [...unresolvedBlocks],
    skippedTypes,
    skippedEntities: [...skippedTypes.values()].reduce((a, b) => a + b, 0),
  };
}

function triples(record: DxfRecord, xc: number, yc: number, zc: number): CadDxfPoint3[] {
  const points: CadDxfPoint3[] = [];
  let current: { x: number; y: number; z: number } | null = null;
  for (const p of record.pairs) {
    if (p.code === xc) {
      if (current) points.push(current);
      current = { x: Number(p.value), y: 0, z: 0 };
    }
    else if (p.code === yc && current) current.y = Number(p.value);
    else if (p.code === zc && current) current.z = Number(p.value);
  }
  if (current) points.push(current);
  return points.filter(p => [p.x, p.y, p.z].every(Number.isFinite));
}

function hatchPolylineLoops(record: DxfRecord): Vertex[][] {
  const loops: Vertex[][] = [];
  const pairs = record.pairs;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]?.code !== 92) continue;
    const flags = Number(pairs[i]?.value) || 0;
    if ((flags & 2) === 0) continue;
    let count = 0, closed = true;
    let j = i + 1;
    for (; j < pairs.length && pairs[j]?.code !== 92; j++) {
      if (pairs[j]?.code === 73) closed = pairs[j]?.value !== "0";
      if (pairs[j]?.code === 93) { count = Number(pairs[j]?.value) || 0; j++; break; }
    }
    if (!closed || count < 2 || count > 100_000) continue;
    const vertices: Vertex[] = [];
    let current: { x: number; y: number; z: number; bulge: number } | null = null;
    for (; j < pairs.length && vertices.length < count; j++) {
      const p = pairs[j]!;
      if (p.code === 10) {
        if (current) vertices.push(current);
        current = { x: Number(p.value), y: 0, z: 0, bulge: 0 };
      } else if (p.code === 20 && current) current.y = Number(p.value);
      else if (p.code === 42 && current) current.bulge = Number(p.value);
      else if (p.code === 92 || p.code === 97) break;
    }
    if (current) vertices.push(current);
    if (vertices.length >= 2) loops.push(vertices);
    i = Math.max(i, j - 1);
  }
  return loops;
}
