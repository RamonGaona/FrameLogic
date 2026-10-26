import * as THREE from "three";

import type {
  CadWorkPlaneController,
} from "../interaction/CadWorkPlaneController";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


export interface SectionVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}


export interface SectionViewDefinition {
  readonly id: string;
  readonly name: string;
  readonly origin: SectionVector3;
  readonly xAxis: SectionVector3;
  readonly yAxis: SectionVector3;
  readonly normal: SectionVector3;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}


interface SectionSegment2D {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}


interface SectionDrawingData {
  readonly projected: SectionSegment2D[];
  readonly cut: SectionSegment2D[];
  readonly instanceIds: Set<string>;
}


type SectionHandleType =
  | "CORNER_00"
  | "CORNER_10"
  | "CORNER_11"
  | "CORNER_01"
  | "DEPTH"
  | "MOVE";


interface SectionHandleData {
  readonly sectionId: string;
  readonly type: SectionHandleType;
}


interface SectionVisual {
  readonly group: THREE.Group;
  readonly fillGeometry: THREE.BoxGeometry;
  readonly fillMaterial: THREE.MeshBasicMaterial;
  readonly edgeGeometry: THREE.EdgesGeometry;
  readonly edgeMaterial: THREE.LineBasicMaterial;
  readonly arrow: THREE.ArrowHelper;
  readonly handles: Map<
    SectionHandleType,
    THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  >;
}


interface SectionDragState {
  readonly sectionId: string;
  readonly handleType: SectionHandleType;
  readonly startSection: SectionViewDefinition;
  readonly dragPlane: THREE.Plane;
  readonly startWorldPoint: THREE.Vector3;
}


export interface SectionDrawingControllerOptions {
  readonly container: HTMLElement;
  readonly canvas: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly workPlane: CadWorkPlaneController;
  readonly designScene: DesignSceneController;
  readonly findSnapPoint?: (
    clientX: number,
    clientY: number,
  ) => THREE.Vector3 | null;
  readonly beforeStart?: () => void;
}


const SECTION_EPSILON =
  1e-7;

const MIN_SECTION_SIZE =
  0.01;


/**
 * Planos de sección FrameLogic.
 *
 * El usuario define un rectángulo sobre el WorkPlane activo y una profundidad.
 * El volumen puede editarse después con handles 3D:
 * - 4 esquinas del plano frontal: ancho / alto.
 * - handle amarillo posterior: profundidad.
 * - handle verde central: mover el recuadro dentro de su plano.
 *
 * La flecha amarilla siempre apunta desde el plano de corte hacia la profundidad
 * incluida en la vista PDF.
 */
export class SectionDrawingController {
  private readonly container:
    HTMLElement;

  private readonly canvas:
    HTMLElement;

  private readonly scene:
    THREE.Scene;

  private readonly cameraProvider:
    () => THREE.Camera;

  private readonly workPlane:
    CadWorkPlaneController;

  private readonly designScene:
    DesignSceneController;

  private readonly findSnapPoint:
    (
      clientX: number,
      clientY: number,
    ) => THREE.Vector3 | null;

  private readonly beforeStart:
    () => void;

  private readonly sections:
    SectionViewDefinition[] = [];

  private readonly visuals =
    new Map<string, SectionVisual>();

  private readonly handleRaycaster =
    new THREE.Raycaster();

  private readonly pointer =
    new THREE.Vector2();

  private activeSectionId:
    string | null =
      null;

  private creationStage:
    "IDLE" | "SECOND_POINT" =
      "IDLE";

  private firstPoint:
    THREE.Vector3 | null =
      null;

  private creationPlaneState:
    ReturnType<CadWorkPlaneController["getState"]>
    | null =
      null;

  private preview:
    THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>
    | null =
      null;

  private dragState:
    SectionDragState | null =
      null;

  private disposed =
    false;

  private readonly panel:
    HTMLDivElement;

  private readonly depthInput:
    HTMLInputElement;

  private readonly createButton:
    HTMLButtonElement;

  private readonly reverseButton:
    HTMLButtonElement;

  private readonly pdfButton:
    HTMLButtonElement;

  private readonly deleteButton:
    HTMLButtonElement;

  private readonly status:
    HTMLDivElement;


  constructor(
    options: SectionDrawingControllerOptions,
  ) {
    this.container =
      options.container;
    this.canvas =
      options.canvas;
    this.scene =
      options.scene;
    this.cameraProvider =
      options.cameraProvider;
    this.workPlane =
      options.workPlane;
    this.designScene =
      options.designScene;
    this.findSnapPoint =
      options.findSnapPoint
      ?? (() => null);
    this.beforeStart =
      options.beforeStart
      ?? (() => {});

    const panel =
      document.createElement(
        "div",
      );

    panel.dataset["framelogicSectionPanel"] =
      "true";
    panel.style.position =
      "absolute";

    /*
     * El panel de Layers vive en el sector inferior izquierdo.
     * SECCIÓN se mantiene en la esquina inferior derecha para no solaparlo.
     */
    panel.style.left =
      "auto";
    panel.style.right =
      "16px";
    panel.style.bottom =
      "16px";
    panel.style.zIndex =
      "80";
    panel.style.display =
      "flex";
    panel.style.alignItems =
      "center";
    panel.style.flexWrap =
      "wrap";
    panel.style.justifyContent =
      "flex-end";
    panel.style.gap =
      "6px";
    panel.style.maxWidth =
      "min(680px, calc(100% - 32px))";
    panel.style.padding =
      "7px 9px";
    panel.style.borderRadius =
      "6px";
    panel.style.background =
      "rgba(20, 27, 32, 0.92)";
    panel.style.border =
      "1px solid rgba(255,255,255,0.14)";
    panel.style.boxShadow =
      "0 4px 14px rgba(0,0,0,0.28)";
    panel.style.color =
      "#e9eef1";
    panel.style.font =
      "12px/1.2 system-ui, sans-serif";
    panel.style.userSelect =
      "none";

    const title =
      document.createElement(
        "strong",
      );

    title.textContent =
      "SECCIÓN";
    title.style.letterSpacing =
      "0.04em";

    const depthLabel =
      document.createElement(
        "span",
      );

    depthLabel.textContent =
      "Prof. m";
    depthLabel.style.opacity =
      "0.72";

    const depthInput =
      document.createElement(
        "input",
      );

    depthInput.type =
      "number";
    depthInput.min =
      "0.001";
    depthInput.step =
      "0.1";
    depthInput.value =
      "1";
    depthInput.style.width =
      "62px";
    depthInput.style.padding =
      "4px 5px";
    depthInput.style.border =
      "1px solid rgba(255,255,255,0.18)";
    depthInput.style.borderRadius =
      "4px";
    depthInput.style.background =
      "#11181d";
    depthInput.style.color =
      "#f4f7f8";

    const createButton =
      this.makeButton(
        "Dibujar",
      );
    const reverseButton =
      this.makeButton(
        "Invertir",
      );
    const pdfButton =
      this.makeButton(
        "PDF",
      );
    const deleteButton =
      this.makeButton(
        "Eliminar",
      );

    const status =
      document.createElement(
        "div",
      );

    status.style.marginLeft =
      "4px";
    status.style.maxWidth =
      "260px";
    status.style.whiteSpace =
      "nowrap";
    status.style.overflow =
      "hidden";
    status.style.textOverflow =
      "ellipsis";
    status.style.opacity =
      "0.75";

    panel.append(
      title,
      depthLabel,
      depthInput,
      createButton,
      reverseButton,
      pdfButton,
      deleteButton,
      status,
    );

    const computed =
      window.getComputedStyle(
        this.container,
      );

    if (
      computed.position === "static"
    ) {
      this.container.style.position =
        "relative";
    }

    this.container.append(
      panel,
    );

    this.panel =
      panel;
    this.depthInput =
      depthInput;
    this.createButton =
      createButton;
    this.reverseButton =
      reverseButton;
    this.pdfButton =
      pdfButton;
    this.deleteButton =
      deleteButton;
    this.status =
      status;

    this.createButton.addEventListener(
      "click",
      this.handleCreateClick,
    );
    this.reverseButton.addEventListener(
      "click",
      this.handleReverseClick,
    );
    this.pdfButton.addEventListener(
      "click",
      this.handlePdfClick,
    );
    this.deleteButton.addEventListener(
      "click",
      this.handleDeleteClick,
    );
    this.depthInput.addEventListener(
      "change",
      this.handleDepthChange,
    );

    /*
     * Capture=true permite que los handles ganen el gesto antes que los
     * controles de cámara, sin alterar la navegación cuando no se arrastran.
     */
    this.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.canvas.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.canvas.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.canvas.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.refreshUi();
  }


  getSections():
    readonly SectionViewDefinition[] {
    return this.sections;
  }


  getActiveSection():
    SectionViewDefinition | null {
    if (!this.activeSectionId) {
      return null;
    }

    return this.sections.find(
      (
        section,
      ) =>
        section.id
        === this.activeSectionId,
    )
      ?? null;
  }


  startCreation(): void {
    if (
      this.disposed
      || !this.workPlane.enabled
    ) {
      this.setStatus(
        "Activa un plano XY, XZ, YZ o CUSTOM.",
      );
      return;
    }

    this.beforeStart();
    this.cancelDrag(
      false,
    );
    this.cancelCreation();
    this.creationStage =
      "SECOND_POINT";
    this.creationPlaneState =
      this.workPlane.getState();
    this.firstPoint =
      null;
    this.canvas.style.cursor =
      "crosshair";
    this.setStatus(
      "Clic 1: primera esquina del recuadro.",
    );
    this.refreshUi();
  }


  cancelCreation(): void {
    this.creationStage =
      "IDLE";
    this.firstPoint =
      null;
    this.creationPlaneState =
      null;

    if (!this.dragState) {
      this.canvas.style.cursor =
        "";
    }

    this.disposePreview();
    this.refreshUi();
  }


  exportActivePdf(): boolean {
    const section =
      this.getActiveSection();

    if (!section) {
      this.setStatus(
        "Primero crea una sección.",
      );
      return false;
    }

    const drawing =
      this.buildDrawing(
        section,
      );
    const pdf =
      this.createPdf(
        section,
        drawing,
      );
    const blob =
      new Blob(
        [
          pdf,
        ],
        {
          type:
            "application/pdf",
        },
      );
    const url =
      URL.createObjectURL(
        blob,
      );
    const anchor =
      document.createElement(
        "a",
      );

    anchor.href =
      url;
    anchor.download =
      `${this.fileSafeName(section.name)}.pdf`;
    anchor.click();

    window.setTimeout(
      () =>
        URL.revokeObjectURL(
          url,
        ),
      0,
    );

    this.setStatus(
      `${section.name}: ${drawing.instanceIds.size} pieza(s), ${drawing.cut.length} corte(s).`,
    );
    return true;
  }


  removeActiveSection(): boolean {
    const id =
      this.activeSectionId;

    if (!id) {
      return false;
    }

    const index =
      this.sections.findIndex(
        (
          section,
        ) =>
          section.id === id,
      );

    if (index < 0) {
      return false;
    }

    const visual =
      this.visuals.get(
        id,
      );

    if (visual) {
      this.disposeVisual(
        visual,
      );
      this.visuals.delete(
        id,
      );
    }

    this.sections.splice(
      index,
      1,
    );
    this.activeSectionId =
      this.sections.at(-1)?.id
      ?? null;
    this.refreshUi();
    this.setStatus(
      this.activeSectionId
        ? "Sección eliminada."
        : "Sin secciones.",
    );
    return true;
  }


  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed =
      true;
    this.cancelDrag(
      false,
    );
    this.cancelCreation();

    this.createButton.removeEventListener(
      "click",
      this.handleCreateClick,
    );
    this.reverseButton.removeEventListener(
      "click",
      this.handleReverseClick,
    );
    this.pdfButton.removeEventListener(
      "click",
      this.handlePdfClick,
    );
    this.deleteButton.removeEventListener(
      "click",
      this.handleDeleteClick,
    );
    this.depthInput.removeEventListener(
      "change",
      this.handleDepthChange,
    );

    this.canvas.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.canvas.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.canvas.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.canvas.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    for (
      const visual
      of this.visuals.values()
    ) {
      this.disposeVisual(
        visual,
      );
    }

    this.visuals.clear();
    this.sections.length =
      0;
    this.panel.remove();
  }


  private readonly handleCreateClick =
    (): void => {
      if (
        this.creationStage
        !== "IDLE"
      ) {
        this.cancelCreation();
        this.setStatus(
          "Creación cancelada.",
        );
        return;
      }

      this.startCreation();
    };


  private readonly handleReverseClick =
    (): void => {
      const section =
        this.getActiveSection();

      if (!section) {
        return;
      }

      const reversed:
        SectionViewDefinition = {
          ...section,
          normal: {
            x:
              -section.normal.x,
            y:
              -section.normal.y,
            z:
              -section.normal.z,
          },
        };

      this.replaceSection(
        reversed,
      );
      this.setStatus(
        `${section.name}: dirección de vista invertida.`,
      );
    };


  private readonly handlePdfClick =
    (): void => {
      this.exportActivePdf();
    };


  private readonly handleDeleteClick =
    (): void => {
      this.removeActiveSection();
    };


  private readonly handleDepthChange =
    (): void => {
      const section =
        this.getActiveSection();
      const depth =
        this.readDepth();

      if (
        !section
        || depth === null
      ) {
        return;
      }

      this.replaceSection({
        ...section,
        depth,
      });
      this.setStatus(
        `${section.name}: profundidad ${this.formatNumber(depth)} m.`,
      );
    };


  private readonly handlePointerDown =
    (
      event: PointerEvent,
    ): void => {
      if (
        event.button !== 0
      ) {
        return;
      }

      if (
        this.creationStage
        !== "IDLE"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const hit =
        this.pickHandle(
          event.clientX,
          event.clientY,
        );

      if (!hit) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      this.beforeStart();
      this.activeSectionId =
        hit.sectionId;
      this.refreshUi();
      this.beginDrag(
        hit,
        event.clientX,
        event.clientY,
      );

      try {
        this.canvas.setPointerCapture(
          event.pointerId,
        );
      }
      catch {
        // Algunos navegadores no permiten captura si el pointer cambió.
      }
    };


  private readonly handlePointerUp =
    (
      event: PointerEvent,
    ): void => {
      if (
        event.button !== 0
      ) {
        return;
      }

      if (this.dragState) {
        event.preventDefault();
        event.stopImmediatePropagation();

        this.finishDrag();

        try {
          if (
            this.canvas.hasPointerCapture(
              event.pointerId,
            )
          ) {
            this.canvas.releasePointerCapture(
              event.pointerId,
            );
          }
        }
        catch {
          // Sin acción: el gesto ya terminó.
        }

        return;
      }

      if (
        this.creationStage === "IDLE"
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const point =
        this.resolvePoint(
          event.clientX,
          event.clientY,
        );

      if (!point) {
        return;
      }

      if (!this.firstPoint) {
        this.firstPoint =
          point;
        this.setStatus(
          "Clic 2: esquina opuesta del recuadro.",
        );
        return;
      }

      this.completeSection(
        this.firstPoint,
        point,
      );
    };


  private readonly handlePointerMove =
    (
      event: PointerEvent,
    ): void => {
      if (this.dragState) {
        event.preventDefault();
        event.stopImmediatePropagation();

        this.updateDrag(
          event.clientX,
          event.clientY,
        );
        return;
      }

      if (
        this.creationStage
        !== "IDLE"
      ) {
        if (!this.firstPoint) {
          return;
        }

        const point =
          this.resolvePoint(
            event.clientX,
            event.clientY,
          );

        if (!point) {
          return;
        }

        this.updatePreview(
          this.firstPoint,
          point,
        );
        return;
      }

      const hit =
        this.pickHandle(
          event.clientX,
          event.clientY,
        );

      if (!hit) {
        this.canvas.style.cursor =
          "";
        return;
      }

      this.canvas.style.cursor =
        hit.type === "MOVE"
          ? "move"
          : "grab";
    };


  private readonly handlePointerLeave =
    (): void => {
      if (
        this.creationStage === "IDLE"
        && !this.dragState
      ) {
        this.canvas.style.cursor =
          "";
      }
    };


  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        event.key !== "Escape"
      ) {
        return;
      }

      if (this.dragState) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancelDrag(
          true,
        );
        this.setStatus(
          "Edición de sección cancelada.",
        );
        return;
      }

      if (
        this.creationStage === "IDLE"
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancelCreation();
      this.setStatus(
        "Creación de sección cancelada.",
      );
    };


  private completeSection(
    first: THREE.Vector3,
    second: THREE.Vector3,
  ): void {
    const plane =
      this.creationPlaneState;
    const depth =
      this.readDepth();

    if (
      !plane
      || depth === null
    ) {
      return;
    }

    const localFirst =
      this.toPlaneCoordinates(
        first,
        plane,
      );
    const localSecond =
      this.toPlaneCoordinates(
        second,
        plane,
      );
    const minX =
      Math.min(
        localFirst.x,
        localSecond.x,
      );
    const minY =
      Math.min(
        localFirst.y,
        localSecond.y,
      );
    const width =
      Math.abs(
        localSecond.x
        - localFirst.x,
      );
    const height =
      Math.abs(
        localSecond.y
        - localFirst.y,
      );

    if (
      width <= SECTION_EPSILON
      || height <= SECTION_EPSILON
    ) {
      this.setStatus(
        "El recuadro necesita ancho y alto mayores que cero.",
      );
      return;
    }

    const origin =
      plane.origin
        .clone()
        .addScaledVector(
          plane.xAxis,
          minX,
        )
        .addScaledVector(
          plane.yAxis,
          minY,
        );
    const index =
      this.sections.length;
    const section:
      SectionViewDefinition = {
        id:
          crypto.randomUUID(),
        name:
          `SECCIÓN ${this.sectionLetter(index)}-${this.sectionLetter(index)}`,
        origin:
          this.vectorData(
            origin,
          ),
        xAxis:
          this.vectorData(
            plane.xAxis,
          ),
        yAxis:
          this.vectorData(
            plane.yAxis,
          ),
        normal:
          this.vectorData(
            plane.normal,
          ),
        width,
        height,
        depth,
      };

    this.sections.push(
      section,
    );
    this.activeSectionId =
      section.id;
    this.createVisual(
      section,
    );
    this.cancelCreation();
    this.depthInput.value =
      this.formatNumber(
        depth,
      );
    this.setStatus(
      `${section.name}: ${this.formatNumber(width)} × ${this.formatNumber(height)} × ${this.formatNumber(depth)} m.`,
    );
    this.refreshUi();
  }


  private resolvePoint(
    clientX: number,
    clientY: number,
  ):
    THREE.Vector3 | null {
    const plane =
      this.creationPlaneState
      ?? this.workPlane.getState();
    const snapped =
      this.findSnapPoint(
        clientX,
        clientY,
      );

    if (snapped) {
      const delta =
        snapped.clone()
          .sub(
            plane.origin,
          );

      return plane.origin
        .clone()
        .addScaledVector(
          plane.xAxis,
          delta.dot(
            plane.xAxis,
          ),
        )
        .addScaledVector(
          plane.yAxis,
          delta.dot(
            plane.yAxis,
          ),
        );
    }

    return this.workPlane
      .intersectPointer(
        clientX,
        clientY,
        this.cameraProvider(),
        this.canvas,
      );
  }


  private updatePreview(
    first: THREE.Vector3,
    second: THREE.Vector3,
  ): void {
    const plane =
      this.creationPlaneState;

    if (!plane) {
      return;
    }

    this.disposePreview();

    const a =
      this.toPlaneCoordinates(
        first,
        plane,
      );
    const b =
      this.toPlaneCoordinates(
        second,
        plane,
      );
    const minX =
      Math.min(a.x, b.x);
    const maxX =
      Math.max(a.x, b.x);
    const minY =
      Math.min(a.y, b.y);
    const maxY =
      Math.max(a.y, b.y);
    const points =
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ].map(
        ([x, y]) =>
          plane.origin
            .clone()
            .addScaledVector(
              plane.xAxis,
              x ?? 0,
            )
            .addScaledVector(
              plane.yAxis,
              y ?? 0,
            ),
      );
    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints(
          points,
        );
    const material =
      new THREE.LineBasicMaterial({
        color:
          0x55c7ff,
        transparent:
          true,
        opacity:
          0.95,
        depthTest:
          false,
        toneMapped:
          false,
      });
    const preview =
      new THREE.LineLoop(
        geometry,
        material,
      );

    preview.name =
      "FrameLogicSectionPreview";
    preview.renderOrder =
      50;
    preview.raycast =
      () => {};
    this.scene.add(
      preview,
    );
    this.preview =
      preview;
  }


  private disposePreview(): void {
    if (!this.preview) {
      return;
    }

    this.preview.removeFromParent();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    this.preview =
      null;
  }


  private createVisual(
    section: SectionViewDefinition,
  ): void {
    const old =
      this.visuals.get(
        section.id,
      );

    if (old) {
      this.disposeVisual(
        old,
      );
    }

    const fillGeometry =
      new THREE.BoxGeometry(
        section.width,
        section.height,
        section.depth,
      );
    const fillMaterial =
      new THREE.MeshBasicMaterial({
        color:
          0x4db6e8,
        transparent:
          true,
        opacity:
          0.055,
        side:
          THREE.DoubleSide,
        depthWrite:
          false,
      });
    const fill =
      new THREE.Mesh(
        fillGeometry,
        fillMaterial,
      );
    const edgeGeometry =
      new THREE.EdgesGeometry(
        fillGeometry,
      );
    const edgeMaterial =
      new THREE.LineBasicMaterial({
        color:
          0x4db6e8,
        transparent:
          true,
        opacity:
          0.82,
        depthTest:
          true,
        depthWrite:
          false,
        toneMapped:
          false,
      });
    const edges =
      new THREE.LineSegments(
        edgeGeometry,
        edgeMaterial,
      );
    const group =
      new THREE.Group();

    group.name =
      `SectionVolume:${section.name}`;
    fill.raycast =
      () => {};
    edges.raycast =
      () => {};
    edges.renderOrder =
      20;
    group.add(
      fill,
      edges,
    );

    const origin =
      this.toVector3(
        section.origin,
      );
    const xAxis =
      this.toVector3(
        section.xAxis,
      );
    const yAxis =
      this.toVector3(
        section.yAxis,
      );
    const normal =
      this.toVector3(
        section.normal,
      );
    const basis =
      new THREE.Matrix4()
        .makeBasis(
          xAxis,
          yAxis,
          normal,
        );

    group.quaternion
      .setFromRotationMatrix(
        basis,
      );
    group.position
      .copy(
        origin,
      )
      .addScaledVector(
        xAxis,
        section.width / 2,
      )
      .addScaledVector(
        yAxis,
        section.height / 2,
      )
      .addScaledVector(
        normal,
        section.depth / 2,
      );

    const maxSize =
      Math.max(
        section.width,
        section.height,
        section.depth,
        MIN_SECTION_SIZE,
      );
    const handleRadius =
      Math.max(
        maxSize * 0.018,
        0.018,
      );

    const handles =
      new Map<
        SectionHandleType,
        THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
      >();

    const addHandle =
      (
        type: SectionHandleType,
        position: THREE.Vector3,
        color: number,
      ): void => {
        const geometry =
          new THREE.SphereGeometry(
            handleRadius,
            14,
            10,
          );
        const material =
          new THREE.MeshBasicMaterial({
            color,
            depthTest:
              false,
            depthWrite:
              false,
            toneMapped:
              false,
          });
        const handle =
          new THREE.Mesh(
            geometry,
            material,
          );

        handle.name =
          `SectionHandle:${section.name}:${type}`;
        handle.position.copy(
          position,
        );
        handle.renderOrder =
          70;
        handle.userData[
          "frameLogicSectionHandle"
        ] = {
          sectionId:
            section.id,
          type,
        } satisfies SectionHandleData;

        group.add(
          handle,
        );
        handles.set(
          type,
          handle,
        );
      };

    /*
     * Las posiciones son locales al BoxGeometry centrado.
     * El plano frontal está en z = -depth/2 y el posterior en +depth/2.
     */
    const frontZ =
      -section.depth / 2;
    const backZ =
      section.depth / 2;
    const halfW =
      section.width / 2;
    const halfH =
      section.height / 2;

    addHandle(
      "CORNER_00",
      new THREE.Vector3(
        -halfW,
        -halfH,
        frontZ,
      ),
      0x72d7ff,
    );
    addHandle(
      "CORNER_10",
      new THREE.Vector3(
        halfW,
        -halfH,
        frontZ,
      ),
      0x72d7ff,
    );
    addHandle(
      "CORNER_11",
      new THREE.Vector3(
        halfW,
        halfH,
        frontZ,
      ),
      0x72d7ff,
    );
    addHandle(
      "CORNER_01",
      new THREE.Vector3(
        -halfW,
        halfH,
        frontZ,
      ),
      0x72d7ff,
    );
    addHandle(
      "DEPTH",
      new THREE.Vector3(
        0,
        0,
        backZ,
      ),
      0xffc857,
    );
    addHandle(
      "MOVE",
      new THREE.Vector3(
        0,
        0,
        frontZ,
      ),
      0x8ee89a,
    );

    /*
     * Flecha de vista: normal = dirección desde el plano frontal hacia
     * el volumen que se incluirá en el PDF.
     */
    const arrowLength =
      Math.max(
        Math.min(
          section.depth * 0.55,
          Math.max(
            section.width,
            section.height,
          ) * 0.35,
        ),
        Math.max(
          section.width,
          section.height,
        ) * 0.12,
        handleRadius * 5,
      );
    const arrow =
      new THREE.ArrowHelper(
        new THREE.Vector3(
          0,
          0,
          1,
        ),
        new THREE.Vector3(
          0,
          0,
          frontZ
          + handleRadius * 2.5,
        ),
        arrowLength,
        0xffc857,
        Math.min(
          arrowLength * 0.3,
          handleRadius * 5,
        ),
        Math.min(
          arrowLength * 0.16,
          handleRadius * 2.8,
        ),
      );

    arrow.name =
      `SectionViewDirection:${section.name}`;
    arrow.traverse(
      (
        child,
      ) => {
        child.renderOrder =
          65;
        child.raycast =
          () => {};
      },
    );
    group.add(
      arrow,
    );

    group.updateMatrixWorld(
      true,
    );

    this.scene.add(
      group,
    );
    this.visuals.set(
      section.id,
      {
        group,
        fillGeometry,
        fillMaterial,
        edgeGeometry,
        edgeMaterial,
        arrow,
        handles,
      },
    );
  }


  private disposeVisual(
    visual: SectionVisual,
  ): void {
    visual.group.removeFromParent();

    for (
      const handle
      of visual.handles.values()
    ) {
      handle.geometry.dispose();
      handle.material.dispose();
    }

    visual.arrow.line.geometry.dispose();
    this.disposeMaterial(
      visual.arrow.line.material,
    );
    visual.arrow.cone.geometry.dispose();
    this.disposeMaterial(
      visual.arrow.cone.material,
    );

    visual.fillGeometry.dispose();
    visual.fillMaterial.dispose();
    visual.edgeGeometry.dispose();
    visual.edgeMaterial.dispose();
  }


  private disposeMaterial(
    material:
      THREE.Material
      | THREE.Material[],
  ): void {
    if (
      Array.isArray(
        material,
      )
    ) {
      for (
        const entry
        of material
      ) {
        entry.dispose();
      }
      return;
    }

    material.dispose();
  }


  private replaceSection(
    section: SectionViewDefinition,
  ): void {
    const index =
      this.sections.findIndex(
        (
          current,
        ) =>
          current.id === section.id,
      );

    if (index < 0) {
      return;
    }

    this.sections[index] =
      section;
    this.createVisual(
      section,
    );
    this.refreshUi();
  }


  private pickHandle(
    clientX: number,
    clientY: number,
  ):
    SectionHandleData | null {
    const rect =
      this.canvas
        .getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }

    this.pointer.x =
      (
        (
          clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;
    this.pointer.y =
      -(
        (
          clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;

    this.handleRaycaster
      .setFromCamera(
        this.pointer,
        this.cameraProvider(),
      );

    const handles:
      THREE.Object3D[] = [];

    for (
      const visual
      of this.visuals.values()
    ) {
      handles.push(
        ...visual.handles.values(),
      );
    }

    const hit =
      this.handleRaycaster
        .intersectObjects(
          handles,
          false,
        )[0];

    if (!hit) {
      return null;
    }

    const data =
      hit.object.userData[
        "frameLogicSectionHandle"
      ] as SectionHandleData | undefined;

    if (
      !data
      || !this.sections.some(
        (
          section,
        ) =>
          section.id === data.sectionId,
      )
    ) {
      return null;
    }

    return data;
  }


  private beginDrag(
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ): void {
    const section =
      this.sections.find(
        (
          entry,
        ) =>
          entry.id === hit.sectionId,
      );

    if (!section) {
      return;
    }

    const origin =
      this.toVector3(
        section.origin,
      );
    const normal =
      this.toVector3(
        section.normal,
      )
        .normalize();
    let dragPlane:
      THREE.Plane;

    if (
      hit.type === "DEPTH"
    ) {
      const depthPoint =
        origin.clone()
          .addScaledVector(
            this.toVector3(
              section.xAxis,
            ),
            section.width / 2,
          )
          .addScaledVector(
            this.toVector3(
              section.yAxis,
            ),
            section.height / 2,
          )
          .addScaledVector(
            normal,
            section.depth,
          );
      const cameraDirection =
        new THREE.Vector3();

      this.cameraProvider()
        .getWorldDirection(
          cameraDirection,
        );

      let tangent =
        cameraDirection
          .clone()
          .addScaledVector(
            normal,
            -cameraDirection.dot(
              normal,
            ),
          );

      if (
        tangent.lengthSq()
        <= 1e-10
      ) {
        tangent =
          this.toVector3(
            section.xAxis,
          );
      }

      tangent.normalize();

      const planeNormal =
        new THREE.Vector3()
          .crossVectors(
            normal,
            tangent,
          );

      if (
        planeNormal.lengthSq()
        <= 1e-10
      ) {
        planeNormal.copy(
          this.toVector3(
            section.yAxis,
          ),
        );
      }

      planeNormal.normalize();
      dragPlane =
        new THREE.Plane()
          .setFromNormalAndCoplanarPoint(
            planeNormal,
            depthPoint,
          );
    }
    else {
      dragPlane =
        new THREE.Plane()
          .setFromNormalAndCoplanarPoint(
            normal,
            origin,
          );
    }

    const startWorldPoint =
      this.intersectPointerWithPlane(
        clientX,
        clientY,
        dragPlane,
      );

    if (!startWorldPoint) {
      return;
    }

    this.dragState = {
      sectionId:
        section.id,
      handleType:
        hit.type,
      startSection:
        section,
      dragPlane,
      startWorldPoint,
    };
    this.canvas.style.cursor =
      "grabbing";
  }


  private updateDrag(
    clientX: number,
    clientY: number,
  ): void {
    const drag =
      this.dragState;

    if (!drag) {
      return;
    }

    const worldPoint =
      this.intersectPointerWithPlane(
        clientX,
        clientY,
        drag.dragPlane,
      );

    if (!worldPoint) {
      return;
    }

    const section =
      drag.startSection;
    const origin =
      this.toVector3(
        section.origin,
      );
    const xAxis =
      this.toVector3(
        section.xAxis,
      )
        .normalize();
    const yAxis =
      this.toVector3(
        section.yAxis,
      )
        .normalize();
    const normal =
      this.toVector3(
        section.normal,
      )
        .normalize();

    if (
      drag.handleType === "DEPTH"
    ) {
      const startDepthPoint =
        origin.clone()
          .addScaledVector(
            xAxis,
            section.width / 2,
          )
          .addScaledVector(
            yAxis,
            section.height / 2,
          )
          .addScaledVector(
            normal,
            section.depth,
          );
      const depth =
        Math.max(
          MIN_SECTION_SIZE,
          section.depth
          + worldPoint
            .clone()
            .sub(
              startDepthPoint,
            )
            .dot(
              normal,
            ),
        );

      this.replaceSection({
        ...section,
        depth,
      });
      return;
    }

    if (
      drag.handleType === "MOVE"
    ) {
      const delta =
        worldPoint.clone()
          .sub(
            drag.startWorldPoint,
          );
      const planarDelta =
        xAxis.clone()
          .multiplyScalar(
            delta.dot(
              xAxis,
            ),
          )
          .addScaledVector(
            yAxis,
            delta.dot(
              yAxis,
            ),
          );

      this.replaceSection({
        ...section,
        origin:
          this.vectorData(
            origin.add(
              planarDelta,
            ),
          ),
      });
      return;
    }

    const local =
      worldPoint.clone()
        .sub(
          origin,
        );
    const x =
      local.dot(
        xAxis,
      );
    const y =
      local.dot(
        yAxis,
      );

    let width =
      section.width;
    let height =
      section.height;
    let nextOrigin =
      origin.clone();

    switch (
      drag.handleType
    ) {
      case "CORNER_00": {
        const clampedX =
          Math.min(
            x,
            section.width
            - MIN_SECTION_SIZE,
          );
        const clampedY =
          Math.min(
            y,
            section.height
            - MIN_SECTION_SIZE,
          );

        width =
          section.width
          - clampedX;
        height =
          section.height
          - clampedY;
        nextOrigin
          .addScaledVector(
            xAxis,
            clampedX,
          )
          .addScaledVector(
            yAxis,
            clampedY,
          );
        break;
      }

      case "CORNER_10": {
        const clampedX =
          Math.max(
            x,
            MIN_SECTION_SIZE,
          );
        const clampedY =
          Math.min(
            y,
            section.height
            - MIN_SECTION_SIZE,
          );

        width =
          clampedX;
        height =
          section.height
          - clampedY;
        nextOrigin
          .addScaledVector(
            yAxis,
            clampedY,
          );
        break;
      }

      case "CORNER_11": {
        width =
          Math.max(
            x,
            MIN_SECTION_SIZE,
          );
        height =
          Math.max(
            y,
            MIN_SECTION_SIZE,
          );
        break;
      }

      case "CORNER_01": {
        const clampedX =
          Math.min(
            x,
            section.width
            - MIN_SECTION_SIZE,
          );

        width =
          section.width
          - clampedX;
        height =
          Math.max(
            y,
            MIN_SECTION_SIZE,
          );
        nextOrigin
          .addScaledVector(
            xAxis,
            clampedX,
          );
        break;
      }

      case "DEPTH":
      case "MOVE":
        break;
    }

    this.replaceSection({
      ...section,
      origin:
        this.vectorData(
          nextOrigin,
        ),
      width,
      height,
    });
  }


  private finishDrag(): void {
    const section =
      this.getActiveSection();

    this.dragState =
      null;
    this.canvas.style.cursor =
      "";

    if (!section) {
      return;
    }

    this.depthInput.value =
      this.formatNumber(
        section.depth,
      );
    this.setStatus(
      `${section.name}: ${this.formatNumber(section.width)} × ${this.formatNumber(section.height)} × ${this.formatNumber(section.depth)} m.`,
    );
  }


  private cancelDrag(
    restore: boolean,
  ): void {
    const drag =
      this.dragState;

    if (!drag) {
      return;
    }

    this.dragState =
      null;
    this.canvas.style.cursor =
      "";

    if (restore) {
      this.replaceSection(
        drag.startSection,
      );
    }
  }


  private intersectPointerWithPlane(
    clientX: number,
    clientY: number,
    plane: THREE.Plane,
  ):
    THREE.Vector3 | null {
    const rect =
      this.canvas
        .getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }

    this.pointer.x =
      (
        (
          clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;
    this.pointer.y =
      -(
        (
          clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;

    this.handleRaycaster
      .setFromCamera(
        this.pointer,
        this.cameraProvider(),
      );

    return this.handleRaycaster
      .ray
      .intersectPlane(
        plane,
        new THREE.Vector3(),
      );
  }


  private buildDrawing(
    section: SectionViewDefinition,
  ):
    SectionDrawingData {
    const projected:
      SectionSegment2D[] = [];
    const cut:
      SectionSegment2D[] = [];
    const instanceIds =
      new Set<string>();
    const worldToSection =
      this.sectionWorldToLocalMatrix(
        section,
      );

    this.scene.updateMatrixWorld(
      true,
    );

    for (
      const [
        instanceId,
        object,
      ]
      of this.designScene.getInstanceEntries()
    ) {
      if (!object.visible) {
        continue;
      }

      let hasGeometry =
        false;

      object.updateWorldMatrix(
        true,
        true,
      );
      object.traverse(
        (
          child,
        ) => {
          if (
            !(child instanceof THREE.Mesh)
            || !child.visible
          ) {
            return;
          }

          const edgeGeometry =
            new THREE.EdgesGeometry(
              child.geometry,
              28,
            );
          const edgePosition =
            edgeGeometry.getAttribute(
              "position",
            );

          for (
            let index = 0;
            index + 1 < edgePosition.count;
            index += 2
          ) {
            const a =
              new THREE.Vector3()
                .fromBufferAttribute(
                  edgePosition,
                  index,
                )
                .applyMatrix4(
                  child.matrixWorld,
                )
                .applyMatrix4(
                  worldToSection,
                );
            const b =
              new THREE.Vector3()
                .fromBufferAttribute(
                  edgePosition,
                  index + 1,
                )
                .applyMatrix4(
                  child.matrixWorld,
                )
                .applyMatrix4(
                  worldToSection,
                );
            const clipped =
              this.clipSegmentToSectionBox(
                a,
                b,
                section,
              );

            if (clipped) {
              projected.push({
                x1:
                  clipped[0].x,
                y1:
                  clipped[0].y,
                x2:
                  clipped[1].x,
                y2:
                  clipped[1].y,
              });
              hasGeometry =
                true;
            }
          }

          edgeGeometry.dispose();

          const cutSegments =
            this.extractMeshCutSegments(
              child,
              worldToSection,
              section,
            );

          if (
            cutSegments.length > 0
          ) {
            cut.push(
              ...cutSegments,
            );
            hasGeometry =
              true;
          }
        },
      );

      if (hasGeometry) {
        instanceIds.add(
          instanceId,
        );
      }
    }

    return {
      projected,
      cut,
      instanceIds,
    };
  }


  private extractMeshCutSegments(
    mesh: THREE.Mesh,
    worldToSection: THREE.Matrix4,
    section: SectionViewDefinition,
  ):
    SectionSegment2D[] {
    const result:
      SectionSegment2D[] = [];
    const geometry =
      mesh.geometry;
    const position =
      geometry.getAttribute(
        "position",
      );

    if (
      !position
      || position.count < 3
    ) {
      return result;
    }

    const index =
      geometry.getIndex();
    const triangleCount =
      index
        ? Math.floor(
            index.count / 3,
          )
        : Math.floor(
            position.count / 3,
          );

    const readVertex =
      (
        vertexIndex: number,
      ) =>
        new THREE.Vector3()
          .fromBufferAttribute(
            position,
            vertexIndex,
          )
          .applyMatrix4(
            mesh.matrixWorld,
          )
          .applyMatrix4(
            worldToSection,
          );

    for (
      let triangleIndex = 0;
      triangleIndex < triangleCount;
      triangleIndex += 1
    ) {
      const base =
        triangleIndex * 3;
      const ia =
        index
          ? index.getX(base)
          : base;
      const ib =
        index
          ? index.getX(base + 1)
          : base + 1;
      const ic =
        index
          ? index.getX(base + 2)
          : base + 2;
      const a =
        readVertex(ia);
      const b =
        readVertex(ib);
      const c =
        readVertex(ic);
      const points =
        this.intersectTriangleWithSectionPlane(
          a,
          b,
          c,
        );

      if (points.length < 2) {
        continue;
      }

      const first =
        points[0];
      const second =
        points[1];

      if (
        !first
        || !second
      ) {
        continue;
      }

      const clipped =
        this.clipSegment2D(
          first,
          second,
          section.width,
          section.height,
        );

      if (!clipped) {
        continue;
      }

      result.push({
        x1:
          clipped[0].x,
        y1:
          clipped[0].y,
        x2:
          clipped[1].x,
        y2:
          clipped[1].y,
      });
    }

    return result;
  }


  private intersectTriangleWithSectionPlane(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ):
    THREE.Vector3[] {
    const vertices =
      [
        a,
        b,
        c,
      ];
    const allCoplanar =
      vertices.every(
        (
          point,
        ) =>
          Math.abs(point.z)
          <= SECTION_EPSILON,
      );

    if (allCoplanar) {
      return [];
    }

    const intersections:
      THREE.Vector3[] = [];

    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      const first =
        vertices[index];
      const second =
        vertices[(index + 1) % 3];

      if (
        !first
        || !second
      ) {
        continue;
      }

      const firstOn =
        Math.abs(first.z)
        <= SECTION_EPSILON;
      const secondOn =
        Math.abs(second.z)
        <= SECTION_EPSILON;

      if (firstOn) {
        this.pushUniquePoint(
          intersections,
          first,
        );
      }

      if (
        firstOn
        && secondOn
      ) {
        continue;
      }

      if (
        first.z * second.z
        < 0
      ) {
        const t =
          first.z
          / (first.z - second.z);
        const point =
          first.clone()
            .lerp(
              second,
              t,
            );

        point.z =
          0;
        this.pushUniquePoint(
          intersections,
          point,
        );
      }
    }

    return intersections.slice(
      0,
      2,
    );
  }


  private pushUniquePoint(
    points: THREE.Vector3[],
    point: THREE.Vector3,
  ): void {
    if (
      points.some(
        (
          current,
        ) =>
          current.distanceToSquared(
            point,
          )
          <= 1e-12,
      )
    ) {
      return;
    }

    points.push(
      point.clone(),
    );
  }


  private clipSegmentToSectionBox(
    start: THREE.Vector3,
    end: THREE.Vector3,
    section: SectionViewDefinition,
  ):
    [THREE.Vector3, THREE.Vector3]
    | null {
    let t0 =
      0;
    let t1 =
      1;
    const delta =
      end.clone()
        .sub(
          start,
        );
    const axes:
      Array<{
        start: number;
        delta: number;
        min: number;
        max: number;
      }> = [
        {
          start:
            start.x,
          delta:
            delta.x,
          min:
            0,
          max:
            section.width,
        },
        {
          start:
            start.y,
          delta:
            delta.y,
          min:
            0,
          max:
            section.height,
        },
        {
          start:
            start.z,
          delta:
            delta.z,
          min:
            0,
          max:
            section.depth,
        },
      ];

    for (
      const axis
      of axes
    ) {
      if (
        Math.abs(axis.delta)
        <= SECTION_EPSILON
      ) {
        if (
          axis.start < axis.min
          || axis.start > axis.max
        ) {
          return null;
        }
        continue;
      }

      let near =
        (axis.min - axis.start)
        / axis.delta;
      let far =
        (axis.max - axis.start)
        / axis.delta;

      if (near > far) {
        [near, far] =
          [far, near];
      }

      t0 =
        Math.max(
          t0,
          near,
        );
      t1 =
        Math.min(
          t1,
          far,
        );

      if (t0 > t1) {
        return null;
      }
    }

    return [
      start.clone()
        .addScaledVector(
          delta,
          t0,
        ),
      start.clone()
        .addScaledVector(
          delta,
          t1,
        ),
    ];
  }


  private clipSegment2D(
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    height: number,
  ):
    [THREE.Vector3, THREE.Vector3]
    | null {
    const pseudoSection:
      SectionViewDefinition = {
        id:
          "clip",
        name:
          "clip",
        origin: {
          x: 0,
          y: 0,
          z: 0,
        },
        xAxis: {
          x: 1,
          y: 0,
          z: 0,
        },
        yAxis: {
          x: 0,
          y: 1,
          z: 0,
        },
        normal: {
          x: 0,
          y: 0,
          z: 1,
        },
        width,
        height,
        depth:
          SECTION_EPSILON * 2,
      };
    const a =
      start.clone();
    const b =
      end.clone();

    a.z =
      SECTION_EPSILON;
    b.z =
      SECTION_EPSILON;

    return this.clipSegmentToSectionBox(
      a,
      b,
      pseudoSection,
    );
  }


  private createPdf(
    section: SectionViewDefinition,
    drawing: SectionDrawingData,
  ):
    Uint8Array<ArrayBuffer> {
    const pageWidth =
      841.89;
    const pageHeight =
      595.28;
    const margin =
      36;
    const titleHeight =
      46;
    const availableWidth =
      pageWidth
      - margin * 2;
    const availableHeight =
      pageHeight
      - margin * 2
      - titleHeight;
    const scale =
      Math.min(
        availableWidth
        / section.width,
        availableHeight
        / section.height,
      );
    const drawingWidth =
      section.width
      * scale;
    const drawingHeight =
      section.height
      * scale;
    const offsetX =
      margin
      + (availableWidth - drawingWidth) / 2;
    const offsetY =
      margin
      + titleHeight
      + (availableHeight - drawingHeight) / 2;
    const commands:
      string[] = [
        "q",
        "1 J 1 j",
        "0.72 G 0.35 w",
        `${this.pdfNumber(offsetX)} ${this.pdfNumber(offsetY)} ${this.pdfNumber(drawingWidth)} ${this.pdfNumber(drawingHeight)} re S`,
        "0.28 G 0.28 w",
      ];

    for (
      const segment
      of drawing.projected
    ) {
      commands.push(
        this.pdfSegment(
          segment,
          offsetX,
          offsetY,
          scale,
        ),
      );
    }

    commands.push(
      "0 G 0.9 w",
    );

    for (
      const segment
      of drawing.cut
    ) {
      commands.push(
        this.pdfSegment(
          segment,
          offsetX,
          offsetY,
          scale,
        ),
      );
    }

    const title =
      this.pdfText(
        section.name,
      );
    const info =
      this.pdfText(
        `Profundidad: ${this.formatNumber(section.depth)} m   Piezas: ${drawing.instanceIds.size}`,
      );

    commands.push(
      "0 G",
      `BT /F1 12 Tf ${this.pdfNumber(margin)} 28 Td (${title}) Tj ET`,
      `BT /F1 8 Tf ${this.pdfNumber(margin + 190)} 28 Td (${info}) Tj ET`,
      "Q",
    );

    const stream =
      commands.join(
        "\n",
      );
    const encoder =
      new TextEncoder();
    const streamLength =
      encoder.encode(
        stream,
      ).length;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pdfNumber(pageWidth)} ${this.pdfNumber(pageHeight)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    ];

    let pdf =
      "%PDF-1.4\n";
    const offsets:
      number[] = [
        0,
      ];

    for (
      let index = 0;
      index < objects.length;
      index += 1
    ) {
      offsets.push(
        encoder.encode(
          pdf,
        ).length,
      );
      pdf +=
        `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset =
      encoder.encode(
        pdf,
      ).length;

    pdf +=
      `xref\n0 ${objects.length + 1}\n`;
    pdf +=
      "0000000000 65535 f \n";

    for (
      let index = 1;
      index < offsets.length;
      index += 1
    ) {
      pdf +=
        `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }

    pdf +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return encoder.encode(
      pdf,
    );
  }


  private pdfSegment(
    segment: SectionSegment2D,
    offsetX: number,
    offsetY: number,
    scale: number,
  ): string {
    return `${this.pdfNumber(offsetX + segment.x1 * scale)} ${this.pdfNumber(offsetY + segment.y1 * scale)} m ${this.pdfNumber(offsetX + segment.x2 * scale)} ${this.pdfNumber(offsetY + segment.y2 * scale)} l S`;
  }


  private sectionWorldToLocalMatrix(
    section: SectionViewDefinition,
  ):
    THREE.Matrix4 {
    const matrix =
      new THREE.Matrix4()
        .makeBasis(
          this.toVector3(
            section.xAxis,
          ),
          this.toVector3(
            section.yAxis,
          ),
          this.toVector3(
            section.normal,
          ),
        );

    matrix.setPosition(
      this.toVector3(
        section.origin,
      ),
    );

    return matrix.invert();
  }


  private toPlaneCoordinates(
    point: THREE.Vector3,
    plane: ReturnType<CadWorkPlaneController["getState"]>,
  ):
    THREE.Vector2 {
    const delta =
      point.clone()
        .sub(
          plane.origin,
        );

    return new THREE.Vector2(
      delta.dot(
        plane.xAxis,
      ),
      delta.dot(
        plane.yAxis,
      ),
    );
  }


  private readDepth():
    number | null {
    const value =
      Number(
        this.depthInput.value,
      );

    if (
      !Number.isFinite(value)
      || value <= 0
    ) {
      this.setStatus(
        "La profundidad debe ser mayor que 0.",
      );
      return null;
    }

    return value;
  }


  private refreshUi(): void {
    const active =
      this.getActiveSection();
    const creating =
      this.creationStage
      !== "IDLE";

    this.createButton.textContent =
      creating
        ? "Cancelar"
        : "Dibujar";
    this.pdfButton.disabled =
      !active;
    this.reverseButton.disabled =
      !active;
    this.deleteButton.disabled =
      !active;

    if (
      active
      && !creating
    ) {
      this.depthInput.value =
        this.formatNumber(
          active.depth,
        );
    }
  }


  private setStatus(
    message: string,
  ): void {
    this.status.textContent =
      message;
    this.status.title =
      message;
  }


  private makeButton(
    label: string,
  ):
    HTMLButtonElement {
    const button =
      document.createElement(
        "button",
      );

    button.type =
      "button";
    button.textContent =
      label;
    button.style.padding =
      "4px 7px";
    button.style.border =
      "1px solid rgba(255,255,255,0.18)";
    button.style.borderRadius =
      "4px";
    button.style.background =
      "#26343c";
    button.style.color =
      "#f1f5f7";
    button.style.cursor =
      "pointer";

    return button;
  }


  private sectionLetter(
    index: number,
  ): string {
    const code =
      65
      + (index % 26);

    return String.fromCharCode(
      code,
    );
  }


  private vectorData(
    vector: THREE.Vector3,
  ):
    SectionVector3 {
    return {
      x:
        vector.x,
      y:
        vector.y,
      z:
        vector.z,
    };
  }


  private toVector3(
    vector: SectionVector3,
  ):
    THREE.Vector3 {
    return new THREE.Vector3(
      vector.x,
      vector.y,
      vector.z,
    );
  }


  private formatNumber(
    value: number,
  ): string {
    return Number(
      value.toFixed(
        4,
      ),
    ).toString();
  }


  private pdfNumber(
    value: number,
  ): string {
    return value.toFixed(
      3,
    );
  }


  private pdfText(
    value: string,
  ): string {
    return value
      .normalize(
        "NFD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .replace(
        /[^\x20-\x7E]/g,
        "",
      )
      .replace(
        /\\/g,
        "\\\\",
      )
      .replace(
        /\(/g,
        "\\(",
      )
      .replace(
        /\)/g,
        "\\)",
      );
  }


  private fileSafeName(
    value: string,
  ): string {
    return this.pdfText(
      value,
    )
      .replace(
        /[^A-Za-z0-9_-]+/g,
        "_",
      );
  }
}
