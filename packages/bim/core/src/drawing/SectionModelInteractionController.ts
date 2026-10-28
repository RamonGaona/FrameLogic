import * as THREE from "three";

import type {
  DrawingProfessionalController,
} from "./DrawingProfessionalController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

type SupplementalHandleType =
  | "BACK_CORNER_00"
  | "BACK_CORNER_10"
  | "BACK_CORNER_11"
  | "BACK_CORNER_01"
  | "NORMAL_MOVE";

type RuntimeHandleType =
  | "CORNER_00"
  | "CORNER_10"
  | "CORNER_11"
  | "CORNER_01"
  | "DEPTH"
  | "MOVE"
  | SupplementalHandleType;

interface SectionHandleData {
  readonly sectionId: string;
  readonly type: RuntimeHandleType;
}

interface SectionDragRuntime {
  readonly sectionId: string;
  handleType: RuntimeHandleType;
  readonly startSection: SectionViewDefinition;
  readonly dragPlane: THREE.Plane;
  readonly startWorldPoint: THREE.Vector3;
}

interface SectionVisualRuntime {
  readonly group: THREE.Group;
  readonly handles: Map<
    RuntimeHandleType,
    THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  >;
}

interface SectionDrawingRuntime {
  activeSectionId: string | null;
  creationStage: "IDLE" | "SECOND_POINT";
  dragState: SectionDragRuntime | null;
  readonly visuals: Map<string, SectionVisualRuntime>;
  createVisual(section: SectionViewDefinition): void;
  replaceSection(section: SectionViewDefinition): void;
  beginDrag(
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ): void;
  updateDrag(clientX: number, clientY: number): void;
  intersectPointerWithPlane(
    clientX: number,
    clientY: number,
    plane: THREE.Plane,
  ): THREE.Vector3 | null;
  refreshUi(): void;
  setStatus(message: string): void;
}

interface DrawingProfessionalRuntime {
  ensureSectionMarker(section: SectionViewDefinition): void;
  applySectionVisibility(): void;
  renderSectionManager(): void;
}

interface Options {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingProfessional: DrawingProfessionalController;
}

const MIN_SECTION_SIZE = 0.01;
const MARKER_GROUP_NAME = "FrameLogicSectionMarkers";
const OLD_NORMAL_GIZMO_NAME = "FrameLogicSectionNormalMove";

const BACK_TO_FRONT: Readonly<Record<SupplementalHandleType, RuntimeHandleType | null>> = {
  BACK_CORNER_00: "CORNER_00",
  BACK_CORNER_10: "CORNER_10",
  BACK_CORNER_11: "CORNER_11",
  BACK_CORNER_01: "CORNER_01",
  NORMAL_MOVE: null,
};

/**
 * Completa la edición del volumen de sección sin crear un segundo sistema de
 * arrastre. Los handles extra se registran dentro de `visual.handles`, por lo
 * que SectionDrawingController los selecciona con el mismo raycaster y la misma
 * captura de pointer que los controles originales.
 *
 * Controles:
 * - Azul frontal + azul posterior: ancho/alto desde cualquiera de las caras.
 * - Verde: desplaza dentro del plano de la sección.
 * - Amarillo: modifica únicamente la profundidad.
 * - Magenta: desplaza TODO el volumen sobre la normal del plano.
 *
 * También elimina definitivamente los sprites A-A y permite seleccionar el
 * recuadro haciendo clic sobre su volumen para identificarlo en INSTANCIAS.
 */
export class SectionModelInteractionController {
  private readonly options: Options;
  private readonly sectionRuntime: SectionDrawingRuntime;
  private readonly professionalRuntime: DrawingProfessionalRuntime;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private readonly originalEnsureSectionMarker: (
    section: SectionViewDefinition,
  ) => void;
  private readonly originalCreateVisual: (
    section: SectionViewDefinition,
  ) => void;
  private readonly originalBeginDrag: (
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ) => void;
  private readonly originalUpdateDrag: (
    clientX: number,
    clientY: number,
  ) => void;

  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.sectionRuntime =
      options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.professionalRuntime =
      options.drawingProfessional as unknown as DrawingProfessionalRuntime;

    this.originalEnsureSectionMarker =
      this.professionalRuntime.ensureSectionMarker.bind(
        this.professionalRuntime,
      );
    this.originalCreateVisual =
      this.sectionRuntime.createVisual.bind(
        this.sectionRuntime,
      );
    this.originalBeginDrag =
      this.sectionRuntime.beginDrag.bind(
        this.sectionRuntime,
      );
    this.originalUpdateDrag =
      this.sectionRuntime.updateDrag.bind(
        this.sectionRuntime,
      );

    /* Las letras A-A dejan de existir. Los handles se reconstruyen siempre que
     * la geometría de la sección se recrea, por eso el magenta ya no desaparece
     * después de un arrastre, doble clic o cambio de profundidad. */
    this.professionalRuntime.ensureSectionMarker = (
      section: SectionViewDefinition,
    ): void => {
      this.removeLegacyDecorations(section.id);
      this.ensureSupplementalHandles(section);
    };

    this.sectionRuntime.createVisual = (
      section: SectionViewDefinition,
    ): void => {
      this.originalCreateVisual(section);
      this.removeLegacyDecorations(section.id);
      this.ensureSupplementalHandles(section);
    };

    /* Los nuevos tipos de handle usan el mismo dragState nativo. */
    this.sectionRuntime.beginDrag = (
      hit: SectionHandleData,
      clientX: number,
      clientY: number,
    ): void => {
      if (hit.type === "NORMAL_MOVE") {
        this.beginNormalMove(hit, clientX, clientY);
        return;
      }

      if (hit.type.startsWith("BACK_CORNER_")) {
        this.beginBackCornerDrag(hit, clientX, clientY);
        return;
      }

      this.originalBeginDrag(hit, clientX, clientY);
    };

    this.sectionRuntime.updateDrag = (
      clientX: number,
      clientY: number,
    ): void => {
      const drag = this.sectionRuntime.dragState;
      if (!drag) return;

      if (drag.handleType === "DEPTH") {
        this.updateDepthDrag(drag, clientX, clientY);
        return;
      }

      if (drag.handleType === "NORMAL_MOVE") {
        this.updateNormalMove(drag, clientX, clientY);
        return;
      }

      if (drag.handleType.startsWith("BACK_CORNER_")) {
        const mapped =
          BACK_TO_FRONT[
            drag.handleType as SupplementalHandleType
          ];
        if (!mapped) return;

        /* El algoritmo nativo de esquinas ya es correcto. Solo sustituimos el
         * tipo durante el cálculo; el dragPlane permanece en la cara posterior. */
        const originalType = drag.handleType;
        drag.handleType = mapped;
        try {
          this.originalUpdateDrag(clientX, clientY);
        }
        finally {
          if (this.sectionRuntime.dragState === drag) {
            drag.handleType = originalType;
          }
        }
        return;
      }

      this.originalUpdateDrag(clientX, clientY);
    };

    for (const section of options.sectionDrawing.getSections()) {
      this.removeLegacyDecorations(section.id);
      this.ensureSupplementalHandles(section);
    }

    options.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.options.canvas.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );

    this.professionalRuntime.ensureSectionMarker =
      this.originalEnsureSectionMarker;
    this.sectionRuntime.createVisual =
      this.originalCreateVisual;
    this.sectionRuntime.beginDrag =
      this.originalBeginDrag;
    this.sectionRuntime.updateDrag =
      this.originalUpdateDrag;
  }

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      event.button !== 0
      || this.sectionRuntime.creationStage !== "IDLE"
      || this.sectionRuntime.dragState
    ) {
      return;
    }

    /* SectionDrawingController está registrado antes que este bridge. Si el
     * usuario tocó un handle, aquel controlador ya consume el evento. Aquí solo
     * seleccionamos el volumen cuando no hubo un handle. */
    const section = this.pickSection(
      event.clientX,
      event.clientY,
    );
    if (!section) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    this.sectionRuntime.activeSectionId = section.id;
    this.sectionRuntime.refreshUi();
    this.professionalRuntime.applySectionVisibility();
    this.professionalRuntime.renderSectionManager();
    this.sectionRuntime.setStatus(
      `${section.name}: seleccionada desde Model Space.`,
    );
    this.highlightTreeRow(section.id);
  };

  private beginBackCornerDrag(
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ): void {
    const section = this.findSection(hit.sectionId);
    if (!section) return;

    const normal = this.toVector3(section.normal).normalize();
    const backPoint =
      this.toVector3(section.origin)
        .addScaledVector(normal, section.depth);
    const dragPlane =
      new THREE.Plane()
        .setFromNormalAndCoplanarPoint(
          normal,
          backPoint,
        );
    const startWorldPoint =
      this.sectionRuntime.intersectPointerWithPlane(
        clientX,
        clientY,
        dragPlane,
      );
    if (!startWorldPoint) return;

    this.sectionRuntime.dragState = {
      sectionId: section.id,
      handleType: hit.type,
      startSection: section,
      dragPlane,
      startWorldPoint,
    };
  }

  private beginNormalMove(
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ): void {
    const section = this.findSection(hit.sectionId);
    if (!section) return;

    const normal = this.toVector3(section.normal).normalize();
    const origin = this.toVector3(section.origin);
    const xAxis = this.toVector3(section.xAxis).normalize();
    const yAxis = this.toVector3(section.yAxis).normalize();
    const handlePoint =
      origin.clone()
        .addScaledVector(xAxis, section.width / 2)
        .addScaledVector(yAxis, section.height / 2);

    const cameraDirection = new THREE.Vector3();
    this.options.cameraProvider().getWorldDirection(cameraDirection);

    let tangent =
      cameraDirection.clone()
        .addScaledVector(
          normal,
          -cameraDirection.dot(normal),
        );
    if (tangent.lengthSq() <= 1e-10) {
      tangent = xAxis.clone();
    }
    tangent.normalize();

    const planeNormal =
      new THREE.Vector3()
        .crossVectors(normal, tangent);
    if (planeNormal.lengthSq() <= 1e-10) {
      planeNormal.copy(yAxis);
    }
    planeNormal.normalize();

    const dragPlane =
      new THREE.Plane()
        .setFromNormalAndCoplanarPoint(
          planeNormal,
          handlePoint,
        );
    const startWorldPoint =
      this.sectionRuntime.intersectPointerWithPlane(
        clientX,
        clientY,
        dragPlane,
      );
    if (!startWorldPoint) return;

    this.sectionRuntime.dragState = {
      sectionId: section.id,
      handleType: "NORMAL_MOVE",
      startSection: section,
      dragPlane,
      startWorldPoint,
    };
    this.sectionRuntime.setStatus(
      `${section.name}: mueve magenta para desplazar perpendicular al plano.`,
    );
  }

  private updateDepthDrag(
    drag: SectionDragRuntime,
    clientX: number,
    clientY: number,
  ): void {
    const worldPoint =
      this.sectionRuntime.intersectPointerWithPlane(
        clientX,
        clientY,
        drag.dragPlane,
      );
    if (!worldPoint) return;

    const normal =
      this.toVector3(drag.startSection.normal).normalize();
    const delta =
      worldPoint.clone()
        .sub(drag.startWorldPoint)
        .dot(normal);
    const depth = Math.max(
      MIN_SECTION_SIZE,
      drag.startSection.depth + delta,
    );

    this.sectionRuntime.replaceSection({
      ...drag.startSection,
      depth,
    });
    this.sectionRuntime.setStatus(
      `${drag.startSection.name}: profundidad ${this.formatNumber(depth)} m.`,
    );
  }

  private updateNormalMove(
    drag: SectionDragRuntime,
    clientX: number,
    clientY: number,
  ): void {
    const worldPoint =
      this.sectionRuntime.intersectPointerWithPlane(
        clientX,
        clientY,
        drag.dragPlane,
      );
    if (!worldPoint) return;

    const normal =
      this.toVector3(drag.startSection.normal).normalize();
    const delta =
      worldPoint.clone()
        .sub(drag.startWorldPoint)
        .dot(normal);
    const origin =
      this.toVector3(drag.startSection.origin)
        .addScaledVector(normal, delta);

    this.sectionRuntime.replaceSection({
      ...drag.startSection,
      origin: this.vectorData(origin),
    });
    this.sectionRuntime.setStatus(
      `${drag.startSection.name}: desplazamiento perpendicular ${this.formatSigned(delta)} m.`,
    );
  }

  private ensureSupplementalHandles(
    section: SectionViewDefinition,
  ): void {
    const visual = this.sectionRuntime.visuals.get(section.id);
    if (!visual) return;

    this.removeLegacyDecorations(section.id);

    const template =
      visual.handles.get("CORNER_00");
    if (!template) return;

    const halfW = section.width / 2;
    const halfH = section.height / 2;
    const frontZ = -section.depth / 2;
    const backZ = section.depth / 2;

    const addHandle = (
      type: SupplementalHandleType,
      position: THREE.Vector3,
      color: number,
    ): void => {
      const current = visual.handles.get(type);
      if (current) {
        current.position.copy(position);
        return;
      }

      const geometry = template.geometry.clone();
      const material =
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
      const handle =
        new THREE.Mesh(geometry, material);
      handle.name =
        `SectionHandle:${section.name}:${type}`;
      handle.position.copy(position);
      handle.renderOrder = 72;
      handle.userData["frameLogicSectionHandle"] = {
        sectionId: section.id,
        type,
      } satisfies SectionHandleData;

      visual.group.add(handle);
      visual.handles.set(type, handle);
    };

    addHandle(
      "BACK_CORNER_00",
      new THREE.Vector3(-halfW, -halfH, backZ),
      0x72d7ff,
    );
    addHandle(
      "BACK_CORNER_10",
      new THREE.Vector3(halfW, -halfH, backZ),
      0x72d7ff,
    );
    addHandle(
      "BACK_CORNER_11",
      new THREE.Vector3(halfW, halfH, backZ),
      0x72d7ff,
    );
    addHandle(
      "BACK_CORNER_01",
      new THREE.Vector3(-halfW, halfH, backZ),
      0x72d7ff,
    );

    const radius =
      template.geometry.boundingSphere?.radius
      ?? Math.max(
        section.width,
        section.height,
        section.depth,
        MIN_SECTION_SIZE,
      ) * 0.018;
    const normalOffset = Math.max(
      radius * 5,
      Math.max(section.width, section.height) * 0.04,
      0.04,
    );

    addHandle(
      "NORMAL_MOVE",
      new THREE.Vector3(0, 0, frontZ - normalOffset),
      0xd85cff,
    );
  }

  private removeLegacyDecorations(sectionId: string): void {
    const visual = this.sectionRuntime.visuals.get(sectionId);
    if (!visual) return;

    const marker = visual.group.getObjectByName(MARKER_GROUP_NAME);
    if (marker) {
      marker.traverse((object) => {
        if (!(object instanceof THREE.Sprite)) return;
        object.material.map?.dispose();
        object.material.dispose();
      });
      marker.removeFromParent();
    }

    const oldNormal =
      visual.group.getObjectByName(OLD_NORMAL_GIZMO_NAME);
    if (oldNormal) {
      oldNormal.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          }
          else {
            object.material.dispose();
          }
        }
      });
      oldNormal.removeFromParent();
    }
  }

  private pickSection(
    clientX: number,
    clientY: number,
  ): SectionViewDefinition | null {
    if (!this.setPointer(clientX, clientY)) return null;

    this.raycaster.setFromCamera(
      this.pointer,
      this.options.cameraProvider(),
    );

    let nearest:
      {
        section: SectionViewDefinition;
        distanceSq: number;
      }
      | null = null;

    for (const section of this.options.sectionDrawing.getSections()) {
      const visual = this.sectionRuntime.visuals.get(section.id);
      if (
        !visual
        || !visual.group.visible
        || visual.group.layers.mask === 0
      ) {
        continue;
      }

      const worldMatrix =
        new THREE.Matrix4()
          .makeBasis(
            this.toVector3(section.xAxis),
            this.toVector3(section.yAxis),
            this.toVector3(section.normal),
          );
      worldMatrix.setPosition(
        this.toVector3(section.origin),
      );

      const inverse = worldMatrix.clone().invert();
      const localRay =
        this.raycaster.ray.clone().applyMatrix4(inverse);
      const box =
        new THREE.Box3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(
            section.width,
            section.height,
            section.depth,
          ),
        );
      const localHit =
        localRay.intersectBox(
          box,
          new THREE.Vector3(),
        );
      if (!localHit) continue;

      const worldHit = localHit.applyMatrix4(worldMatrix);
      const distanceSq =
        worldHit.distanceToSquared(this.raycaster.ray.origin);
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { section, distanceSq };
      }
    }

    return nearest?.section ?? null;
  }

  private setPointer(clientX: number, clientY: number): boolean {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    this.pointer.x =
      ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y =
      -((clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  private highlightTreeRow(sectionId: string): void {
    const sections = this.options.sectionDrawing.getSections();
    const index = sections.findIndex(
      (section) => section.id === sectionId,
    );
    if (index < 0) return;

    const content =
      this.options.container.querySelector<HTMLElement>(
        '[data-framelogic-section-tree-content="true"]',
      );
    if (!content) return;

    const rows = Array.from(content.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement,
      );

    rows.forEach((row, rowIndex) => {
      row.style.background =
        rowIndex === index
          ? "rgba(88,180,220,0.20)"
          : "transparent";
    });
    rows[index]?.scrollIntoView({ block: "nearest" });
  }

  private findSection(sectionId: string): SectionViewDefinition | null {
    return this.options.sectionDrawing.getSections().find(
      (section) => section.id === sectionId,
    ) ?? null;
  }

  private vectorData(vector: THREE.Vector3): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } {
    return { x: vector.x, y: vector.y, z: vector.z };
  }

  private toVector3(value: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }): THREE.Vector3 {
    return new THREE.Vector3(value.x, value.y, value.z);
  }

  private formatNumber(value: number): string {
    return Number(value.toFixed(4)).toString();
  }

  private formatSigned(value: number): string {
    const rounded = Number(value.toFixed(4));
    return `${rounded >= 0 ? "+" : ""}${rounded}`;
  }
}
