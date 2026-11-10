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

import type {
  LinkedAssemblyInstanceController,
} from "./LinkedAssemblyInstanceController";

import {
  LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX,
  LINKED_ASSEMBLY_ID_TAG_PREFIX,
  getLinkedAssemblyComponentId,
  getLinkedAssemblyId,
} from "./LinkedAssemblyMetadata";


interface Options {
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
  readonly instanceTree: InstanceTreeController;
  readonly linkedAssemblies: LinkedAssemblyInstanceController;
}

interface InstanceTreeRuntime {
  contextMenu: HTMLDivElement | null;
  refresh(): void;
  showAssemblyContextMenu(
    x: number,
    y: number,
    assemblyId: string,
  ): void;
}

interface LinkedAssemblyRuntime {
  readonly knownAssemblyLinks: Map<string, string>;
  snapshots: Map<string, unknown>;
  syncing: boolean;
  captureSnapshots(): Map<string, unknown>;
}

interface PieceRegistryRuntime {
  updateTransform(
    id: string,
    transform: PieceInstance["transform"],
  ): PieceInstance | undefined;
}

/**
 * Interacción inmediata para las colocaciones enlazadas de un ensamble.
 *
 * LinkedAssemblyInstanceController conserva la sincronización de composición,
 * nombres y el fallback periódico. Este controlador añade dos comportamientos
 * que deben sentirse instantáneos en CAD:
 *
 * - mover/rotar UNA pieza interna replica inmediatamente la misma edición en
 *   las demás colocaciones del ensamble;
 * - clic derecho sobre el ensamble permite desvincular solo esa colocación.
 *
 * Mover el ensamble completo sigue siendo independiente: si todos sus miembros
 * están seleccionados, no propagamos sus transforms a las demás colocaciones.
 */
export class LinkedAssemblyInteractionController {
  private readonly options: Options;
  private readonly treeRuntime: InstanceTreeRuntime;
  private readonly linkedRuntime: LinkedAssemblyRuntime;
  private readonly pieceRegistry: PieceRegistryRuntime;
  private readonly baseShowAssemblyContextMenu:
    InstanceTreeRuntime["showAssemblyContextMenu"];
  private readonly baseUpdateTransform:
    PieceRegistryRuntime["updateTransform"];
  private propagating = false;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.treeRuntime =
      options.instanceTree as unknown as InstanceTreeRuntime;
    this.linkedRuntime =
      options.linkedAssemblies as unknown as LinkedAssemblyRuntime;
    this.pieceRegistry =
      options.designModel.pieceInstances as unknown as PieceRegistryRuntime;

    this.baseShowAssemblyContextMenu =
      this.treeRuntime.showAssemblyContextMenu.bind(this.treeRuntime);
    this.treeRuntime.showAssemblyContextMenu = (
      x: number,
      y: number,
      assemblyId: string,
    ): void => {
      this.baseShowAssemblyContextMenu(x, y, assemblyId);
      this.appendUnlinkAction(assemblyId);
    };

    this.baseUpdateTransform =
      this.pieceRegistry.updateTransform.bind(this.pieceRegistry);
    this.pieceRegistry.updateTransform = (
      id: string,
      transform: PieceInstance["transform"],
    ): PieceInstance | undefined => {
      const updated = this.baseUpdateTransform(id, transform);
      if (
        !updated
        || this.propagating
        || this.linkedRuntime.syncing
      ) {
        return updated;
      }

      this.propagateInternalTransform(id);
      return updated;
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.treeRuntime.showAssemblyContextMenu =
      this.baseShowAssemblyContextMenu;
    this.pieceRegistry.updateTransform =
      this.baseUpdateTransform;
  }

  private appendUnlinkAction(assemblyId: string): void {
    if (!this.isLinkedAssembly(assemblyId)) return;

    const menu = this.treeRuntime.contextMenu;
    if (!menu) return;

    const separator = document.createElement("div");
    Object.assign(separator.style, {
      height: "1px",
      margin: "4px 2px",
      background: "rgba(255,255,255,0.10)",
    });

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Desvincular ensamble";
    Object.assign(button.style, {
      display: "block",
      width: "100%",
      padding: "6px 8px",
      border: "0",
      borderRadius: "3px",
      background: "transparent",
      color: "#f0d8ad",
      textAlign: "left",
      cursor: "pointer",
      font: "12px system-ui, sans-serif",
    });
    button.addEventListener("mouseenter", () => {
      button.style.background = "rgba(230,180,95,0.14)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.unlinkAssembly(assemblyId);
      menu.remove();
      if (this.treeRuntime.contextMenu === menu) {
        this.treeRuntime.contextMenu = null;
      }
    });

    menu.prepend(separator);
    menu.prepend(button);
  }

  private isLinkedAssembly(assemblyId: string): boolean {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return false;
    const linkId = this.getAssemblyLinkId(assembly);
    if (!linkId) return false;

    let count = 0;
    for (const candidate of this.options.designModel.assemblies.getAll()) {
      if (this.getAssemblyLinkId(candidate) === linkId) {
        count += 1;
        if (count > 1) return true;
      }
    }
    return false;
  }

  private unlinkAssembly(assemblyId: string): boolean {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return false;
    const linkId = this.getAssemblyLinkId(assembly);
    if (!linkId) return false;

    for (const pieceId of assembly.pieceInstanceIds) {
      const piece = this.options.designModel.pieceInstances.get(pieceId);
      if (!piece || getLinkedAssemblyId(piece.tags) !== linkId) continue;
      this.options.designModel.pieceInstances.updateTags(
        piece.id,
        clearLinkedMetadata(piece.tags),
      );
    }

    /*
     * El controlador periódico recuerda el link por assembly.id para poder
     * normalizar componentes nuevos. Al desvincular hay que borrar también
     * esa memoria; de lo contrario volvería a escribir los tags en el próximo
     * tick.
     */
    this.linkedRuntime.knownAssemblyLinks.delete(assemblyId);
    this.linkedRuntime.snapshots.delete(assemblyId);

    this.options.designModel.assemblies.updateName(
      assemblyId,
      this.nextDetachedName(assembly.name),
    );
    this.treeRuntime.refresh();
    return true;
  }

  private nextDetachedName(baseName: string): string {
    const suffixPattern = /\s+desvinculado(?:\s+\d+)?$/i;
    const root = baseName.replace(suffixPattern, "").trim() || baseName;
    const existing = new Set(
      this.options.designModel.assemblies
        .getAll()
        .map((assembly) => assembly.name),
    );

    const first = `${root} desvinculado`;
    if (!existing.has(first)) return first;

    let index = 2;
    while (existing.has(`${root} desvinculado ${index}`)) {
      index += 1;
    }
    return `${root} desvinculado ${index}`;
  }

  private propagateInternalTransform(pieceId: string): void {
    const sourcePiece =
      this.options.designModel.pieceInstances.get(pieceId);
    if (!sourcePiece) return;

    const linkId = getLinkedAssemblyId(sourcePiece.tags);
    const componentId =
      getLinkedAssemblyComponentId(sourcePiece.tags);
    if (!linkId || !componentId) return;

    const sourceAssembly =
      this.options.designModel.assemblies
        .findByPieceInstanceId(pieceId)
        .find((assembly) => this.getAssemblyLinkId(assembly) === linkId);
    if (!sourceAssembly) return;

    const sourcePieces = this.getPieces(sourceAssembly);
    const selected = new Set(
      this.options.designSelection.getSelectedIds(),
    );
    const movingWholeAssembly =
      sourcePieces.length > 0
      && sourcePieces.every((piece) => selected.has(piece.id));
    if (movingWholeAssembly) return;

    const sourceByComponent = this.byComponent(sourcePieces, linkId);
    const sourceComponent = sourceByComponent.get(componentId);
    if (!sourceComponent) return;

    const excludedAnchors = new Set<string>();
    for (const piece of sourcePieces) {
      if (!selected.has(piece.id)) continue;
      const id = getLinkedAssemblyComponentId(piece.tags);
      if (id) excludedAnchors.add(id);
    }

    let changed = false;
    this.propagating = true;
    try {
      for (const targetAssembly of this.options.designModel.assemblies.getAll()) {
        if (targetAssembly.id === sourceAssembly.id) continue;
        if (this.getAssemblyLinkId(targetAssembly) !== linkId) continue;

        const targetPieces = this.getPieces(targetAssembly);
        const targetByComponent = this.byComponent(targetPieces, linkId);
        const targetComponent = targetByComponent.get(componentId);
        if (!targetComponent) continue;

        const mapped = this.mapTransform(
          sourceByComponent,
          targetByComponent,
          componentId,
          excludedAnchors,
        );
        if (!mapped) continue;

        this.baseUpdateTransform(targetComponent.id, mapped);
        this.updateVisual(targetComponent.id, mapped);
        changed = true;
      }
    }
    finally {
      this.propagating = false;
    }

    if (changed) {
      /* Evita que el sincronizador periódico interprete la réplica inmediata
       * como una segunda edición en sentido contrario. */
      this.linkedRuntime.snapshots =
        this.linkedRuntime.captureSnapshots();
    }
  }

  private mapTransform(
    source: ReadonlyMap<string, PieceInstance>,
    target: ReadonlyMap<string, PieceInstance>,
    componentId: string,
    excludedAnchors: ReadonlySet<string>,
  ): PieceInstance["transform"] | null {
    const sourceComponent = source.get(componentId);
    if (!sourceComponent) return null;

    const anchorId = Array.from(source.keys()).find((id) =>
      id !== componentId
      && !excludedAnchors.has(id)
      && target.has(id),
    ) ?? Array.from(source.keys()).find((id) =>
      id !== componentId
      && target.has(id),
    );

    if (!anchorId) {
      return cloneTransform(sourceComponent.transform);
    }

    const sourceAnchor = source.get(anchorId);
    const targetAnchor = target.get(anchorId);
    if (!sourceAnchor || !targetAnchor) return null;

    const relative = matrixFromTransform(sourceAnchor.transform)
      .invert()
      .multiply(matrixFromTransform(sourceComponent.transform));
    const targetMatrix = matrixFromTransform(targetAnchor.transform)
      .multiply(relative);
    return transformFromMatrix(targetMatrix);
  }

  private updateVisual(
    pieceId: string,
    transform: PieceInstance["transform"],
  ): void {
    const object = this.options.designScene.getInstanceObject(pieceId);
    if (!object) return;
    object.position.set(
      transform.position.x,
      transform.position.y,
      transform.position.z,
    );
    object.rotation.set(
      transform.rotation.x,
      transform.rotation.y,
      transform.rotation.z,
    );
    object.updateMatrix();
    object.updateMatrixWorld(true);
  }

  private getAssemblyLinkId(assembly: Assembly): string | null {
    // Nested parents are distinct instances, not flat linked compositions.
    // Leaf subassemblies retain the established linked-copy behavior.
    if (this.options.designModel.getAssemblyChildren(assembly.id).length > 0) {
      return null;
    }
    const counts = new Map<string, number>();
    for (const piece of this.getPieces(assembly)) {
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

  private byComponent(
    pieces: readonly PieceInstance[],
    linkId: string,
  ): Map<string, PieceInstance> {
    const result = new Map<string, PieceInstance>();
    for (const piece of pieces) {
      if (getLinkedAssemblyId(piece.tags) !== linkId) continue;
      const componentId = getLinkedAssemblyComponentId(piece.tags);
      if (componentId) result.set(componentId, piece);
    }
    return result;
  }
}


function clearLinkedMetadata(tags: readonly string[]): string[] {
  return tags.filter((value) =>
    !value.startsWith(LINKED_ASSEMBLY_ID_TAG_PREFIX)
    && !value.startsWith(LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX),
  );
}


function matrixFromTransform(
  transform: PieceInstance["transform"],
): THREE.Matrix4 {
  const position = new THREE.Vector3(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      transform.rotation.x,
      transform.rotation.y,
      transform.rotation.z,
      "XYZ",
    ),
  );
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
  const rotation = new THREE.Euler().setFromQuaternion(
    quaternion,
    "XYZ",
  );
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
