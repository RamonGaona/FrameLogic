import * as THREE from "three";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";
import { resolvePieceDisplayQuality, type PieceDisplayQuality } from "./resolvePieceDisplayQuality";
import { mountModelRenderPanel } from "./mountModelRenderPanel";


export type ModelRenderMode =
  | "SOLID"
  | "SOLID_EDGES"
  | "WIREFRAME"
  | "TRANSPARENT";


interface Options {
  readonly container: HTMLElement;
  readonly designScene: DesignSceneController;
  readonly selectedIds?: () => readonly string[];
  readonly preparedInstanceId?: () => string | undefined;
}


interface OriginalMaterialState {
  readonly material: THREE.Material | THREE.Material[];
}


/**
 * Modos de visualización del espacio modelo y del editor aislado de pieza.
 *
 * No modifica el DesignModel ni el estado documental. Los materiales
 * alternativos viven únicamente en los objetos Three.js del visor y se
 * restauran al volver a SOLID o al destruir el controlador.
 *
 * WIREFRAME deliberadamente NO usa Material.wireframe: esa opción expone la
 * triangulación interna del tessellado STEP/IFC. En su lugar dibujamos solo
 * aristas geométricas significativas con EdgesGeometry, más parecido a la
 * visualización alámbrica de un CAD/CAE.
 */
export class ModelRenderModeController {
  private readonly container: HTMLElement;
  private readonly designScene: DesignSceneController;
  private readonly panel: HTMLDivElement;
  private readonly select: HTMLSelectElement;
  private readonly originals = new WeakMap<THREE.Mesh, OriginalMaterialState>();
  private readonly temporaryMaterials = new WeakMap<THREE.Mesh, THREE.Material[]>();
  private readonly edgeHelpers = new WeakMap<THREE.Mesh, THREE.LineSegments>();
  private readonly timer: number;
  private mode: ModelRenderMode = "SOLID";
  private disposed = false;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly options: Options;
  private qualityKey = "";
  private readonly displayedGeometry = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();

  constructor(options: Options) {
    this.options = options;
    this.container = options.container;
    this.designScene = options.designScene;

    const panel = document.createElement("div");
    panel.dataset["framelogicModelRenderMode"] = "true";
    Object.assign(panel.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147481500",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 7px",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "5px",
      background: "rgba(15,22,27,0.92)",
      color: "#dce8ed",
      font: "11px system-ui, sans-serif",
      boxShadow: "0 3px 12px rgba(0,0,0,0.28)",
      whiteSpace: "nowrap",
    });

    const label = document.createElement("span");
    label.textContent = "Render";
    label.style.opacity = "0.75";

    const select = document.createElement("select");
    select.title = "Modo de visualización del modelo o pieza en edición";
    Object.assign(select.style, {
      padding: "3px 5px",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: "4px",
      background: "#11181d",
      color: "#eef4f6",
      font: "inherit",
    });
    for (const [value, text] of [
      ["SOLID", "Sólido"],
      ["SOLID_EDGES", "Sólido + aristas"],
      ["WIREFRAME", "Alámbrico"],
      ["TRANSPARENT", "Transparente"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = this.mode;
    select.addEventListener("change", this.handleChange);

    const quality = document.createElement("select");
    quality.title = "Calidad visual de la pieza en edición o del modelo. SNAPs y ejes mantienen su precisión.";
    quality.setAttribute("aria-label", "Calidad visual de piezas");
    quality.style.cssText = select.style.cssText;
    for (const [value, text] of [
      ["DESIGN", "Dise\u00f1o"], ["SELECTED", "Detalle seleccionado"],
      ["DETAIL", "Detalle"], ["LOW", "B\u00e1sico"],
    ]) {
      const option = document.createElement("option");
      option.value = value!;
      option.textContent = text!;
      quality.append(option);
    }
    quality.value = "DESIGN";
    quality.addEventListener("change", this.handleQualityChange);
    this.qualitySelect = quality;
    panel.append(label, select, quality);
    // Montar fuera del viewport: el editor aislado crea una capa
    // independiente que puede tapar el panel aun con z-index alto.
    mountModelRenderPanel(panel, document.body);
    this.panel = panel;
    this.select = select;

    this.sync();
    this.timer = window.setInterval(() => this.sync(), 300);
  }

  getMode(): ModelRenderMode {
    return this.mode;
  }

  setMode(mode: ModelRenderMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.select.value = mode;
    this.applyToAll(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.select.removeEventListener("change", this.handleChange);
    this.qualitySelect.removeEventListener("change", this.handleQualityChange);
    this.restoreAll();
    this.panel.remove();
  }

  private readonly handleChange = (): void => {
    this.setMode(this.select.value as ModelRenderMode);
  };

  private readonly handleQualityChange = (): void => { this.sync(); };

  private sync(): void {
    if (this.disposed) return;
    const quality = this.qualitySelect.value as PieceDisplayQuality;
    // Una pieza en preparación solo recibe detalle completo en
    // "Detalle seleccionado". Antes se forzaba DETAIL incluso con
    // "Básico" o "Diseño", por lo que el selector parecía no funcionar.
    const resolved = resolvePieceDisplayQuality(
      quality,
      this.options.selectedIds?.() ?? [],
      this.options.preparedInstanceId?.(),
    );
    const key = `${quality}:${[...resolved.detailInstanceIds].sort().join(",")}`;
    if (key !== this.qualityKey) {
      this.qualityKey = key;
      this.designScene.setVisualLevel(
        resolved.level,
        resolved.detailInstanceIds,
      );
    }
    this.updatePanelPosition();
    this.applyToAll(false);
  }

  /**
   * SECCIÓN también ocupa la esquina inferior derecha. En vez de fijar un
   * bottom aproximado, medimos el panel real para que Render siempre quede
   * encima aunque SECCIÓN cambie de alto al envolver sus controles.
   */
  private updatePanelPosition(): void {
    const sectionPanel = document.querySelector<HTMLElement>(
      '[data-framelogic-section-panel="true"]',
    );

    if (
      !sectionPanel
      || sectionPanel === this.panel
      || window.getComputedStyle(sectionPanel).display === "none"
    ) {
      this.panel.style.bottom = "16px";
      return;
    }

    const sectionRect = sectionPanel.getBoundingClientRect();
    // El panel está ahora anclado a la ventana, no al contenedor 3D.
    const bottom = Math.max(16, window.innerHeight - sectionRect.top + 8);

    this.panel.style.bottom = `${Math.round(bottom)}px`;
  }

  private applyToAll(force: boolean): void {
    for (const [, root] of this.designScene.getInstanceEntries()) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometryChanged = this.displayedGeometry.get(object) !== object.geometry;
        if (geometryChanged) {
          this.displayedGeometry.set(object, object.geometry);
          this.removeEdges(object);
        }
        if (!this.originals.has(object)) {
          this.originals.set(object, {
            material: object.material,
          });
          this.applyMode(object);
          return;
        }
        if (force || geometryChanged) this.applyMode(object);
      });
    }
  }

  private applyMode(mesh: THREE.Mesh): void {
    const original = this.originals.get(mesh);
    if (!original) return;

    this.disposeTemporaryMaterials(mesh);
    this.removeEdges(mesh);

    if (this.mode === "SOLID" || this.mode === "SOLID_EDGES") {
      mesh.material = original.material;
      if (this.mode === "SOLID_EDGES") {
        this.ensureEdges(mesh);
      }
      return;
    }

    const source = Array.isArray(original.material)
      ? original.material
      : [original.material];
    const replacements = source.map((material) => {
      const clone = material.clone();

      if ("wireframe" in clone) {
        /* Nunca mostrar la triangulación del tessellado. */
        (clone as THREE.MeshBasicMaterial).wireframe = false;
      }

      if (this.mode === "WIREFRAME") {
        /*
         * Conservamos el Mesh para selección/raycast, pero no pintamos sus
         * caras. Las aristas CAD se renderizan mediante EdgesGeometry.
         */
        clone.transparent = true;
        clone.opacity = 0;
        clone.depthWrite = false;
        clone.colorWrite = false;
      }
      else {
        clone.transparent = true;
        clone.opacity = 0.24;
        clone.depthWrite = false;
        clone.colorWrite = true;
        clone.side = THREE.DoubleSide;
      }
      clone.needsUpdate = true;
      return clone;
    });

    this.temporaryMaterials.set(mesh, replacements);
    mesh.material = Array.isArray(original.material)
      ? replacements
      : replacements[0] ?? original.material;

    if (this.mode === "WIREFRAME") {
      this.ensureEdges(
        mesh,
        this.getRepresentativeColor(original.material),
        0.96,
      );
    }
    else if (this.mode === "TRANSPARENT") {
      this.ensureEdges(mesh, 0x6f8792, 0.72);
    }
  }

  private getRepresentativeColor(
    material: THREE.Material | THREE.Material[],
  ): number {
    const entries = Array.isArray(material)
      ? material
      : [material];

    for (const entry of entries) {
      const candidate = entry as THREE.Material & {
        color?: THREE.Color;
      };
      if (candidate.color instanceof THREE.Color) {
        return candidate.color.getHex();
      }
    }

    return 0xb8cbd4;
  }

  private ensureEdges(
    mesh: THREE.Mesh,
    color = 0x32434b,
    opacity = 0.82,
  ): void {
    const current = this.edgeHelpers.get(mesh);
    if (current) {
      current.visible = true;
      return;
    }

    /*
     * 30° elimina diagonales coplanares y facetas suaves del tessellado,
     * manteniendo contornos, agujeros, chaflanes y cambios reales de cara.
     */
    const geometry = new THREE.EdgesGeometry(mesh.geometry, 30);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = "FrameLogicRenderEdges";
    lines.renderOrder = 4;
    lines.raycast = () => undefined;
    mesh.add(lines);
    this.edgeHelpers.set(mesh, lines);
  }

  private removeEdges(mesh: THREE.Mesh): void {
    const helper = this.edgeHelpers.get(mesh);
    if (!helper) return;
    helper.removeFromParent();
    helper.geometry.dispose();
    const material = helper.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    }
    else {
      material.dispose();
    }
    this.edgeHelpers.delete(mesh);
  }

  private disposeTemporaryMaterials(mesh: THREE.Mesh): void {
    const materials = this.temporaryMaterials.get(mesh);
    if (!materials) return;
    materials.forEach((material) => material.dispose());
    this.temporaryMaterials.delete(mesh);
  }

  private restoreAll(): void {
    for (const [, root] of this.designScene.getInstanceEntries()) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const original = this.originals.get(object);
        if (original) object.material = original.material;
        this.disposeTemporaryMaterials(object);
        this.removeEdges(object);
      });
    }
  }
}
