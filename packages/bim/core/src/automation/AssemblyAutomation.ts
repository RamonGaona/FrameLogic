import { Vector3 } from "three";
import type { Assembly, DesignModel, PieceInstance, PieceVector3Data } from "@framelogic/domain";
import type { CadHistoryController } from "../interaction/CadHistoryController";
import { createAssemblyCopies, independentCopyTags, planAssemblyCopy } from "../interaction/AssemblyCopyStructure";
import type { OperationPorts } from "./ModelOperations";

type Vec = PieceVector3Data;
type Transform = PieceInstance["transform"];
export type AssemblyChangeRequest =
  | { operation: "move_assembly"; id: string; space: "world"; displacement: Vec }
  | { operation: "copy_assembly" | "copy_assembly_array"; id: string; space: "world"; displacement: Vec; count: number };

export interface AssemblyProposal {
  readonly id: string;
  readonly operation: AssemblyChangeRequest["operation"];
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly pieceCount: number;
  readonly subassemblyCount: number;
  readonly copyCount: number;
  readonly displacement: Vec;
  readonly previewPositions: readonly { pieceId: string; from: Vec; to: Vec }[];
  readonly units: "mm";
  readonly expiresAt: number;
}

interface Pending {
  readonly proposal: AssemblyProposal;
  readonly request: AssemblyChangeRequest;
  readonly fingerprint: string;
  readonly before: readonly { id: string; transform: Transform }[];
}

/**
 * The same domain transaction is called by the local chat and remote MCP.
 * Unlike a visual gizmo, commands are deterministic world-space translations.
 * The full nested tree is copied with the existing Ctrl+gizmo copy planner.
 */
export class AssemblyAutomation {
  private pending: Pending | null = null;

  invalidate(): void { this.pending = null; }

  private readonly model: DesignModel;
  private readonly history: CadHistoryController;
  private readonly ports: OperationPorts;

  constructor(
    model: DesignModel,
    history: CadHistoryController,
    ports: OperationPorts,
  ) {
    this.model = model;
    this.history = history;
    this.ports = ports;
  }

  private snapshot(): string {
    return JSON.stringify([
      this.model.pieceInstances.getAll(),
      this.model.assemblies.getAll(),
      this.model.pieceDefinitions.getAll(),
      this.model.layers.getAll(),
      this.ports.getSelection(),
      this.ports.getSelectedAssemblyIds?.() ?? [],
    ]);
  }

  private members(id: string) {
    const assembly = this.model.assemblies.get(id);
    if (!assembly) throw new Error("El ensamble no existe.");
    if (this.model.isAssemblyLocked(id)) throw new Error("El ensamble está bloqueado.");
    const ids = this.model.getAssemblyPieceIdsDeep(id);
    if (!ids.length) throw new Error("El ensamble no contiene piezas para mover o copiar.");
    if (ids.length !== new Set(ids).size) throw new Error("El ensamble contiene piezas duplicadas.");
    for (const pieceId of ids) {
      if (this.model.isPieceLocked(pieceId)) {
        throw new Error("Una pieza o subensamble está bloqueado.");
      }
    }
    return { assembly, ids };
  }

  listAssemblies(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("El límite debe estar entre 1 y 100.");
    const all = this.model.assemblies.getAll();
    return {
      total: all.length,
      truncated: all.length > limit,
      assemblies: all.slice(0, limit).map(assembly => ({
        id: assembly.id,
        name: assembly.name,
        parentAssemblyId: assembly.parentAssemblyId ?? null,
        childAssemblyIds: this.model.getAssemblyChildren(assembly.id).map(child => child.id),
        directPieceIds: [...assembly.pieceInstanceIds],
        pieceCount: this.model.getAssemblyPieceIdsDeep(assembly.id).length,
        locked: this.model.isAssemblyLocked(assembly.id),
      })),
    };
  }

  getSelectionContext() {
    const pieceIds = [...new Set(this.ports.getSelection())]
      .filter(id => this.model.pieceInstances.get(id));
    const assemblyIds = [...new Set(this.ports.getSelectedAssemblyIds?.() ?? [])]
      .filter(id => this.model.assemblies.get(id));
    const covered = new Set<string>();
    for (const id of assemblyIds) {
      for (const pieceId of this.model.getAssemblyPieceIdsDeep(id)) covered.add(pieceId);
    }
    return {
      pieceIds,
      assemblyIds,
      loosePieceIds: pieceIds.filter(id => !covered.has(id)),
      // Assembly identity comes from INSTANCIAS, not from guessing based on pieces.
      requiresExplicitAssemblySelection: !assemblyIds.length && pieceIds.length > 0,
    };
  }

  selectAssembly(id: string) {
    this.ports.assertReady();
    const assembly = this.model.assemblies.get(id);
    if (!assembly) throw new Error("El ensamble no existe.");
    const ids = this.model.getAssemblyPieceIdsDeep(id);
    if (!this.ports.setSelectedAssemblyIds)
      throw new Error("La interfaz no permite seleccionar ensambles explícitos.");
    this.ports.setSelection(ids);
    this.ports.setSelectedAssemblyIds([id]);
    return { assemblyId: id, selectedPieceIds: ids };
  }

  prepare(request: AssemblyChangeRequest): AssemblyProposal {
    this.ports.assertReady();
    this.pending = null;
    if (request.space !== "world")
      throw new Error("Los ensambles todavía no tienen un marco local independiente. Usa ejes globales XYZ.");
    const { assembly, ids } = this.members(request.id);
    const d = request.displacement;
    if (!d || ![d.x, d.y, d.z].every(Number.isFinite)
      || Math.hypot(d.x, d.y, d.z) < 1e-9)
      throw new Error("El desplazamiento XYZ debe ser finito y distinto de cero (mm).");
    const copy = request.operation !== "move_assembly";
    const count = copy ? request.count : 0;
    if (copy && (!Number.isInteger(count) || count < 1 || count > 20
      || (request.operation === "copy_assembly" && count !== 1)))
      throw new Error("Se admiten 1–20 copias (1 para copy_assembly).");
    const subtree = [assembly.id, ...this.model.getAssemblyDescendantIds(assembly.id)];
    if (copy && (ids.length * count > 1000 || subtree.length * count > 500))
      throw new Error("La copia excede 1000 piezas o 500 nodos de ensamble por operación.");
    if (copy) planAssemblyCopy(this.model, ids, [assembly.id]);

    const before = ids.map(id => {
      const piece = this.model.pieceInstances.get(id);
      if (!piece) throw new Error("Una pieza del ensamble ya no existe.");
      for (const vector of [piece.transform.position, piece.transform.rotation])
        if (![vector.x, vector.y, vector.z].every(Number.isFinite))
          throw new Error("El ensamble contiene coordenadas no válidas.");
      const target = {
        x: piece.transform.position.x + d.x * (copy ? count : 1),
        y: piece.transform.position.y + d.y * (copy ? count : 1),
        z: piece.transform.position.z + d.z * (copy ? count : 1),
      };
      if (![target.x, target.y, target.z].every(Number.isFinite))
        throw new Error("Las coordenadas de destino exceden el rango válido.");
      return { id, transform: structuredClone(piece.transform) };
    });
    const previewPositions = before.slice(0, 20).map(({ id, transform }) => ({
      pieceId: id,
      from: { ...transform.position },
      to: {
        x: transform.position.x + d.x,
        y: transform.position.y + d.y,
        z: transform.position.z + d.z,
      },
    }));
    for (const entry of previewPositions)
      if (![entry.to.x, entry.to.y, entry.to.z].every(Number.isFinite))
        throw new Error("El resultado excede las coordenadas válidas.");
    const proposal: AssemblyProposal = {
      id: crypto.randomUUID(), operation: request.operation,
      assemblyId: assembly.id, assemblyName: assembly.name,
      pieceCount: ids.length, subassemblyCount: subtree.length - 1,
      copyCount: count, displacement: { ...d },
      previewPositions, units: "mm", expiresAt: Date.now() + 120000,
    };
    this.pending = { proposal: structuredClone(proposal),
      request: structuredClone(request), fingerprint: this.snapshot(), before };
    return structuredClone(proposal);
  }

  confirm(proposalId: string) {
    this.ports.assertReady();
    const pending = this.pending;
    this.pending = null; // One-shot; failed or rejected approvals cannot be replayed.
    if (!pending || pending.proposal.id !== proposalId || Date.now() > pending.proposal.expiresAt)
      throw new Error("Propuesta inexistente o caducada. Vuelve a prepararla.");
    if (pending.fingerprint !== this.snapshot())
      throw new Error("El modelo cambió. Prepara otra propuesta.");
    const { assembly, ids } = this.members(pending.request.id);
    if (ids.join("\0") !== pending.before.map(entry => entry.id).join("\0"))
      throw new Error("Los componentes del ensamble han cambiado.");
    const { displacement: d } = pending.request;
    const selection = [...this.ports.getSelection()];
    const selectedAssemblies = [...(this.ports.getSelectedAssemblyIds?.() ?? [])];
    const restoreSelection = () => {
      this.ports.setSelection(selection);
      this.ports.setSelectedAssemblyIds?.(selectedAssemblies);
    };
    const sourceSelection = () => {
      this.ports.setSelection(ids);
      this.ports.setSelectedAssemblyIds?.([assembly.id]);
    };
    const delta = new Vector3(d.x, d.y, d.z);
    const translated = (t: Transform, multiplier: number): Transform => {
      const p = new Vector3(t.position.x, t.position.y, t.position.z)
        .addScaledVector(delta, multiplier);
      if (![p.x, p.y, p.z].every(Number.isFinite))
        throw new Error("Coordenadas de destino fuera de rango.");
      return { position: { x: p.x, y: p.y, z: p.z },
        rotation: { ...t.rotation } };
    };

    if (pending.request.operation === "move_assembly") {
      const positions = pending.before.map(entry => ({
        ...entry, after: translated(entry.transform, 1),
      }));
      const set = (useAfter: boolean) => {
        this.ports.assertReady();
        this.members(assembly.id);
        const written: typeof positions = [];
        try {
          for (const entry of positions) {
            this.model.pieceInstances.updateTransform(
              entry.id, useAfter ? entry.after : entry.transform);
            written.push(entry);
          }
          this.ports.sync();
          if (useAfter) sourceSelection();
          else restoreSelection();
        } catch (error) {
          for (const entry of written.reverse()) {
            this.model.pieceInstances.updateTransform(
              entry.id, useAfter ? entry.transform : entry.after);
          }
          this.ports.sync();
          restoreSelection();
          throw error;
        }
      };
      set(true);
      this.history.recordOperation("MOVE_ASSEMBLY", () => set(false), () => set(true));
      return {
        operation: "move_assembly",
        affectedIds: ids,
        assemblyIds: [assembly.id],
        createdIds: [] as string[],
        createdAssemblyIds: [] as string[],
        rootAssemblyIds: [] as string[],
      };
    }

    const plan = planAssemblyCopy(this.model, ids, [assembly.id]);
    const copies: PieceInstance[] = [];
    const copiesOfAssemblies: Assembly[] = [];
    const copyRoots: string[] = [];
    const source = pending.before.map(entry => {
      const piece = this.model.pieceInstances.get(entry.id);
      if (!piece) throw new Error("Una pieza de origen no existe.");
      return piece;
    });
    const count = pending.request.count;
    const apply = () => {
      this.ports.assertReady();
      this.members(assembly.id);
      const createdPieces: string[] = [];
      const createdAssemblies: string[] = [];
      try {
        if (copies.length > 0) {
          for (const record of copies) {
            if (this.model.pieceInstances.get(record.id)) throw new Error("ID de copia duplicado.");
            this.model.registerPieceInstance({ ...record, tags: [...record.tags] });
            createdPieces.push(record.id);
          }
          for (const record of copiesOfAssemblies) {
            if (this.model.assemblies.get(record.id)) throw new Error("ID de ensamble duplicado.");
            this.model.assemblies.register({
              ...record, tags: [...record.tags],
              pieceInstanceIds: [...record.pieceInstanceIds],
            });
            createdAssemblies.push(record.id);
          }
        } else {
          for (let i = 1; i <= count; i++) {
            const mapping = new Map<string, string>();
            for (const piece of source) {
              const record = this.model.registerPieceInstance({
                definitionId: piece.definitionId,
                name: piece.name ? piece.name + " (copia)" : undefined,
                layerId: piece.layerId,
                tags: independentCopyTags(piece.tags),
                transform: translated(piece.transform, i),
              });
              createdPieces.push(record.id);
              copies.push(structuredClone(record));
              mapping.set(piece.id, record.id);
            }
            const hierarchy = createAssemblyCopies(this.model, plan, mapping);
            for (const record of hierarchy.records) {
              createdAssemblies.push(record.id);
              copiesOfAssemblies.push(structuredClone(record));
            }
            copyRoots.push(...hierarchy.rootIds);
          }
        }
        this.ports.sync();
        this.ports.setSelection(copies.map(piece => piece.id));
        this.ports.setSelectedAssemblyIds?.(copyRoots);
      } catch (error) {
        for (const id of createdAssemblies.reverse()) this.model.assemblies.remove(id);
        for (const id of createdPieces.reverse()) this.model.pieceInstances.remove(id);
        this.ports.sync();
        restoreSelection();
        throw error;
      }
    };
    const revert = () => {
      this.ports.assertReady();
      // Do not delete user-added components or a protected copy silently.
      for (const record of copiesOfAssemblies) {
        const current = this.model.assemblies.get(record.id);
        if (!current || this.model.isAssemblyLocked(record.id)
          || JSON.stringify(current.pieceInstanceIds) !== JSON.stringify(record.pieceInstanceIds)
          || current.parentAssemblyId !== record.parentAssemblyId)
          throw new Error("La copia del ensamble cambió o está bloqueada; no es seguro deshacer.");
      }
      for (const piece of copies)
        if (this.model.isPieceLocked(piece.id)) throw new Error("La copia contiene piezas bloqueadas.");
      const expected = new Set(copiesOfAssemblies.map(record => record.id));
      for (const record of copiesOfAssemblies)
        if (this.model.getAssemblyChildren(record.id).some(child => !expected.has(child.id)))
          throw new Error("La copia tiene subensambles externos; no se puede deshacer.");
      for (const record of [...copiesOfAssemblies].reverse()) this.model.assemblies.remove(record.id);
      for (const piece of copies) this.model.pieceInstances.remove(piece.id);
      this.ports.sync();
      restoreSelection();
    };
    apply();
    this.history.recordOperation("COPY_ASSEMBLY", revert, apply);
    return {
      operation: pending.request.operation,
      affectedIds: copies.map(piece => piece.id),
      createdIds: copies.map(piece => piece.id),
      createdAssemblyIds: copiesOfAssemblies.map(record => record.id),
      rootAssemblyIds: [...copyRoots],
      assemblyIds: [...copyRoots],
    };
  }
}
