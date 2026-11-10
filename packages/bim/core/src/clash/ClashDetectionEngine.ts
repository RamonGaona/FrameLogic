import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";
import { getOpenCascadeClashKernel, type BooleanClashResult } from "@framelogic/geometry";
import type { DesignSceneController } from "../design/DesignSceneController";
import { getPieceDetailGeometry } from "../design/PieceVisualGeometry";
import { getStepBrepDocumentId } from "../step/StepEngineeringBridge";

export type ClashKind = "HARD";
export type ClashReviewStatus = "Pendiente" | "Revisado" | "Aceptado" | "Resuelto";

export interface ClashRecord {
  readonly id: string;
  readonly pairKey: string;
  readonly aId: string;
  readonly bId: string;
  readonly aName: string;
  readonly bName: string;
  readonly aCode: string;
  readonly bCode: string;
  readonly aAssembly: string;
  readonly bAssembly: string;
  readonly kind: ClashKind;
  readonly confirmed: true;
  readonly volumeMm3: number;
  readonly location: THREE.Vector3;
  readonly approximateLocation: false;
  readonly explanation: string;
}

export interface ClashScanOptions {
  readonly selection?: readonly string[];
  /** Minimum significant volume, in mm³; not a contact/clearance distance. */
  readonly minVolumeMm3: number;
  readonly includeHidden?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface ClashScan {
  readonly records: readonly ClashRecord[];
  readonly signature: string;
  readonly pieces: number;
  readonly candidates: number;
  /** Pairs with no live B-rep or an OCCT validation/boolean error. No conclusion about these pairs. */
  readonly uncheckedPairs: number;
}

export interface ClashVolumeIntersector {
  intersect(
    aDocumentId: string | undefined, bDocumentId: string | undefined,
    matrixA: readonly number[], matrixB: readonly number[],
  ): Promise<BooleanClashResult>;
}

interface Part {
  id: string;
  name: string;
  code: string;
  assembly: string;
  bounds: THREE.Box3;
  object: THREE.Object3D;
  brepDocumentId?: string;
}

export function stableClashPair(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

export function clashIdForPair(pair: string): string {
  let hash = 2166136261;
  for (const char of pair) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return "CL-" + (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Análisis cancelado", "AbortError");
}

function hasPositiveIntersection(a: THREE.Box3, b: THREE.Box3): boolean {
  // Strict positive 3-axis overlap excludes face, edge and vertex contact.
  return a.min.x < b.max.x && b.min.x < a.max.x
    && a.min.y < b.max.y && b.min.y < a.max.y
    && a.min.z < b.max.z && b.min.z < a.max.z;
}

/** Read-only STEP B-rep hard-clash scan. Never reports touching faces or near-clearance. */
export class ClashDetectionEngine {
  private readonly model: DesignModel;
  private readonly scene: DesignSceneController;
  private readonly intersector: ClashVolumeIntersector;

  constructor(model: DesignModel, scene: DesignSceneController, intersector: ClashVolumeIntersector = getOpenCascadeClashKernel()) {
    this.model = model;
    this.scene = scene;
    this.intersector = intersector;
  }

  signature(): string {
    return this.model.pieceInstances.getAll().map(instance => {
      const def = this.model.pieceDefinitions.get(instance.definitionId);
      const object = this.scene.getInstanceObject(instance.id);
      object?.updateMatrixWorld(true);
      const meshIds: string[] = [];
      object?.traverse(child => {
        if (child instanceof THREE.Mesh) meshIds.push(getPieceDetailGeometry(child).uuid);
      });
      return [instance.id, instance.definitionId, def?.geometryAssetId,
        instance.layerId, instance.transform.position.x, instance.transform.position.y,
        instance.transform.position.z, instance.transform.rotation.x,
        instance.transform.rotation.y, instance.transform.rotation.z,
        object?.visible, object?.matrixWorld.elements.join(","), meshIds.join(","),
        getStepBrepDocumentId(instance.definitionId) ?? ""].join(":");
    }).join(";");
  }

  private getParts(options: ClashScanOptions): Part[] {
    const selection = options.selection ? new Set(options.selection) : null;
    const owners = new Map<string, string>();
    for (const assembly of this.model.assemblies.getAll()) {
      for (const id of assembly.pieceInstanceIds) {
        const names = [assembly.name];
        let parentId = assembly.parentAssemblyId;
        const visited = new Set<string>([assembly.id]);
        while (parentId && !visited.has(parentId)) {
          visited.add(parentId);
          const parent = this.model.assemblies.get(parentId);
          if (!parent) break;
          names.unshift(parent.name);
          parentId = parent.parentAssemblyId;
        }
        owners.set(id, names.join(" / "));
      }
    }
    return this.model.pieceInstances.getAll().flatMap(instance => {
      if (selection && !selection.has(instance.id)) return [];
      const object = this.scene.getInstanceObject(instance.id);
      if (!object || (!options.includeHidden && !object.visible)) return [];
      const bounds = this.scene.getInstanceWorldBounds(instance.id);
      if (!bounds || bounds.isEmpty()) return [];
      const def = this.model.pieceDefinitions.get(instance.definitionId);
      return [{
        id: instance.id, name: instance.name || def?.name || def?.code || instance.id,
        code: def?.code || "", assembly: owners.get(instance.id) || "",
        bounds, object, brepDocumentId: getStepBrepDocumentId(instance.definitionId),
      }];
    });
  }

  async scan(options: ClashScanOptions): Promise<ClashScan> {
    if (!Number.isFinite(options.minVolumeMm3) || options.minVolumeMm3 < 0) {
      throw new Error("El volumen mínimo debe ser un número no negativo en mm³.");
    }
    checkAbort(options.signal);
    const signature = this.signature();
    const parts = this.getParts(options).sort((a, b) => a.bounds.min.x - b.bounds.min.x);
    const pairs: Array<[Part, Part]> = [];
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i]!;
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j]!;
        if (b.bounds.min.x >= a.bounds.max.x) break;
        if (hasPositiveIntersection(a.bounds, b.bounds)) pairs.push([a, b]);
      }
    }
    const records: ClashRecord[] = [];
    let uncheckedPairs = 0;
    for (let i = 0; i < pairs.length; i++) {
      checkAbort(options.signal);
      if (this.signature() !== signature) throw new Error("El modelo cambió durante el análisis. Ejecútalo nuevamente.");
      const [a, b] = pairs[i]!;
      if (!a.brepDocumentId || !b.brepDocumentId) {
        uncheckedPairs += 1;
      } else {
        a.object.updateMatrixWorld(true);
        b.object.updateMatrixWorld(true);
        const result = await this.intersector.intersect(a.brepDocumentId, b.brepDocumentId,
          a.object.matrixWorld.elements, b.object.matrixWorld.elements);
        checkAbort(options.signal);
        if (result.kind === "UNAVAILABLE") {
          uncheckedPairs += 1;
        } else if (result.kind === "PENETRATION" && result.volumeMm3 > options.minVolumeMm3) {
          const pairKey = stableClashPair(a.id, b.id);
          records.push({
            id: clashIdForPair(pairKey), pairKey,
            aId: a.id, bId: b.id, aName: a.name, bName: b.name,
            aCode: a.code, bCode: b.code, aAssembly: a.assembly, bAssembly: b.assembly,
            kind: "HARD", confirmed: true, volumeMm3: result.volumeMm3,
            location: new THREE.Vector3(result.center.x, result.center.y, result.center.z),
            approximateLocation: false,
            explanation: "Penetración volumétrica confirmada por booleana Common B-rep de OpenCascade.",
          });
        }
      }
      if ((i + 1) % 5 === 0 || i === pairs.length - 1) {
        options.onProgress?.(i + 1, pairs.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    checkAbort(options.signal);
    if (this.signature() !== signature) throw new Error("El modelo cambió durante el análisis. Ejecútalo nuevamente.");
    return { records, signature, pieces: parts.length, candidates: pairs.length, uncheckedPairs };
  }
}
