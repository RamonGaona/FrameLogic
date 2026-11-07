import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { DesignModel, PieceInstance, PieceVector3Data } from "@framelogic/domain";
import type { CadHistoryController } from "../interaction/CadHistoryController";
import { assetPositionForPieceSnap } from "../interaction/assetPositionForPieceSnap";

type Vec = PieceVector3Data;
type Transform = PieceInstance["transform"];
export type ChangeRequest =
  | { operation: "move_piece"; id: string; space: "local" | "world"; displacement?: Vec; position?: Vec }
  | { operation: "copy_piece" | "copy_piece_array"; id: string; space: "local" | "world"; direction: Vec; distance: number; count: number };
export interface Proposal { id: string; operation: ChangeRequest["operation"]; sourceId: string; before: Transform; targets: Transform[]; units: "mm"; }
export interface OperationPorts {
  sync(): void;
  getSelection(): string[];
  setSelection(ids: string[]): void;
  /** Reject when an interactive command, isolated editor or project load is active. */
  assertReady(): void;
}
const vector = (v: Vec) => new Vector3(v.x, v.y, v.z);
const data = (v: Vector3): Vec => ({ x: v.x, y: v.y, z: v.z });
function finite(v: Vec): void {
  if (!v || ![v.x, v.y, v.z].every(Number.isFinite)) throw new Error("Expected finite x, y, z coordinates");
}

/** Numerical operations over persisted domain state. No renderer, mouse or geometry mutation. */
export class ModelOperations {
  private readonly model: DesignModel;
  private readonly history: CadHistoryController;
  private readonly ports: OperationPorts;
  private pending = new Map<string, { proposal: Proposal; fingerprint: string; expires: number }>();
  readonly audit: { operation: string; success: boolean; message?: string }[] = [];
  constructor(model: DesignModel, history: CadHistoryController, ports: OperationPorts) {
    this.model = model; this.history = history; this.ports = ports;
  }
  private log(operation: string, success: boolean, message?: string): void {
    this.audit.push({ operation, success, message });
    if (this.audit.length > 200) this.audit.shift();
  }
  private instance(id: string): PieceInstance {
    const p = this.model.pieceInstances.get(id);
    if (!p) throw new Error(`Piece instance not found: ${id}`);
    finite(p.transform.position); finite(p.transform.rotation);
    return p;
  }
  private editable(id: string): PieceInstance {
    const p = this.instance(id);
    if (this.model.layers.get(p.layerId)?.locked) throw new Error("Piece layer is locked");
    if (this.model.assemblies.getAll().some(a => a.pieceInstanceIds.includes(id)))
      throw new Error("Assembly members are not supported by automation phase 1");
    return p;
  }
  private matrix(id: string): Matrix4 {
    const t = this.instance(id).transform;
    return new Matrix4().compose(vector(t.position), new Quaternion().setFromEuler(
      new Euler(t.rotation.x, t.rotation.y, t.rotation.z, "XYZ")), new Vector3(1, 1, 1));
  }
  private definition(id: string) {
    const d = this.model.pieceDefinitions.get(this.instance(id).definitionId);
    if (!d) throw new Error("Piece definition missing");
    return d;
  }
  private fingerprint(): string {
    // Full relevant domain snapshot also invalidates previews after manual edits or project replacement.
    return JSON.stringify([this.model.pieceInstances.getAll(), this.model.pieceDefinitions.getAll(),
      this.model.layers.getAll(), this.model.assemblies.getAll()]);
  }
  getModelInfo() {
    return { units: "mm", instances: this.model.pieceInstances.count,
      definitions: this.model.pieceDefinitions.getAll().length,
      canUndo: this.history.canUndo, canRedo: this.history.canRedo,
      limitations: ["align_piece unavailable", "assembly members cannot be modified", "persistent snaps only"] };
  }
  listPieces() { return structuredClone({ instances: this.model.pieceInstances.getAll(), definitions: this.model.pieceDefinitions.getAll() }); }
  getPiece(id: string) { return structuredClone({ instance: this.instance(id), definition: this.definition(id) }); }
  listPieceSnaps(id: string) {
    const d = this.definition(id), m = this.matrix(id);
    return d.snapPoints.map(s => ({ ...structuredClone(s), instanceId: id,
      worldPosition: data(assetPositionForPieceSnap(d.coordinateSystem, s.position).applyMatrix4(m)) }));
  }
  getPieceAxes(id: string) {
    const d = this.definition(id), m = this.matrix(id), c = d.coordinateSystem;
    const direction = (v: Vec) => data(vector(v).transformDirection(m));
    return { instanceId: id, origin: data(vector(c.origin).applyMatrix4(m)),
      x: direction(c.xAxis), y: direction(c.yAxis), z: direction(c.zAxis),
      references: d.referenceGeometry.axisLines.map(a => ({ ...structuredClone(a),
        worldOrigin: data(assetPositionForPieceSnap(c, a.origin).applyMatrix4(m)),
        worldDirection: data(this.worldDisplacement(id, a.direction, "local").normalize()) })) };
  }
  selectPieces(ids: string[]) {
    this.ports.assertReady();
    if (!Array.isArray(ids) || ids.length > 1000) throw new Error("Invalid selection");
    ids.forEach(id => this.instance(id));
    this.ports.setSelection([...new Set(ids)]);
    return { selected: this.ports.getSelection() };
  }
  private worldDisplacement(id: string, v: Vec, space: "local" | "world"): Vector3 {
    finite(v);
    if (space === "world") return vector(v);
    if (space !== "local") throw new Error("Space must be local or world");
    const axes = this.getPieceFrame(id);
    return axes[0].multiplyScalar(v.x).addScaledVector(axes[1], v.y).addScaledVector(axes[2], v.z);
  }
  private getPieceFrame(id: string): Vector3[] {
    const c = this.definition(id).coordinateSystem, m = this.matrix(id);
    const basis = [c.xAxis, c.yAxis, c.zAxis].map(v => { finite(v); return vector(v); });
    if (basis.some(v => Math.abs(v.length() - 1) > 1e-6)
      || Math.abs(basis[0]!.dot(basis[1]!)) > 1e-6
      || Math.abs(basis[0]!.dot(basis[2]!)) > 1e-6
      || Math.abs(basis[1]!.dot(basis[2]!)) > 1e-6) throw new Error("Invalid local orthonormal frame");
    return basis.map(v => v.transformDirection(m));
  }
  prepare(request: ChangeRequest): Proposal {
    this.ports.assertReady();
    const source = this.editable(request.id), before = structuredClone(source.transform);
    let targets: Transform[];
    if (request.operation === "move_piece") {
      if (!!request.position === !!request.displacement) throw new Error("Provide exactly one position or displacement");
      let delta: Vector3;
      if (request.position) {
        if (request.space !== "world") throw new Error("Absolute position must be world FrameLogic origin; use local displacement otherwise");
        finite(request.position);
        delta = vector(request.position).sub(vector(this.getPieceAxes(request.id).origin));
      } else delta = this.worldDisplacement(request.id, request.displacement!, request.space);
      targets = [{ ...before, position: data(vector(before.position).add(delta)) }];
    } else if (request.operation === "copy_piece" || request.operation === "copy_piece_array") {
      if (!Number.isInteger(request.count) || request.count < 1 || request.count > 100
        || (request.operation === "copy_piece" && request.count !== 1)) throw new Error("Copy count must be 1–100 (1 for copy_piece)");
      if (!Number.isFinite(request.distance) || request.distance <= 0) throw new Error("Distance must be finite and positive in mm");
      const direction = this.worldDisplacement(request.id, request.direction, request.space);
      if (!Number.isFinite(direction.length()) || direction.length() < 1e-12) throw new Error("Direction must be nonzero");
      direction.normalize();
      targets = Array.from({ length: request.count }, (_, i) => ({ ...structuredClone(before),
        position: data(vector(before.position).addScaledVector(direction, request.distance * (i + 1))) }));
    } else throw new Error("Unsupported operation (align_piece is not implemented)");
    targets.forEach(t => finite(t.position));
    const proposal: Proposal = { id: crypto.randomUUID(), operation: request.operation,
      sourceId: request.id, before, targets, units: "mm" };
    // Bound memory: only the newest proposal may be confirmed.
    this.pending.clear();
    this.pending.set(proposal.id, { proposal: structuredClone(proposal), fingerprint: this.fingerprint(), expires: Date.now() + 120000 });
    return structuredClone(proposal);
  }
  confirm(proposalId: string) {
    this.ports.assertReady();
    const pending = this.pending.get(proposalId);
    this.pending.delete(proposalId);
    if (!pending || pending.expires < Date.now()) throw new Error("Proposal missing or expired; prepare again");
    if (pending.fingerprint !== this.fingerprint()) throw new Error("Model changed; prepare again");
    const p = pending.proposal, source = structuredClone(this.editable(p.sourceId));
    const selected = this.ports.getSelection();
    const records = p.targets.map(t => ({ ...structuredClone(source), id: crypto.randomUUID(), transform: t }));
    const move = p.operation === "move_piece";
    const apply = () => {
      if (move) this.model.pieceInstances.updateTransform(source.id, p.targets[0]!);
      else for (const r of records) this.model.registerPieceInstance({ ...r, tags: [...r.tags] });
      this.ports.sync();
    };
    const rollback = () => {
      if (move) this.model.pieceInstances.updateTransform(source.id, source.transform);
      else for (const r of records) this.model.removePieceInstance(r.id);
      this.ports.sync(); this.ports.setSelection(selected);
    };
    const atomicApply = () => {
      // Preflight redo too, before any changes.
      this.editable(source.id);
      if (!move && records.some(r => this.model.pieceInstances.get(r.id))) throw new Error("Copy identifier collision");
      try { apply(); } catch (error) { rollback(); throw error; }
    };
    try {
      atomicApply();
      this.history.recordOperation(p.operation, () => {
        // Validate every removal first: a manual assembly must never cause a partial undo.
        if (!move) for (const r of records) this.editable(r.id);
        else this.editable(source.id);
        try { rollback(); } catch (error) {
          if (move) this.model.pieceInstances.updateTransform(source.id, p.targets[0]!);
          else for (const r of records) if (!this.model.pieceInstances.get(r.id))
            this.model.registerPieceInstance({ ...r, tags: [...r.tags] });
          this.ports.sync();
          throw error;
        }
      }, atomicApply);
      this.log(p.operation, true);
      return { affectedIds: move ? [source.id] : records.map(r => r.id) };
    } catch (error) { this.log(p.operation, false, String(error)); throw error; }
  }
  undo() { this.ports.assertReady(); this.pending.clear(); const changed = this.history.undo(); this.log("undo", changed); return { changed }; }
  redo() { this.ports.assertReady(); this.pending.clear(); const changed = this.history.redo(); this.log("redo", changed); return { changed }; }
}
