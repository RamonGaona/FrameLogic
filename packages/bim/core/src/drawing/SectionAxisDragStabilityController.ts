import * as THREE from "three";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

type AxisHandleType = "DEPTH" | "NORMAL_MOVE";
type CornerHandleType =
  | "CORNER_00"
  | "CORNER_10"
  | "CORNER_11"
  | "CORNER_01"
  | "BACK_CORNER_00"
  | "BACK_CORNER_10"
  | "BACK_CORNER_11"
  | "BACK_CORNER_01";
type RuntimeHandleType =
  | CornerHandleType
  | "MOVE"
  | AxisHandleType;

interface SectionHandleData {
  readonly sectionId: string;
  readonly type: RuntimeHandleType;
}

interface AxisDragState {
  readonly sectionId: string;
  readonly handleType: RuntimeHandleType;
  readonly startSection: SectionViewDefinition;
  readonly dragPlane: THREE.Plane;
  readonly startWorldPoint: THREE.Vector3;
  readonly axisClientX?: number;
  readonly axisClientY?: number;
  readonly axisScreenX?: number;
  readonly axisScreenY?: number;
  readonly worldPerPixel?: number;
  cornerClientX?: number;
  cornerClientY?: number;
}

interface SectionDrawingRuntime {
  dragState: AxisDragState | null;
  beginDrag(
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ): void;
  updateDrag(clientX: number, clientY: number): void;
  replaceSection(section: SectionViewDefinition): void;
  setStatus(message: string): void;
}

interface Options {
  readonly canvas: HTMLElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly sectionDrawing: SectionDrawingController;
}

const MIN_SECTION_SIZE = 0.01;

/*
 * Los puntos azules estaban demasiado sensibles porque el raycast nativo
 * convierte directamente cada pixel del mouse en una nueva intersección sobre
 * el plano de edición. Reducir a 50% conserva exactamente la geometría del
 * cálculo, pero permite ajustes de ancho/alto mucho más finos.
 */
const CORNER_DRAG_SENSITIVITY = 0.5;

/**
 * Hace estable la edición de los controles del volumen de sección:
 *
 * - Amarillo (DEPTH): cambia la profundidad.
 * - Magenta (NORMAL_MOVE): desplaza todo el volumen perpendicular al plano.
 * - Azules frontales/posteriores: ajustan ancho/alto con sensibilidad reducida.
 *
 * Amarillo y magenta usan la proyección de la normal en pantalla. Los azules
 * conservan el cálculo geométrico nativo, pero reciben un delta de mouse
 * amortiguado para evitar movimientos demasiado rápidos.
 */
export class SectionAxisDragStabilityController {
  private readonly options: Options;
  private readonly runtime: SectionDrawingRuntime;
  private readonly baseBeginDrag: SectionDrawingRuntime["beginDrag"];
  private readonly baseUpdateDrag: SectionDrawingRuntime["updateDrag"];
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.runtime =
      options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.baseBeginDrag =
      this.runtime.beginDrag.bind(this.runtime);
    this.baseUpdateDrag =
      this.runtime.updateDrag.bind(this.runtime);

    this.runtime.beginDrag = (
      hit: SectionHandleData,
      clientX: number,
      clientY: number,
    ): void => {
      if (hit.type === "DEPTH" || hit.type === "NORMAL_MOVE") {
        this.beginAxisDrag(hit, clientX, clientY);
        return;
      }

      if (this.isCornerHandle(hit.type)) {
        this.baseBeginDrag(hit, clientX, clientY);
        const drag = this.runtime.dragState;
        if (drag && drag.sectionId === hit.sectionId) {
          drag.cornerClientX = clientX;
          drag.cornerClientY = clientY;
        }
        return;
      }

      this.baseBeginDrag(hit, clientX, clientY);
    };

    this.runtime.updateDrag = (
      clientX: number,
      clientY: number,
    ): void => {
      const drag = this.runtime.dragState;
      if (
        drag
        && (drag.handleType === "DEPTH" || drag.handleType === "NORMAL_MOVE")
        && Number.isFinite(drag.worldPerPixel)
        && Number.isFinite(drag.axisClientX)
        && Number.isFinite(drag.axisClientY)
        && Number.isFinite(drag.axisScreenX)
        && Number.isFinite(drag.axisScreenY)
      ) {
        this.updateAxisDrag(drag, clientX, clientY);
        return;
      }

      if (
        drag
        && this.isCornerHandle(drag.handleType)
        && Number.isFinite(drag.cornerClientX)
        && Number.isFinite(drag.cornerClientY)
      ) {
        const startX = drag.cornerClientX ?? clientX;
        const startY = drag.cornerClientY ?? clientY;
        const controlledX =
          startX + (clientX - startX) * CORNER_DRAG_SENSITIVITY;
        const controlledY =
          startY + (clientY - startY) * CORNER_DRAG_SENSITIVITY;
        this.baseUpdateDrag(controlledX, controlledY);
        return;
      }

      this.baseUpdateDrag(clientX, clientY);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.beginDrag = this.baseBeginDrag;
    this.runtime.updateDrag = this.baseUpdateDrag;
  }

  private beginAxisDrag(
    hit: SectionHandleData,
    clientX: number,
    clientY: number,
  ): void {
    const section =
      this.options.sectionDrawing.getSections().find(
        (entry) => entry.id === hit.sectionId,
      );
    if (!section) return;

    const origin = this.toVector3(section.origin);
    const xAxis = this.toVector3(section.xAxis).normalize();
    const yAxis = this.toVector3(section.yAxis).normalize();
    const normal = this.toVector3(section.normal).normalize();
    const anchor =
      origin.clone()
        .addScaledVector(xAxis, section.width / 2)
        .addScaledVector(yAxis, section.height / 2)
        .addScaledVector(
          normal,
          hit.type === "DEPTH" ? section.depth : 0,
        );

    const mapping = this.axisScreenMapping(section, anchor, normal);
    if (!mapping) return;

    this.runtime.dragState = {
      sectionId: section.id,
      handleType: hit.type,
      startSection: section,
      /* Se conservan estos campos porque finish/cancel del controlador base
       * comparten el mismo shape, aunque el cálculo estable no los utiliza. */
      dragPlane: new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        anchor,
      ),
      startWorldPoint: anchor,
      axisClientX: clientX,
      axisClientY: clientY,
      axisScreenX: mapping.direction.x,
      axisScreenY: mapping.direction.y,
      worldPerPixel: mapping.worldPerPixel,
    };

    this.runtime.setStatus(
      hit.type === "DEPTH"
        ? `${section.name}: arrastra amarillo para cambiar profundidad.`
        : `${section.name}: arrastra magenta para mover perpendicular al plano.`,
    );
  }

  private updateAxisDrag(
    drag: AxisDragState,
    clientX: number,
    clientY: number,
  ): void {
    const axisClientX = drag.axisClientX ?? clientX;
    const axisClientY = drag.axisClientY ?? clientY;
    const axisScreenX = drag.axisScreenX ?? 0;
    const axisScreenY = drag.axisScreenY ?? -1;
    const worldPerPixel = drag.worldPerPixel ?? 0;
    const pixelDelta =
      (clientX - axisClientX) * axisScreenX
      + (clientY - axisClientY) * axisScreenY;
    const distance = pixelDelta * worldPerPixel;

    if (drag.handleType === "DEPTH") {
      const depth = Math.max(
        MIN_SECTION_SIZE,
        drag.startSection.depth + distance,
      );
      this.runtime.replaceSection({
        ...drag.startSection,
        depth,
      });
      this.runtime.setStatus(
        `${drag.startSection.name}: profundidad ${this.format(depth)} m.`,
      );
      return;
    }

    const normal =
      this.toVector3(drag.startSection.normal).normalize();
    const origin =
      this.toVector3(drag.startSection.origin)
        .addScaledVector(normal, distance);
    this.runtime.replaceSection({
      ...drag.startSection,
      origin: this.vectorData(origin),
    });
    this.runtime.setStatus(
      `${drag.startSection.name}: desplazamiento perpendicular ${this.formatSigned(distance)} m.`,
    );
  }

  private axisScreenMapping(
    section: SectionViewDefinition,
    anchor: THREE.Vector3,
    axis: THREE.Vector3,
  ): {
    readonly direction: THREE.Vector2;
    readonly worldPerPixel: number;
  } | null {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const camera = this.options.cameraProvider();
    camera.updateMatrixWorld(true);

    const size = Math.max(
      section.width,
      section.height,
      section.depth,
      0.1,
    );
    const probeDistance = Math.max(size * 0.25, 0.05);
    const screenA = this.projectToPixels(anchor, camera, rect);
    const screenB = this.projectToPixels(
      anchor.clone().addScaledVector(axis, probeDistance),
      camera,
      rect,
    );
    const projected = screenB.sub(screenA);
    const projectedPixels = projected.length();
    const cameraWorldPerPixel =
      this.cameraWorldPerPixel(camera, anchor, rect.height, size);

    /* Cerca de mirar exactamente a lo largo de la normal, esa normal apenas se
     * proyecta en pantalla. En ese caso usamos el eje vertical como control
     * deliberado, evitando divisiones que disparaban el movimiento. */
    if (projectedPixels < 12) {
      return {
        direction: new THREE.Vector2(0, -1),
        worldPerPixel: cameraWorldPerPixel,
      };
    }

    const projectedWorldPerPixel =
      probeDistance / projectedPixels;

    /* Limitar la sensibilidad evita que una normal muy foreshortened produzca
     * saltos enormes; 4x la escala visual sigue permitiendo desplazamientos
     * rápidos sin perder control fino. */
    const worldPerPixel = Math.min(
      projectedWorldPerPixel,
      cameraWorldPerPixel * 4,
    );

    return {
      direction: projected.normalize(),
      worldPerPixel: Math.max(worldPerPixel, 1e-8),
    };
  }

  private projectToPixels(
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
  ): THREE.Vector2 {
    const projected = point.clone().project(camera);
    return new THREE.Vector2(
      (projected.x + 1) * 0.5 * rect.width,
      (1 - projected.y) * 0.5 * rect.height,
    );
  }

  private cameraWorldPerPixel(
    camera: THREE.Camera,
    anchor: THREE.Vector3,
    viewportHeight: number,
    fallbackSize: number,
  ): number {
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = Math.max(
        camera.position.distanceTo(anchor),
        1e-6,
      );
      const fov = THREE.MathUtils.degToRad(
        camera.getEffectiveFOV(),
      );
      return Math.max(
        (2 * distance * Math.tan(fov / 2)) / viewportHeight,
        1e-8,
      );
    }

    if (camera instanceof THREE.OrthographicCamera) {
      return Math.max(
        ((camera.top - camera.bottom) / camera.zoom) / viewportHeight,
        1e-8,
      );
    }

    return Math.max(fallbackSize / Math.max(viewportHeight, 1), 1e-8);
  }

  private isCornerHandle(type: RuntimeHandleType): type is CornerHandleType {
    return type === "CORNER_00"
      || type === "CORNER_10"
      || type === "CORNER_11"
      || type === "CORNER_01"
      || type === "BACK_CORNER_00"
      || type === "BACK_CORNER_10"
      || type === "BACK_CORNER_11"
      || type === "BACK_CORNER_01";
  }

  private toVector3(value: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }): THREE.Vector3 {
    return new THREE.Vector3(value.x, value.y, value.z);
  }

  private vectorData(vector: THREE.Vector3): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } {
    return { x: vector.x, y: vector.y, z: vector.z };
  }

  private format(value: number): string {
    return Number(value.toFixed(4)).toString();
  }

  private formatSigned(value: number): string {
    const rounded = Number(value.toFixed(4));
    return `${rounded >= 0 ? "+" : ""}${rounded}`;
  }
}
