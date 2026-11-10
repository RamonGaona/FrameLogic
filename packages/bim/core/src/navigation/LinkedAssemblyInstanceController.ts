import * as THREE from "three";

import type {
  Assembly,
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  InstanceTreeController,
} from "./InstanceTreeController";

import {
  getLinkedAssemblyComponentId,
  getLinkedAssemblyId,
  setLinkedAssemblyMetadata,
} from "./LinkedAssemblyMetadata";


interface Options {
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
  readonly instanceTree: InstanceTreeController;
}

interface ComponentSnapshot {
  readonly componentId: string;
  readonly pieceId: string;
  readonly definitionId: string;
  readonly name?: string;
  readonly layerId: string;
  readonly tags: readonly string[];
  readonly transform: PieceInstance["transform"];
  readonly transformKey: string;
}

interface AssemblySnapshot {
  readonly assemblyId: string;
  readonly linkId: string;
  readonly name: string;
  readonly components: ReadonlyMap<string, ComponentSnapshot>;
}

/**
 * Convierte las copias de un ensamble en colocaciones enlazadas.
 *
 * Cada colocación conserva PieceInstance independientes para poder moverse en
 * el espacio de forma autónoma. Los tags internos relacionan componentes
 * equivalentes entre colocaciones. De esta manera:
 *
 * - mover todo un ensamble cambia solo esa colocación;
 * - mover/editar una pieza dentro del ensamble actualiza la misma pieza en las
 *   demás colocaciones;
 * - agregar o eliminar componentes se replica;
 * - renombrar el ensamble se refleja en todas sus colocaciones.
 *
 * Los metadatos viven en PieceInstance.tags, por lo que sobreviven al guardado
 * del proyecto sin ampliar el formato .flproject.
 */
export class LinkedAssemblyInstanceController {
  private readonly options: Options;
  private readonly timer: number;
  private readonly knownAssemblyLinks = new Map<string, string>();
  private snapshots = new Map<string, AssemblySnapshot>();
  private syncing = false;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;

    this.adoptLegacyCopies();
    this.normalizeLinkedMetadata();
    this.snapshots = this.captureSnapshots();

    this.timer = window.setInterval(
      () => this.sync(),
      220,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.snapshots.clear();
    this.knownAssemblyLinks.clear();
  }

  private sync(): void {
    if (this.disposed || this.syncing) return;
    this.syncing = true;

    try {
      let changed = false;

      changed = this.adoptLegacyCopies() || changed;
      changed = this.normalizeLinkedMetadata() || changed;

      const current = this.captureSnapshots();
      const groups = this.groupByLink(current);

      for (const group of groups.values()) {
        if (group.length < 2) continue;

        if (this.syncComposition(group)) {
          changed = true;
          continue;
        }

        changed = this.syncAssemblyName(group) || changed;
        changed = this.syncComponentNames(group) || changed;
        changed = this.syncInternalTransforms(group) || changed;
      }

      if (changed) {
        this.options.designScene.sync();
        this.options.instanceTree.refresh();
      }

      this.snapshots = this.captureSnapshots();
    }
    finally {
      this.syncing = false;
    }
  }

  /**
   * Migra las copias creadas por el comportamiento anterior:
   * "Ensamble X copia" -> otra colocación enlazada de "Ensamble X".
   */
  private adoptLegacyCopies(): boolean {
    const assemblies = this.options.designModel.assemblies.getAll();
    let changed = false;

    for (const copy of assemblies) {
      if (this.options.designModel.getAssemblyChildren(copy.id).length > 0) continue;
      const match = copy.name.match(/^(.*) copia(?: \d+)?$/i);
      if (!match) continue;

      const baseName = match[1]?.trim();
      if (!baseName) continue;

      const base = assemblies.find((candidate) =>
        candidate.id !== copy.id
        && candidate.name === baseName,
      );
      if (!base) continue;
      if (this.options.designModel.getAssemblyChildren(base.id).length > 0) continue;

      const basePieces = this.getPieces(base);
      const copyPieces = this.getPieces(copy);
      if (
        basePieces.length < 1
        || basePieces.length !== copyPieces.length
      ) {
        continue;
      }

      const sameDefinitions = basePieces.every(
        (piece, index) =>
          piece.definitionId === copyPieces[index]?.definitionId,
      );
      if (!sameDefinitions) continue;

      const existingLink =
        this.getAssemblyLinkId(base)
        ?? this.getAssemblyLinkId(copy)
        ?? crypto.randomUUID();

      for (let index = 0; index < basePieces.length; index += 1) {
        const basePiece = basePieces[index];
        const copyPiece = copyPieces[index];
        if (!basePiece || !copyPiece) continue;

        const componentId =
          getLinkedAssemblyComponentId(basePiece.tags)
          ?? getLinkedAssemblyComponentId(copyPiece.tags)
          ?? crypto.randomUUID();

        changed = this.setPieceMetadata(
          basePiece,
          existingLink,
          componentId,
        ) || changed;
        changed = this.setPieceMetadata(
          copyPiece,
          existingLink,
          componentId,
        ) || changed;
      }

      this.knownAssemblyLinks.set(base.id, existingLink);
      this.knownAssemblyLinks.set(copy.id, existingLink);

      if (copy.name !== base.name) {
        this.options.designModel.assemblies.updateName(
          copy.id,
          base.name,
        );
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Si un usuario agrega una pieza a una colocación enlazada, la incorpora al
   * mismo vínculo y le asigna un componentId nuevo. Si una pieza proviene de
   * otro ensamble enlazado, adopta el vínculo del ensamble destino.
   */
  private normalizeLinkedMetadata(): boolean {
    let changed = false;

    for (const assembly of this.options.designModel.assemblies.getAll()) {
      // Linked composition assumes a flat list of components. Leaf assemblies
      // remain linked; true parents are not silently treated as flat copies.
      if (this.options.designModel.getAssemblyChildren(assembly.id).length > 0) continue;
      const pieces = this.getPieces(assembly);
      if (pieces.length < 1) continue;

      const linkId =
        this.getDominantLinkId(pieces)
        ?? this.knownAssemblyLinks.get(assembly.id)
        ?? null;
      if (!linkId) continue;

      this.knownAssemblyLinks.set(assembly.id, linkId);

      for (const piece of pieces) {
        const componentId =
          getLinkedAssemblyComponentId(piece.tags)
          ?? crypto.randomUUID();
        changed = this.setPieceMetadata(
          piece,
          linkId,
          componentId,
        ) || changed;
      }
    }

    return changed;
  }

  private syncComposition(
    group: readonly AssemblySnapshot[],
  ): boolean {
    for (const source of group) {
      const previous = this.snapshots.get(source.assemblyId);
      if (!previous || previous.linkId !== source.linkId) continue;

      const added = Array.from(source.components.keys())
        .filter((componentId) => !previous.components.has(componentId));
      const removed = Array.from(previous.components.keys())
        .filter((componentId) => !source.components.has(componentId));

      if (added.length < 1 && removed.length < 1) continue;

      let changed = false;

      for (const target of group) {
        if (target.assemblyId === source.assemblyId) continue;

        for (const componentId of removed) {
          const targetComponent = target.components.get(componentId);
          if (!targetComponent) continue;
          this.detachAndRemovePiece(targetComponent.pieceId);
          changed = true;
        }

        for (const componentId of added) {
          if (target.components.has(componentId)) continue;
          const sourceComponent = source.components.get(componentId);
          if (!sourceComponent) continue;

          const transform = this.mapTransformToTarget(
            source,
            target,
            sourceComponent,
            new Set(added),
          );
          const created = this.options.designModel.registerPieceInstance({
            name: sourceComponent.name,
            definitionId: sourceComponent.definitionId,
            layerId: sourceComponent.layerId,
            transform,
            tags: setLinkedAssemblyMetadata(
              sourceComponent.tags,
              source.linkId,
              componentId,
            ),
          });

          const targetAssembly =
            this.options.designModel.assemblies.get(target.assemblyId);
          if (targetAssembly) {
            this.options.designModel.assemblies.updatePieceInstanceIds(
              target.assemblyId,
              [
                ...targetAssembly.pieceInstanceIds,
                created.id,
              ],
            );
          }
          changed = true;
        }
      }

      return changed;
    }

    return false;
  }

  private syncAssemblyName(
    group: readonly AssemblySnapshot[],
  ): boolean {
    const source = group.find((state) => {
      const previous = this.snapshots.get(state.assemblyId);
      return previous
        && previous.linkId === state.linkId
        && previous.name !== state.name;
    });
    if (!source) return false;

    let changed = false;
    for (const target of group) {
      if (target.name === source.name) continue;
      this.options.designModel.assemblies.updateName(
        target.assemblyId,
        source.name,
      );
      changed = true;
    }
    return changed;
  }

  private syncComponentNames(
    group: readonly AssemblySnapshot[],
  ): boolean {
    let changed = false;

    for (const source of group) {
      const previous = this.snapshots.get(source.assemblyId);
      if (!previous || previous.linkId !== source.linkId) continue;

      for (const [componentId, component] of source.components) {
        const before = previous.components.get(componentId);
        if (!before || before.name === component.name) continue;

        for (const target of group) {
          if (target.assemblyId === source.assemblyId) continue;
          const targetComponent = target.components.get(componentId);
          if (!targetComponent || targetComponent.name === component.name) continue;
          this.options.designModel.pieceInstances.updateName(
            targetComponent.pieceId,
            component.name,
          );
          changed = true;
        }
      }
    }

    return changed;
  }

  private syncInternalTransforms(
    group: readonly AssemblySnapshot[],
  ): boolean {
    const selected = new Set(
      this.options.designSelection.getSelectedIds(),
    );

    for (const source of group) {
      const previous = this.snapshots.get(source.assemblyId);
      if (!previous || previous.linkId !== source.linkId) continue;

      const changedIds = Array.from(source.components.keys())
        .filter((componentId) => {
          const current = source.components.get(componentId);
          const before = previous.components.get(componentId);
          return current
            && before
            && current.transformKey !== before.transformKey;
        });
      if (changedIds.length < 1) continue;

      const allMembersChanged =
        changedIds.length === source.components.size;
      const allMembersSelected =
        source.components.size > 0
        && Array.from(source.components.values()).every((component) =>
          selected.has(component.pieceId),
        );

      /*
       * Un cambio rígido de todos los miembros corresponde a mover/rotar la
       * colocación del ensamble, no a editar su definición compartida.
       */
      if (allMembersChanged || allMembersSelected) {
        continue;
      }

      const changedSet = new Set(changedIds);
      let changed = false;

      for (const componentId of changedIds) {
        const sourceComponent = source.components.get(componentId);
        if (!sourceComponent) continue;

        for (const target of group) {
          if (target.assemblyId === source.assemblyId) continue;
          const targetComponent = target.components.get(componentId);
          if (!targetComponent) continue;

          const mapped = this.mapTransformToTarget(
            source,
            target,
            sourceComponent,
            changedSet,
          );
          this.options.designModel.pieceInstances.updateTransform(
            targetComponent.pieceId,
            mapped,
          );
          changed = true;
        }
      }

      return changed;
    }

    return false;
  }

  private mapTransformToTarget(
    source: AssemblySnapshot,
    target: AssemblySnapshot,
    sourceComponent: ComponentSnapshot,
    excludedAnchorIds: ReadonlySet<string>,
  ): PieceInstance["transform"] {
    const anchorId = Array.from(source.components.keys())
      .find((componentId) =>
        componentId !== sourceComponent.componentId
        && !excludedAnchorIds.has(componentId)
        && target.components.has(componentId),
      )
      ?? Array.from(source.components.keys())
        .find((componentId) =>
          componentId !== sourceComponent.componentId
          && target.components.has(componentId),
        );

    if (!anchorId) {
      return cloneTransform(sourceComponent.transform);
    }

    const sourceAnchor = source.components.get(anchorId);
    const targetAnchor = target.components.get(anchorId);
    if (!sourceAnchor || !targetAnchor) {
      return cloneTransform(sourceComponent.transform);
    }

    const sourceAnchorMatrix = matrixFromTransform(sourceAnchor.transform);
    const sourceComponentMatrix = matrixFromTransform(sourceComponent.transform);
    const targetAnchorMatrix = matrixFromTransform(targetAnchor.transform);

    const relative = sourceAnchorMatrix
      .clone()
      .invert()
      .multiply(sourceComponentMatrix);
    const targetMatrix = targetAnchorMatrix
      .clone()
      .multiply(relative);

    return transformFromMatrix(targetMatrix);
  }

  private captureSnapshots(): Map<string, AssemblySnapshot> {
    const result = new Map<string, AssemblySnapshot>();

    for (const assembly of this.options.designModel.assemblies.getAll()) {
      // Linked composition assumes a flat list of components. Leaf assemblies
      // remain linked; true parents are not silently treated as flat copies.
      if (this.options.designModel.getAssemblyChildren(assembly.id).length > 0) continue;
      const pieces = this.getPieces(assembly);
      const linkId =
        this.getDominantLinkId(pieces)
        ?? this.knownAssemblyLinks.get(assembly.id)
        ?? null;
      if (!linkId) continue;

      this.knownAssemblyLinks.set(assembly.id, linkId);
      const components = new Map<string, ComponentSnapshot>();

      for (const piece of pieces) {
        if (getLinkedAssemblyId(piece.tags) !== linkId) continue;
        const componentId = getLinkedAssemblyComponentId(piece.tags);
        if (!componentId) continue;

        components.set(
          componentId,
          {
            componentId,
            pieceId: piece.id,
            definitionId: piece.definitionId,
            name: piece.name,
            layerId: piece.layerId,
            tags: [...piece.tags],
            transform: cloneTransform(piece.transform),
            transformKey: transformKey(piece.transform),
          },
        );
      }

      result.set(
        assembly.id,
        {
          assemblyId: assembly.id,
          linkId,
          name: assembly.name,
          components,
        },
      );
    }

    return result;
  }

  private groupByLink(
    snapshots: ReadonlyMap<string, AssemblySnapshot>,
  ): Map<string, AssemblySnapshot[]> {
    const groups = new Map<string, AssemblySnapshot[]>();

    for (const snapshot of snapshots.values()) {
      const group = groups.get(snapshot.linkId) ?? [];
      group.push(snapshot);
      groups.set(snapshot.linkId, group);
    }

    return groups;
  }

  private getAssemblyLinkId(assembly: Assembly): string | null {
    return this.getDominantLinkId(
      this.getPieces(assembly),
    )
      ?? this.knownAssemblyLinks.get(assembly.id)
      ?? null;
  }

  private getDominantLinkId(
    pieces: readonly PieceInstance[],
  ): string | null {
    const counts = new Map<string, number>();

    for (const piece of pieces) {
      const linkId = getLinkedAssemblyId(piece.tags);
      if (!linkId) continue;
      counts.set(linkId, (counts.get(linkId) ?? 0) + 1);
    }

    let best: string | null = null;
    let bestCount = 0;
    for (const [linkId, count] of counts) {
      if (count > bestCount) {
        best = linkId;
        bestCount = count;
      }
    }
    return best;
  }

  private getPieces(assembly: Assembly): PieceInstance[] {
    return assembly.pieceInstanceIds
      .map((id) => this.options.designModel.pieceInstances.get(id))
      .filter((piece): piece is PieceInstance => piece !== undefined);
  }

  private setPieceMetadata(
    piece: PieceInstance,
    linkId: string,
    componentId: string,
  ): boolean {
    if (
      getLinkedAssemblyId(piece.tags) === linkId
      && getLinkedAssemblyComponentId(piece.tags) === componentId
    ) {
      return false;
    }

    this.options.designModel.pieceInstances.updateTags(
      piece.id,
      setLinkedAssemblyMetadata(
        piece.tags,
        linkId,
        componentId,
      ),
    );
    return true;
  }

  private detachAndRemovePiece(pieceId: string): void {
    for (const assembly of this.options.designModel.assemblies
      .findByPieceInstanceId(pieceId)) {
      this.options.designModel.assemblies.updatePieceInstanceIds(
        assembly.id,
        assembly.pieceInstanceIds.filter((id) => id !== pieceId),
      );
    }

    if (this.options.designModel.pieceInstances.get(pieceId)) {
      this.options.designModel.removePieceInstance(pieceId);
    }
  }
}


function matrixFromTransform(
  transform: PieceInstance["transform"],
): THREE.Matrix4 {
  const position = new THREE.Vector3(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  const rotation = new THREE.Euler(
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
    "XYZ",
  );
  const quaternion = new THREE.Quaternion()
    .setFromEuler(rotation);

  return new THREE.Matrix4().compose(
    position,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
}


function transformFromMatrix(
  matrix: THREE.Matrix4,
): PieceInstance["transform"] {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);

  const rotation = new THREE.Euler()
    .setFromQuaternion(quaternion, "XYZ");

  return {
    position: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    rotation: {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
    },
  };
}


function cloneTransform(
  transform: PieceInstance["transform"],
): PieceInstance["transform"] {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
  };
}


function transformKey(
  transform: PieceInstance["transform"],
): string {
  const round = (value: number): number =>
    Math.round(value * 1e9) / 1e9;

  return [
    round(transform.position.x),
    round(transform.position.y),
    round(transform.position.z),
    round(transform.rotation.x),
    round(transform.rotation.y),
    round(transform.rotation.z),
  ].join(":");
}
