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
export interface CommandsProposal {
  id: string;
  operation: "commands";
  steps: Proposal[];
  copyCount: number;
  units: "mm";
}
export interface ObjectQuery {
  ids?: readonly string[];
  search?: string;
  selectedOnly?: boolean;
  limit?: number;
}
export interface ModelObjectSummary {
  id: string;
  name: string;
  code: string;
  definitionId: string;
  layerId: string;
  selected: boolean;
  tags: string[];
  transform: Transform;
  /** Calculated from detailed asset geometry, not from the display LOD. */
  boundsMm: { min: Vec; max: Vec } | null;
}
export interface OperationPorts {
  sync(): void;
  getSelection(): string[];
  setSelection(ids: string[]): void;
  /** May omit bounds when the detailed visual asset has not been loaded. */
  getInstanceBounds?(id: string): { min: Vec; max: Vec } | null;
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
  private pendingCommands: { proposal: CommandsProposal; fingerprint: string; expires: number } | null = null;
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
  /** Safe, capped model queries by stable IDs, partial name/code and live selection. */
  queryObjects(query: ObjectQuery = {}) {
    const term = (query.search ?? "").trim().toLocaleLowerCase();
    if (term.length > 200) throw new Error("Search term exceeds 200 characters");
    if (query.ids && (query.ids.length > 100 || query.ids.some(id => !id || id.length > 200)))
      throw new Error("Query supports up to 100 valid instance identifiers");
    const limit = query.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Query limit must be between 1 and 100");
    const ids = query.ids ? new Set(query.ids) : null;
    const selectedIds = new Set(this.ports.getSelection());
    const objects: ModelObjectSummary[] = [];
    let total = 0;
    for (const instance of this.model.pieceInstances.getAll()) {
      if (ids && !ids.has(instance.id)) continue;
      if (query.selectedOnly && !selectedIds.has(instance.id)) continue;
      const definition = this.model.pieceDefinitions.get(instance.definitionId);
      const label = instance.name?.trim() || definition?.name || definition?.code || "Pieza";
      const code = definition?.code ?? "";
      if (term && ![instance.id, label, code, definition?.name ?? ""]
        .some(value => value.toLocaleLowerCase().includes(term))) continue;
      total++;
      if (objects.length >= limit) continue;
      objects.push({
        id: instance.id,
        name: label,
        code,
        definitionId: instance.definitionId,
        layerId: instance.layerId,
        selected: selectedIds.has(instance.id),
        tags: [...instance.tags],
        transform: structuredClone(instance.transform),
        boundsMm: this.ports.getInstanceBounds?.(instance.id) ?? null,
      });
    }
    return { total, returned: objects.length, truncated: total > objects.length, objects };
  }

  describeObject(id: string) {
    const { objects } = this.queryObjects({ ids: [id], limit: 1 });
    const object = objects[0];
    if (!object) throw new Error("Piece instance not found: " + id);
    const piece = this.getPiece(id);
    return {
      ...object,
      definitionName: piece.definition.name,
      classification: piece.definition.classification,
      axes: this.getPieceAxes(id),
      snaps: this.listPieceSnaps(id),
      boundsPrecision: object.boundsMm ? "DETAIL_GEOMETRY" : "UNAVAILABLE",
    };
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
  /**
   * Resolve targets in a staged transform. Sequential requests for one piece
   * use the previous target as their starting point; copies always reference
   * the staged source, never depend on IDs not yet created.
   */
  private targetsForRequest(request: ChangeRequest, before: Transform): Transform[] {
    if (request.operation === "move_piece") {
      if (!!request.position === !!request.displacement)
        throw new Error("Provide exactly one position or displacement");
      let delta: Vector3;
      if (request.position) {
        if (request.space !== "world")
          throw new Error("Absolute position must be world FrameLogic origin; use local displacement otherwise");
        finite(request.position);
        const persisted = this.instance(request.id).transform.position;
        const currentOrigin = vector(this.getPieceAxes(request.id).origin)
          .add(vector(before.position).sub(vector(persisted)));
        delta = vector(request.position).sub(currentOrigin);
      } else delta = this.worldDisplacement(request.id, request.displacement!, request.space);
      const target: Transform = { ...structuredClone(before), position: data(vector(before.position).add(delta)) };
      finite(target.position);
      return [target];
    }
    if (request.operation === "copy_piece" || request.operation === "copy_piece_array") {
      if (!Number.isInteger(request.count) || request.count < 1 || request.count > 100
        || (request.operation === "copy_piece" && request.count !== 1))
        throw new Error("Copy count must be 1–100 (1 for copy_piece)");
      if (!Number.isFinite(request.distance) || request.distance <= 0)
        throw new Error("Distance must be finite and positive in mm");
      const direction = this.worldDisplacement(request.id, request.direction, request.space);
      if (!Number.isFinite(direction.length()) || direction.length() < 1e-12)
        throw new Error("Direction must be nonzero");
      direction.normalize();
      return Array.from({ length: request.count }, (_, i) => {
        const target: Transform = { ...structuredClone(before), position: data(vector(before.position).addScaledVector(direction, request.distance * (i + 1))) };
        finite(target.position);
        return target;
      });
    }
    throw new Error("Unsupported operation (align_piece is not implemented)");
  }

  prepare(request: ChangeRequest): Proposal {
    this.ports.assertReady();
    this.pendingCommands = null;
    const source = this.editable(request.id);
    const before = structuredClone(source.transform);
    const targets = this.targetsForRequest(request, before);
    const proposal: Proposal = { id: crypto.randomUUID(), operation: request.operation,
      sourceId: request.id, before, targets, units: "mm" };
    this.pending.clear();
    this.pending.set(proposal.id, {
      proposal: structuredClone(proposal),
      fingerprint: this.fingerprint(),
      expires: Date.now() + 120000,
    });
    return structuredClone(proposal);
  }

  /** Preview an ordered, bounded sequence without changing any CAD state. */
  prepareCommands(requests: readonly ChangeRequest[]): CommandsProposal {
    this.ports.assertReady();
    if (!Array.isArray(requests) || requests.length < 1 || requests.length > 12)
      throw new Error("Command sequence must contain 1–12 operations");
    const staged = new Map<string, Transform>();
    const steps: Proposal[] = [];
    let copyCount = 0;
    for (const request of requests) {
      const source = this.editable(request.id);
      const before = structuredClone(staged.get(source.id) ?? source.transform);
      const targets = this.targetsForRequest(request, before);
      if (request.operation !== "move_piece") {
        copyCount += targets.length;
        if (copyCount > 100) throw new Error("Command sequence exceeds 100 copies");
      } else staged.set(source.id, structuredClone(targets[0]!));
      steps.push({
        id: crypto.randomUUID(), operation: request.operation,
        sourceId: source.id, before, targets, units: "mm",
      });
    }
    const proposal: CommandsProposal = {
      id: crypto.randomUUID(), operation: "commands", steps, copyCount, units: "mm",
    };
    this.pending.clear();
    this.pendingCommands = {
      proposal: structuredClone(proposal),
      fingerprint: this.fingerprint(),
      expires: Date.now() + 120000,
    };
    return structuredClone(proposal);
  }

  /**
   * A batch is a single undoable history entry. The complete plan is
   * preflighted before mutation, with compensation if a write fails.
   */
  confirmCommands(proposalId: string) {
    this.ports.assertReady();
    const pending = this.pendingCommands;
    this.pendingCommands = null; // One-shot even when approval/validation fails.
    if (!pending || pending.proposal.id !== proposalId || pending.expires < Date.now())
      throw new Error("Command proposal missing or expired; prepare again");
    if (pending.fingerprint !== this.fingerprint())
      throw new Error("Model changed; prepare commands again");
    const proposal = pending.proposal;
    const selected = [...this.ports.getSelection()];
    const before = new Map<string, Transform>();
    const after = new Map<string, Transform>();
    const copyRecords: PieceInstance[] = [];
    for (const step of proposal.steps) {
      const source = this.editable(step.sourceId);
      if (step.operation === "move_piece") {
        if (!before.has(source.id)) before.set(source.id, structuredClone(source.transform));
        after.set(source.id, structuredClone(step.targets[0]!));
      } else {
        for (const target of step.targets) {
          copyRecords.push({
            ...structuredClone(source),
            id: crypto.randomUUID(),
            transform: structuredClone(target),
          });
        }
      }
    }
    const registerCopy = (record: PieceInstance) => {
      this.model.registerPieceInstance({ ...record, tags: [...record.tags] });
    };
    const sync = () => this.ports.sync();
    const original = [...before];
    const destinations = [...after];
    const apply = () => {
      for (const step of proposal.steps) this.editable(step.sourceId);
      if (copyRecords.some(record => this.model.pieceInstances.get(record.id)))
        throw new Error("Copy identifier collision");
      const created: PieceInstance[] = [];
      try {
        for (const [id, transform] of destinations)
          this.model.pieceInstances.updateTransform(id, transform);
        for (const record of copyRecords) {
          registerCopy(record);
          created.push(record);
        }
        sync();
      } catch (error) {
        // Partial writes must not produce a history entry.
        for (const record of created.reverse()) this.model.removePieceInstance(record.id);
        for (const [id, transform] of original)
          this.model.pieceInstances.updateTransform(id, transform);
        sync();
        this.ports.setSelection(selected);
        throw error;
      }
    };
    const revert = () => {
      for (const [id] of original) this.editable(id);
      for (const record of copyRecords) this.editable(record.id);
      const removed: PieceInstance[] = [];
      try {
        for (const record of [...copyRecords].reverse()) {
          this.model.removePieceInstance(record.id);
          removed.push(record);
        }
        for (const [id, transform] of original)
          this.model.pieceInstances.updateTransform(id, transform);
        sync();
        this.ports.setSelection(selected);
      } catch (error) {
        // A failed undo must retain its history entry and restore the applied batch.
        for (const [id, transform] of destinations)
          this.model.pieceInstances.updateTransform(id, transform);
        for (const record of removed.reverse())
          if (!this.model.pieceInstances.get(record.id)) registerCopy(record);
        sync();
        throw error;
      }
    };
    try {
      apply();
      this.history.recordOperation("commands_batch", revert, apply);
      this.log("commands_batch", true);
      return {
        affectedIds: [...new Set([...after.keys(), ...copyRecords.map(r => r.id)])],
        movedIds: [...after.keys()],
        createdIds: copyRecords.map(r => r.id),
        operationCount: proposal.steps.length,
      };
    } catch (error) {
      this.log("commands_batch", false, String(error));
      throw error;
    }
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
  undo() { this.ports.assertReady(); this.pending.clear(); this.pendingCommands = null; const changed = this.history.undo(); this.log("undo", changed); return { changed }; }
  redo() { this.ports.assertReady(); this.pending.clear(); this.pendingCommands = null; const changed = this.history.redo(); this.log("redo", changed); return { changed }; }
}
