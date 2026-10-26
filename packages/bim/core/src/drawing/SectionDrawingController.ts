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


interface SectionVisual {
  readonly group: THREE.Group;
  readonly fillGeometry: THREE.BoxGeometry;
  readonly fillMaterial: THREE.MeshBasicMaterial;
  readonly edgeGeometry: THREE.EdgesGeometry;
  readonly edgeMaterial: THREE.LineBasicMaterial;
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


/**
 * MVP de planos de sección FrameLogic.
 *
 * El usuario define un rectángulo sobre el WorkPlane activo y una profundidad.
 * Ese rectángulo se convierte en un volumen 3D orientado. El PDF proyecta
 * únicamente geometría que cae dentro de ese volumen.
 *
 * Esta primera implementación genera el dibujo desde las mallas Three.js:
 * - EdgesGeometry -> líneas proyectadas dentro de la profundidad.
 * - Intersección triángulo/plano -> línea gruesa de corte.
 *
 * La definición de SectionView es independiente de la fuente geométrica para
 * que el extractor pueda migrarse después a OCCT Section + HLR exacto.
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
    panel.style.left =
      "16px";
    panel.style.bottom =
      "16px";
    panel.style.zIndex =
      "80";
    panel.style.display =
      "flex";
    panel.style.alignItems =
      "center";
    panel.style.gap =
      "6px";
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
    this.canvas.style.cursor =
      "";
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
        `${section.name}: profundidad invertida.`,
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
        this.creationStage === "IDLE"
        || event.button !== 0
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };


  private readonly handlePointerUp =
    (
      event: PointerEvent,
    ): void => {
      if (
        this.creationStage === "IDLE"
        || event.button !== 0
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
      if (
        this.creationStage === "IDLE"
        || !this.firstPoint
      ) {
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
    };


  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        event.key !== "Escape"
        || this.creationStage === "IDLE"
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
      },
    );
  }


  private disposeVisual(
    visual: SectionVisual,
  ): void {
    visual.group.removeFromParent();
    visual.fillGeometry.dispose();
    visual.fillMaterial.dispose();
    visual.edgeGeometry.dispose();
    visual.edgeMaterial.dispose();
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

      const clipped =
        this.clipSegment2D(
          points[0],
          points[1],
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
    Uint8Array {
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
