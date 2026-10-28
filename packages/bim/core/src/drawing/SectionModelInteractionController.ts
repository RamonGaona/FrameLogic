import * as THREE from "three";

import type {
  DrawingProfessionalController,
} from "./DrawingProfessionalController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

interface SectionVisualRuntime {
  readonly group: THREE.Group;
}

interface SectionDrawingRuntime {
  activeSectionId: string | null;
  creationStage: "IDLE" | "SECOND_POINT";
  readonly visuals: Map<string, SectionVisualRuntime>;
  refreshUi(): void;
  setStatus(message: string): void;
  replaceSection(section: SectionViewDefinition): void;
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

interface NormalMoveDragState {
  readonly sectionId: string;
  readonly startSection: SectionViewDefinition;
  readonly dragPlane: THREE.Plane;
  readonly startWorldPoint: THREE.Vector3;
  readonly pointerId: number;
}

const NORMAL_GIZMO_NAME =
  "FrameLogicSectionNormalMove";
const NORMAL_HANDLE_NAME =
  "FrameLogicSectionNormalMoveHandle";

/**
 * Interacción directa de vistas de sección en Model Space.
 *
 * - Elimina los sprites A-A del recuadro de sección. La identidad de la vista
 *   queda en el árbol INSTANCIAS, donde ya existe el nombre completo.
 * - Permite seleccionar una sección haciendo clic sobre su volumen 3D.
 * - Añade un handle magenta que desplaza TODO el plano de sección sobre su
 *   normal, sin modificar ancho, alto ni profundidad.
 * - Mantiene sincronizados el estado activo profesional y la fila resaltada
 *   del árbol de instancias.
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
  private normalMoveDrag: NormalMoveDragState | null = null;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.sectionRuntime =
      options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.professionalRuntime =
      options.drawingProfessional as unknown as DrawingProfessionalRuntime;

    /*
     * DrawingProfessionalController recreaba dos sprites A-A por sección cada
     * vez que sincronizaba el estado profesional. Se sustituye ese marcador por
     * el handle de desplazamiento perpendicular.
     */
    this.originalEnsureSectionMarker =
      this.professionalRuntime.ensureSectionMarker.bind(
        this.professionalRuntime,
      );
    this.professionalRuntime.ensureSectionMarker = (
      section: SectionViewDefinition,
    ): void => {
      this.removeSectionMarkers(section.id);
      this.ensureNormalMoveHandle(section);
    };

    for (const section of options.sectionDrawing.getSections()) {
      this.removeSectionMarkers(section.id);
      this.ensureNormalMoveHandle(section);
    }

    options.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    options.canvas.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    options.canvas.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    options.canvas.addEventListener(
      "pointercancel",
      this.handlePointerCancel,
      true,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
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
    this.options.canvas.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.options.canvas.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.options.canvas.removeEventListener(
      "pointercancel",
      this.handlePointerCancel,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.professionalRuntime.ensureSectionMarker =
      this.originalEnsureSectionMarker;

    for (const section of this.options.sectionDrawing.getSections()) {
      this.removeNormalMoveHandle(section.id);
    }
  }

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      event.button !== 0
      || this.sectionRuntime.creationStage !== "IDLE"
    ) {
      return;
    }

    const normalSectionId =
      this.pickNormalMoveHandle(
        event.clientX,
        event.clientY,
      );

    if (normalSectionId) {
      event.preventDefault();
      event.stopImmediatePropagation();

      this.sectionRuntime.activeSectionId =
        normalSectionId;
      this.sectionRuntime.refreshUi();
      this.professionalRuntime.applySectionVisibility();
      this.professionalRuntime.renderSectionManager();
      this.syncNormalMoveHandles();

      this.beginNormalMove(
        normalSectionId,
        event.clientX,
        event.clientY,
        event.pointerId,
      );

      try {
        this.options.canvas.setPointerCapture(
          event.pointerId,
        );
      }
      catch {
        // El gesto continúa aunque el navegador no permita pointer capture.
      }
      return;
    }

    const section = this.pickSection(
      event.clientX,
      event.clientY,
    );

    if (!section) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    this.sectionRuntime.activeSectionId =
      section.id;
    this.sectionRuntime.refreshUi();
    this.professionalRuntime.applySectionVisibility();
    this.professionalRuntime.renderSectionManager();
    this.sectionRuntime.setStatus(
      `${section.name}: seleccionada desde Model Space.`,
    );
    this.syncNormalMoveHandles();
    this.highlightTreeRow(section.id);
  };

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    if (this.normalMoveDrag) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.updateNormalMove(
        event.clientX,
        event.clientY,
      );
      return;
    }

    if (
      this.sectionRuntime.creationStage === "IDLE"
      && this.pickNormalMoveHandle(
        event.clientX,
        event.clientY,
      )
    ) {
      this.options.canvas.style.cursor = "grab";
    }
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    const drag = this.normalMoveDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.finishNormalMove();

    try {
      if (
        this.options.canvas.hasPointerCapture(
          event.pointerId,
        )
      ) {
        this.options.canvas.releasePointerCapture(
          event.pointerId,
        );
      }
    }
    catch {
      // Sin acción: el gesto ya terminó.
    }
  };

  private readonly handlePointerCancel = (
    event: PointerEvent,
  ): void => {
    const drag = this.normalMoveDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.cancelNormalMove(true);
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      event.key !== "Escape"
      || !this.normalMoveDrag
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelNormalMove(true);
    this.sectionRuntime.setStatus(
      "Desplazamiento perpendicular cancelado.",
    );
  };

  private beginNormalMove(
    sectionId: string,
    clientX: number,
    clientY: number,
    pointerId: number,
  ): void {
    const section =
      this.options.sectionDrawing.getSections().find(
        (entry) => entry.id === sectionId,
      );
    if (!section) return;

    const visual =
      this.sectionRuntime.visuals.get(sectionId);
    const handle =
      visual?.group.getObjectByName(
        NORMAL_HANDLE_NAME,
      );
    if (!handle) return;

    visual?.group.updateWorldMatrix(true, true);
    const handlePoint =
      handle.getWorldPosition(
        new THREE.Vector3(),
      );
    const normal =
      this.toVector3(section.normal).normalize();
    const cameraDirection =
      new THREE.Vector3();
    this.options.cameraProvider().getWorldDirection(
      cameraDirection,
    );

    let tangent =
      cameraDirection.clone().addScaledVector(
        normal,
        -cameraDirection.dot(normal),
      );

    if (tangent.lengthSq() <= 1e-10) {
      tangent = this.toVector3(section.xAxis);
    }
    tangent.normalize();

    const planeNormal =
      new THREE.Vector3().crossVectors(
        normal,
        tangent,
      );

    if (planeNormal.lengthSq() <= 1e-10) {
      planeNormal.copy(
        this.toVector3(section.yAxis),
      );
    }
    planeNormal.normalize();

    const dragPlane =
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        planeNormal,
        handlePoint,
      );
    const startWorldPoint =
      this.intersectPointerWithPlane(
        clientX,
        clientY,
        dragPlane,
      );
    if (!startWorldPoint) return;

    this.normalMoveDrag = {
      sectionId,
      startSection: section,
      dragPlane,
      startWorldPoint,
      pointerId,
    };
    this.options.canvas.style.cursor = "grabbing";
    this.sectionRuntime.setStatus(
      `${section.name}: arrastra magenta para mover perpendicular al plano.`,
    );
  }

  private updateNormalMove(
    clientX: number,
    clientY: number,
  ): void {
    const drag = this.normalMoveDrag;
    if (!drag) return;

    const worldPoint =
      this.intersectPointerWithPlane(
        clientX,
        clientY,
        drag.dragPlane,
      );
    if (!worldPoint) return;

    const normal =
      this.toVector3(
        drag.startSection.normal,
      ).normalize();
    const distance =
      worldPoint.clone()
        .sub(drag.startWorldPoint)
        .dot(normal);
    const origin =
      this.toVector3(
        drag.startSection.origin,
      ).addScaledVector(
        normal,
        distance,
      );
    const next: SectionViewDefinition = {
      ...drag.startSection,
      origin: this.vectorData(origin),
    };

    this.sectionRuntime.replaceSection(next);
    this.ensureNormalMoveHandle(next);
    this.sectionRuntime.setStatus(
      `${next.name}: offset perpendicular ${this.formatSigned(distance)} m.`,
    );
  }

  private finishNormalMove(): void {
    const drag = this.normalMoveDrag;
    this.normalMoveDrag = null;
    this.options.canvas.style.cursor = "";
    if (!drag) return;

    const section =
      this.options.sectionDrawing.getSections().find(
        (entry) => entry.id === drag.sectionId,
      );
    if (!section) return;

    const normal =
      this.toVector3(
        drag.startSection.normal,
      ).normalize();
    const distance =
      this.toVector3(section.origin)
        .sub(
          this.toVector3(drag.startSection.origin),
        )
        .dot(normal);
    this.ensureNormalMoveHandle(section);
    this.sectionRuntime.setStatus(
      `${section.name}: plano desplazado ${this.formatSigned(distance)} m perpendicularmente.`,
    );
  }

  private cancelNormalMove(restore: boolean): void {
    const drag = this.normalMoveDrag;
    this.normalMoveDrag = null;
    this.options.canvas.style.cursor = "";
    if (!drag) return;

    if (restore) {
      this.sectionRuntime.replaceSection(
        drag.startSection,
      );
      this.ensureNormalMoveHandle(
        drag.startSection,
      );
    }
  }

  private pickNormalMoveHandle(
    clientX: number,
    clientY: number,
  ): string | null {
    if (!this.setPointer(clientX, clientY)) return null;

    this.raycaster.setFromCamera(
      this.pointer,
      this.options.cameraProvider(),
    );

    const handles: THREE.Object3D[] = [];
    for (const section of this.options.sectionDrawing.getSections()) {
      const visual =
        this.sectionRuntime.visuals.get(section.id);
      const handle =
        visual?.group.getObjectByName(
          NORMAL_HANDLE_NAME,
        );
      if (
        handle
        && handle.visible
        && visual?.group.visible
        && visual.group.layers.mask !== 0
      ) {
        handles.push(handle);
      }
    }

    const hit =
      this.raycaster.intersectObjects(
        handles,
        false,
      )[0];
    if (!hit) return null;

    const sectionId =
      hit.object.userData[
        "frameLogicSectionId"
      ];
    return typeof sectionId === "string"
      ? sectionId
      : null;
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
      const visual =
        this.sectionRuntime.visuals.get(section.id);

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

      const inverse =
        worldMatrix.clone().invert();
      const localRay =
        this.raycaster.ray
          .clone()
          .applyMatrix4(inverse);
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

      const worldHit =
        localHit.applyMatrix4(worldMatrix);
      const distanceSq =
        worldHit.distanceToSquared(
          this.raycaster.ray.origin,
        );

      if (
        !nearest
        || distanceSq < nearest.distanceSq
      ) {
        nearest = {
          section,
          distanceSq,
        };
      }
    }

    return nearest?.section ?? null;
  }

  private ensureNormalMoveHandle(
    section: SectionViewDefinition,
  ): void {
    const visual =
      this.sectionRuntime.visuals.get(section.id);
    if (!visual) return;

    const old =
      visual.group.getObjectByName(
        NORMAL_GIZMO_NAME,
      );
    if (old) {
      const active =
        section.id === this.sectionRuntime.activeSectionId;
      old.visible =
        active
        && visual.group.visible
        && visual.group.layers.mask !== 0;
      old.traverse(
        (object) => {
          object.layers.mask =
            visual.group.layers.mask;
        },
      );
      return;
    }

    const maxSize =
      Math.max(
        section.width,
        section.height,
        section.depth,
        0.01,
      );
    const radius =
      Math.max(
        maxSize * 0.018,
        0.018,
      );
    const normalOffset =
      Math.max(
        maxSize * 0.09,
        radius * 4.5,
      );
    const frontZ =
      -section.depth / 2;
    const lateral =
      Math.min(
        section.width * 0.22,
        maxSize * 0.12,
      );
    const anchor =
      new THREE.Vector3(
        lateral,
        0,
        frontZ,
      );
    const endpoint =
      new THREE.Vector3(
        lateral,
        0,
        frontZ - normalOffset,
      );

    const lineGeometry =
      new THREE.BufferGeometry().setFromPoints([
        anchor,
        endpoint,
      ]);
    const lineMaterial =
      new THREE.LineBasicMaterial({
        color: 0xe879f9,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
      });
    const line =
      new THREE.Line(
        lineGeometry,
        lineMaterial,
      );
    line.renderOrder = 74;
    line.raycast = () => {};

    const handle =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          radius,
          16,
          12,
        ),
        new THREE.MeshBasicMaterial({
          color: 0xe879f9,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      );
    handle.name = NORMAL_HANDLE_NAME;
    handle.position.copy(endpoint);
    handle.renderOrder = 75;
    handle.userData[
      "frameLogicSectionId"
    ] = section.id;

    const gizmo = new THREE.Group();
    gizmo.name = NORMAL_GIZMO_NAME;
    gizmo.add(line, handle);
    gizmo.visible =
      section.id === this.sectionRuntime.activeSectionId
      && visual.group.visible
      && visual.group.layers.mask !== 0;
    gizmo.traverse(
      (object) => {
        object.layers.mask =
          visual.group.layers.mask;
      },
    );
    visual.group.add(gizmo);
  }

  private syncNormalMoveHandles(): void {
    for (const section of this.options.sectionDrawing.getSections()) {
      this.ensureNormalMoveHandle(section);
      const visual =
        this.sectionRuntime.visuals.get(section.id);
      const gizmo =
        visual?.group.getObjectByName(
          NORMAL_GIZMO_NAME,
        );
      if (!visual || !gizmo) continue;
      gizmo.visible =
        section.id === this.sectionRuntime.activeSectionId
        && visual.group.visible
        && visual.group.layers.mask !== 0;
    }
  }

  private removeNormalMoveHandle(
    sectionId: string,
  ): void {
    const visual =
      this.sectionRuntime.visuals.get(sectionId);
    const gizmo =
      visual?.group.getObjectByName(
        NORMAL_GIZMO_NAME,
      );
    if (!gizmo) return;

    gizmo.traverse(
      (object) => {
        if (
          object instanceof THREE.Mesh
          || object instanceof THREE.Line
        ) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          }
          else {
            material.dispose();
          }
        }
      },
    );
    gizmo.removeFromParent();
  }

  private removeSectionMarkers(sectionId: string): void {
    const visual =
      this.sectionRuntime.visuals.get(sectionId);
    if (!visual) return;

    const markers =
      visual.group.getObjectByName(
        "FrameLogicSectionMarkers",
      );
    if (!markers) return;

    markers.traverse(
      (object) => {
        if (!(object instanceof THREE.Sprite)) return;
        const material = object.material;
        material.map?.dispose();
        material.dispose();
      },
    );
    markers.removeFromParent();
  }

  private highlightTreeRow(sectionId: string): void {
    const sections =
      this.options.sectionDrawing.getSections();
    const index =
      sections.findIndex(
        (section) => section.id === sectionId,
      );
    if (index < 0) return;

    const content =
      this.options.container.querySelector<HTMLElement>(
        '[data-framelogic-section-tree-content="true"]',
      );
    if (!content) return;

    const rows =
      Array.from(content.children)
        .filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement,
        );

    rows.forEach(
      (row, rowIndex) => {
        row.style.background =
          rowIndex === index
            ? "rgba(88,180,220,0.20)"
            : "transparent";
      },
    );

    rows[index]?.scrollIntoView({
      block: "nearest",
    });
  }

  private setPointer(
    clientX: number,
    clientY: number,
  ): boolean {
    const rect =
      this.options.canvas.getBoundingClientRect();
    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return false;
    }

    this.pointer.x =
      ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y =
      -((clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  private intersectPointerWithPlane(
    clientX: number,
    clientY: number,
    plane: THREE.Plane,
  ): THREE.Vector3 | null {
    if (!this.setPointer(clientX, clientY)) return null;
    this.raycaster.setFromCamera(
      this.pointer,
      this.options.cameraProvider(),
    );
    return this.raycaster.ray.intersectPlane(
      plane,
      new THREE.Vector3(),
    );
  }

  private vectorData(
    vector: THREE.Vector3,
  ): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } {
    return {
      x: vector.x,
      y: vector.y,
      z: vector.z,
    };
  }

  private toVector3(
    value: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    },
  ): THREE.Vector3 {
    return new THREE.Vector3(
      value.x,
      value.y,
      value.z,
    );
  }

  private formatSigned(value: number): string {
    const rounded = Number(value.toFixed(4));
    return `${rounded >= 0 ? "+" : ""}${rounded}`;
  }
}
