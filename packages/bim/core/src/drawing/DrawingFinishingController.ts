import * as THREE from "three";

import type {
  DesignModel,
  FrameLogicEngineeringModel,
} from "@framelogic/domain";

import {
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

import type {
  DrawingProfessionalController,
} from "./DrawingProfessionalController";

import type {
  DrawingProductionController,
  SheetState,
} from "./DrawingProductionController";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

import {
  getStepBrepDocumentId,
} from "../step/StepEngineeringBridge";

interface AnnotationRuntime {
  id: string;
  kind: string;
  locked?: boolean;
  offsetX?: number;
  offsetY?: number;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

interface DrawingDocumentRuntime {
  readonly sectionId: string;
  readonly annotations: AnnotationRuntime[];
}

interface WorkspaceRuntime {
  readonly overlay: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly documents: Map<string, DrawingDocumentRuntime>;
  activeSectionId: string | null;
  selectedAnnotationId: string | null;
  tool: string;
  snapshot: {
    readonly section: SectionViewDefinition;
  } | null;
  render(): void;
  handleLabelPoint(x: number, y: number): void;
  eventToSheetPoint(event: PointerEvent | MouseEvent): THREE.Vector2 | null;
  setTool(tool: "SELECT" | "DIMENSION" | "LABEL" | "TEXT"): void;
  setStatus(message: string): void;
  appendSvgLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    strokeWidth: number,
    annotationId?: string,
  ): void;
  appendSvgText(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    fill: string,
    anchor: "start" | "middle" | "end",
    annotationId?: string,
  ): void;
  sectionToPaper(
    section: SectionViewDefinition,
    x: number,
    y: number,
  ): THREE.Vector2;
}

interface ProductionRuntime {
  readonly sheets: Map<string, SheetState>;
  getActiveSheet(): SheetState | null;
  pickReference(x: number, y: number): {
    instanceId: string;
    x: number;
    y: number;
    [key: string]: unknown;
  } | null;
}

export interface DrawingFinishingControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly engineeringModel: FrameLogicEngineeringModel;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly drawingProduction: DrawingProductionController;
  readonly drawingProfessional: DrawingProfessionalController;
}

export class DrawingFinishingController {
  private readonly designModel: DesignModel;
  private readonly engineeringModel: FrameLogicEngineeringModel;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly workspace: WorkspaceRuntime;
  private readonly production: ProductionRuntime;
  private readonly professional: DrawingProfessionalController;
  private readonly controls: HTMLElement[] = [];
  private annotationClipboard: AnnotationRuntime | null = null;
  private readonly staleSectionIds = new Set<string>();
  private lastModelSignature = "";
  private disposed = false;
  private readonly timer: number;
  private readonly baseRender: () => void;
  private readonly baseHandleLabelPoint: (x: number, y: number) => void;

  constructor(
    options: DrawingFinishingControllerOptions,
  ) {
    this.designModel = options.designModel;
    this.engineeringModel = options.engineeringModel;
    this.sectionDrawing = options.sectionDrawing;
    this.workspace = options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.production = options.drawingProduction as unknown as ProductionRuntime;
    this.professional = options.drawingProfessional;

    this.baseRender = this.workspace.render.bind(options.drawingWorkspace);
    this.baseHandleLabelPoint = this.workspace.handleLabelPoint.bind(options.drawingWorkspace);

    this.workspace.render = () => this.render();
    this.workspace.handleLabelPoint = (x, y) => this.handleLabelPoint(x, y);

    this.installToolbar(options.container);
    this.workspace.svg.addEventListener("pointerdown", this.handlePointerDown, true);
    window.addEventListener("keydown", this.handleKeyDown, true);

    this.lastModelSignature = this.modelSignature();
    this.timer = window.setInterval(() => this.detectModelChanges(), 650);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    this.workspace.svg.removeEventListener("pointerdown", this.handlePointerDown, true);
    for (const control of this.controls) control.remove();
  }

  markCurrentDrawingUpdated(): void {
    const id = this.workspace.activeSectionId;
    if (id) this.staleSectionIds.delete(id);
    this.workspace.render();
  }

  private installToolbar(container: HTMLElement): void {
    const overlay = container.querySelector<HTMLElement>('[data-framelogic-drawing-workspace="true"]');
    const toolbar = overlay?.firstElementChild as HTMLElement | null;
    if (!toolbar) return;

    const lockButton = this.makeButton("Bloquear", "Bloquear/desbloquear anotación seleccionada");
    const alignButton = this.makeButton("Alinear cotas", "Ordenar offsets de cotas del plano");
    const freezeButton = this.makeButton("Congelar rev", "Guardar una copia vectorial de la revisión actual");
    const exactButton = this.makeButton("Actualizar exacto", "Regenerar OpenCascade Section/HLR");
    const templateSelect = this.makeSelect([
      ["ISO_SIMPLE", "Cajetín ISO"],
      ["STRUCTURAL", "Cajetín estructural"],
      ["FABRICATION", "Cajetín fabricación"],
    ]);
    templateSelect.title = "Plantilla de cajetín";
    templateSelect.value = this.professional.createProfessionalSnapshot().state.titleBlockTemplate;

    lockButton.addEventListener("click", () => this.toggleSelectedLock(lockButton));
    alignButton.addEventListener("click", () => this.alignDimensions());
    freezeButton.addEventListener("click", () => this.freezeRevision());
    exactButton.addEventListener("click", () => {
      const id = this.workspace.activeSectionId;
      void this.professional.refreshExactDrawing(id ?? undefined)
        .then(() => {
          if (id) this.staleSectionIds.delete(id);
          this.workspace.setStatus("Plano actualizado desde OpenCascade/Model Space.");
          this.workspace.render();
        });
    });
    templateSelect.addEventListener("change", () => {
      const snapshot = this.professional.createProfessionalSnapshot();
      snapshot.state.titleBlockTemplate = templateSelect.value as "ISO_SIMPLE" | "STRUCTURAL" | "FABRICATION";
      this.professional.restoreProfessionalSnapshot(snapshot);
    });

    for (const control of [lockButton, alignButton, freezeButton, exactButton, templateSelect]) {
      toolbar.append(control);
      this.controls.push(control);
    }
  }

  private handleLabelPoint(
    paperX: number,
    paperY: number,
  ): void {
    const reference =
      this.production.pickReference(
        paperX,
        paperY,
      );
    if (!reference) {
      this.baseHandleLabelPoint(paperX, paperY);
      return;
    }
    const instance =
      this.designModel.pieceInstances.get(reference.instanceId);
    const definition =
      instance
        ? this.designModel.pieceDefinitions.get(instance.definitionId)
        : undefined;
    const engineering =
      definition
        ? this.engineeringModel.pieces.get(definition.id)
        : undefined;
    const material = [
      engineering?.material?.name,
      engineering?.material?.grade,
    ].filter(Boolean).join(" ");
    const suggested = [
      definition?.code
        ?? `PIEZA ${reference.instanceId.slice(0, 8)}`,
      definition?.name,
      material || undefined,
    ].filter(Boolean).join(" · ");
    const text =
      window.prompt(
        "Texto del label",
        suggested,
      );
    if (text === null) return;
    const documentState = this.activeDocument();
    if (!documentState) return;
    documentState.annotations.push({
      id: crypto.randomUUID(),
      kind: "LABEL",
      target: reference,
      text:
        text.trim()
        || suggested,
      offsetX: 55,
      offsetY: -38,
      autoSource: {
        instanceId: reference.instanceId,
        definitionId: definition?.id,
      },
    });
    this.workspace.setTool("SELECT");
    this.workspace.render();
  }

  private render(): void {
    this.baseRender();
    this.renderCenterMarks();
    this.renderStaleStatus();
    this.renderLockStatus();
  }

  private renderCenterMarks(): void {
    const snapshot = this.workspace.snapshot;
    if (!snapshot) return;
    const section = snapshot.section;
    const worldToSection = sectionWorldToLocalMatrix(section);
    const sectionNormal = new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z).normalize();
    const kernel = getOpenCascadeBrepKernel();

    for (const instance of this.designModel.pieceInstances.getAll()) {
      const documentId = getStepBrepDocumentId(instance.definitionId);
      const document = documentId ? kernel.getDocument(documentId) : undefined;
      if (!document) continue;
      const object = this.findInstanceObject(instance.id);
      if (!object || !object.visible) continue;
      object.updateMatrixWorld(true);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      const worldScale = new THREE.Vector3();
      object.getWorldScale(worldScale);
      const radiusScale = (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;

      for (const edge of document.edges) {
        if (!edge.circle) continue;
        const normal = new THREE.Vector3(edge.circle.normal.x, edge.circle.normal.y, edge.circle.normal.z).applyMatrix3(normalMatrix).normalize();
        if (Math.abs(normal.dot(sectionNormal)) < 0.985) continue;
        const centerWorld = new THREE.Vector3(
          edge.circle.center.x * document.modelScale,
          edge.circle.center.y * document.modelScale,
          edge.circle.center.z * document.modelScale,
        ).applyMatrix4(object.matrixWorld);
        const local = centerWorld.applyMatrix4(worldToSection);
        if (local.z < -1e-5 || local.z > section.depth + 1e-5) continue;
        if (local.x < 0 || local.x > section.width || local.y < 0 || local.y > section.height) continue;
        const center = this.workspace.sectionToPaper(section, local.x, local.y);
        const radius = edge.circle.radius * document.modelScale * radiusScale;
        const edgePaper = this.workspace.sectionToPaper(section, local.x + radius, local.y);
        const radiusPx = Math.abs(edgePaper.x - center.x);
        const mark = Math.max(7, Math.min(14, radiusPx * 0.35));
        this.workspace.appendSvgLine(center.x - mark, center.y, center.x + mark, center.y, "#59666d", 0.45);
        this.workspace.appendSvgLine(center.x, center.y - mark, center.x, center.y + mark, "#59666d", 0.45);
      }
    }
  }

  private renderStaleStatus(): void {
    const id = this.workspace.activeSectionId;
    if (!id || !this.staleSectionIds.has(id)) return;
    this.workspace.appendSvgText(
      20,
      40,
      "⚠ PLANO DESACTUALIZADO · pulsa Actualizar exacto",
      9,
      "#b35c00",
      "start",
    );
  }

  private renderLockStatus(): void {
    const annotation = this.selectedAnnotation();
    if (!annotation?.locked) return;
    this.workspace.appendSvgText(
      20,
      56,
      "🔒 ANOTACIÓN BLOQUEADA",
      9,
      "#59666d",
      "start",
    );
  }

  private toggleSelectedLock(button: HTMLButtonElement): void {
    const annotation = this.selectedAnnotation();
    if (!annotation) {
      this.workspace.setStatus("Selecciona una anotación para bloquearla.");
      return;
    }
    annotation.locked = !annotation.locked;
    button.textContent = annotation.locked ? "Desbloquear" : "Bloquear";
    this.workspace.render();
  }

  private alignDimensions(): void {
    const drawing = this.activeDocument();
    if (!drawing) return;
    const dimensions = drawing.annotations.filter((annotation) => annotation.kind === "DIMENSION");
    let horizontalIndex = 0;
    let verticalIndex = 0;
    let genericIndex = 0;
    for (const annotation of dimensions) {
      const mode = String(annotation["dimensionMode"] ?? "ALIGNED");
      if (mode === "HORIZONTAL") {
        annotation.offsetY = -28 - horizontalIndex * 18;
        horizontalIndex += 1;
      }
      else if (mode === "VERTICAL") {
        annotation.offsetX = 28 + verticalIndex * 18;
        verticalIndex += 1;
      }
      else {
        annotation.offsetY = -28 - genericIndex * 16;
        genericIndex += 1;
      }
    }
    this.workspace.render();
    this.workspace.setStatus(`${dimensions.length} cotas alineadas.`);
  }

  private freezeRevision(): void {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return;
    let revision = sheet.revisions.at(-1);
    if (!revision) {
      const code = window.prompt("Código de revisión", "1")?.trim();
      if (!code) return;
      revision = {
        id: crypto.randomUUID(),
        code,
        description: "Revisión congelada",
        date: new Date().toISOString().slice(0, 10),
      };
      sheet.revisions.push(revision);
    }
    this.workspace.render();
    const snapshot = this.professional.createProfessionalSnapshot();
    snapshot.state.frozenRevisions.push({
      id: crypto.randomUUID(),
      sheetOwnerSectionId: sheet.ownerSectionId,
      revisionCode: revision.code,
      createdAt: new Date().toISOString(),
      svg: this.workspace.svg.outerHTML,
    });
    this.professional.restoreProfessionalSnapshot(snapshot);
    this.workspace.setStatus(`Revisión ${revision.code} congelada.`);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.workspace.overlay.style.display === "none") return;
    const target = event.target instanceof Element ? event.target.closest("[data-annotation-id]") : null;
    const id = target?.getAttribute("data-annotation-id");
    if (!id) return;
    const annotation = this.activeDocument()?.annotations.find((entry) => entry.id === id);
    if (annotation?.locked && this.workspace.tool === "SELECT") {
      this.workspace.selectedAnnotationId = id;
      this.workspace.render();
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.workspace.overlay.style.display === "none") return;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (command && key === "c") {
      const annotation = this.selectedAnnotation();
      if (!annotation) return;
      this.annotationClipboard = cloneJson(annotation);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (command && key === "v" && this.annotationClipboard) {
      const documentState = this.activeDocument();
      if (!documentState) return;
      const copy = cloneJson(this.annotationClipboard);
      copy.id = crypto.randomUUID();
      copy.locked = false;
      if (typeof copy.offsetX === "number") copy.offsetX += 18;
      if (typeof copy.offsetY === "number") copy.offsetY += 18;
      if (typeof copy.x === "number") copy.x += 18;
      if (typeof copy.y === "number") copy.y += 18;
      documentState.annotations.push(copy);
      this.workspace.selectedAnnotationId = copy.id;
      this.workspace.render();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && this.selectedAnnotation()?.locked) {
      this.workspace.setStatus("La anotación está bloqueada. Desbloquéala antes de borrarla.");
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private detectModelChanges(): void {
    const signature = this.modelSignature();
    if (signature === this.lastModelSignature) return;
    if (this.lastModelSignature) {
      for (const section of this.sectionDrawing.getSections()) {
        this.staleSectionIds.add(section.id);
      }
      if (this.workspace.overlay.style.display !== "none") this.workspace.render();
    }
    this.lastModelSignature = signature;
  }

  private modelSignature(): string {
    return JSON.stringify({
      pieces:
        this.designModel.pieceInstances.getAll().map((instance) => [
          instance.id,
          instance.definitionId,
          instance.layerId,
          instance.transform.position.x,
          instance.transform.position.y,
          instance.transform.position.z,
          instance.transform.rotation.x,
          instance.transform.rotation.y,
          instance.transform.rotation.z,
        ]),
      points:
        this.designModel.cadPoints.getAll().map((point) => [point.id, point.position.x, point.position.y, point.position.z]),
      lines:
        this.designModel.cadLines.getAll().map((line) => [line.id, line.start.x, line.start.y, line.start.z, line.end.x, line.end.y, line.end.z]),
    });
  }

  private activeDocument(): DrawingDocumentRuntime | null {
    const id = this.workspace.activeSectionId;
    return id ? this.workspace.documents.get(id) ?? null : null;
  }

  private selectedAnnotation(): AnnotationRuntime | null {
    const id = this.workspace.selectedAnnotationId;
    return id ? this.activeDocument()?.annotations.find((annotation) => annotation.id === id) ?? null : null;
  }

  private findInstanceObject(instanceId: string): THREE.Object3D | undefined {
    const scene = (this.designModel as unknown as { __scene?: never });
    void scene;
    const candidate = document.querySelector(`[data-unused="${instanceId}"]`);
    void candidate;
    return (this.workspace as unknown as { __designScene?: never }) && undefined;
  }

  private makeButton(label: string, title: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    Object.assign(button.style, {
      padding: "4px 7px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
      font: "inherit",
    });
    return button;
  }

  private makeSelect(values: readonly (readonly [string, string])[]): HTMLSelectElement {
    const select = document.createElement("select");
    Object.assign(select.style, {
      padding: "4px 5px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#11181d",
      color: "#eef4f6",
      font: "inherit",
    });
    for (const [value, label] of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    return select;
  }
}

function sectionWorldToLocalMatrix(section: SectionViewDefinition): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(section.xAxis.x, section.xAxis.y, section.xAxis.z),
    new THREE.Vector3(section.yAxis.x, section.yAxis.y, section.yAxis.z),
    new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z),
  );
  matrix.setPosition(section.origin.x, section.origin.y, section.origin.z);
  return matrix.invert();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
