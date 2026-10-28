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

/**
 * Interacción directa de vistas de sección en Model Space.
 *
 * - Elimina los sprites A-A del recuadro de sección. La identidad de la vista
 *   queda en el árbol INSTANCIAS, donde ya existe el nombre completo.
 * - Permite seleccionar una sección haciendo clic sobre su volumen 3D.
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
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.sectionRuntime =
      options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.professionalRuntime =
      options.drawingProfessional as unknown as DrawingProfessionalRuntime;

    /*
     * DrawingProfessionalController recreaba dos sprites A-A por sección cada
     * vez que sincronizaba el estado profesional. Esos sprites son objetos
     * independientes dentro del grupo y podían reaparecer después de ocultar
     * la sección. Se desactiva la creación y se retiran los ya existentes.
     */
    this.originalEnsureSectionMarker =
      this.professionalRuntime.ensureSectionMarker.bind(
        this.professionalRuntime,
      );
    this.professionalRuntime.ensureSectionMarker = (
      section: SectionViewDefinition,
    ): void => {
      this.removeSectionMarkers(section.id);
    };

    for (const section of options.sectionDrawing.getSections()) {
      this.removeSectionMarkers(section.id);
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
    this.highlightTreeRow(section.id);
  };

  private pickSection(
    clientX: number,
    clientY: number,
  ): SectionViewDefinition | null {
    const rect =
      this.options.canvas.getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }

    this.pointer.x =
      ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y =
      -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      this.pointer,
      this.options.cameraProvider(),
    );

    let nearest:
      {
        section: SectionViewDefinition;
        distanceSq: number;
      }
      | null =
        null;

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
}
