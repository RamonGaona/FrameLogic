import * as THREE from "three";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

type AxisHandleType = "DEPTH" | "NORMAL_MOVE";
type RuntimeHandleType =
  | "CORNER_00"
  | "CORNER_10"
  | "CORNER_11"
  | "CORNER_01"
  | "BACK_CORNER_00"
  | "BACK_CORNER_10"
  | "BACK_CORNER_11"
  | "BACK_CORNER_01"
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
  readonly axisClientX: number;
  readonly axisClientY: number;
  readonly axisScreenX: number;
  readonly axisScreenY: number;
  readonly worldPerPixel: number;
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

/**
 * Hace estable el arrastre de los dos controles que trabajan sobre la normal
 * del volumen de sección:
 *
 * - Amarillo (DEPTH): cambia la profundidad.
 * - Magenta (NORMAL_MOVE): desplaza todo el volumen perpendicular al plano.
 *
 * La versión anterior usaba intersección rayo/plano. Cuando ese plano quedaba
 * casi paralelo al rayo de cámara, unos pocos píxeles podían convertirse en
 * varios metros; en el caso contrario el amarillo podía parecer inmóvil.
 * Aquí se proyecta la normal en pantalla y se convierte directamente el delta
 * del mouse a distancia real, con una escala limitada por el zoom de cámara.
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
      ) {
        this.updateAxisDrag(drag, clientX, clientY);
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
    const pixelDelta =
      (clientX - drag.axisClientX) * drag.axisScreenX
      + (clientY - drag.axisClientY) * drag.axisScreenY;
    const distance = pixelDelta * drag.worldPerPixel;

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
