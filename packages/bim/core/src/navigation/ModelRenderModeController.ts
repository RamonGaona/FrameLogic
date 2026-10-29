import * as THREE from "three";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


export type ModelRenderMode =
  | "SOLID"
  | "SOLID_EDGES"
  | "WIREFRAME"
  | "TRANSPARENT";


interface Options {
  readonly container: HTMLElement;
  readonly designScene: DesignSceneController;
}


interface OriginalMaterialState {
  readonly material: THREE.Material | THREE.Material[];
}


/**
 * Modos de visualización exclusivos del Model Space.
 *
 * No modifica el DesignModel ni el estado documental. Los materiales
 * alternativos viven únicamente en los objetos Three.js del visor y se
 * restauran al volver a SOLID o al destruir el controlador.
 */
export class ModelRenderModeController {
  private readonly designScene: DesignSceneController;
  private readonly panel: HTMLDivElement;
  private readonly select: HTMLSelectElement;
  private readonly originals = new WeakMap<THREE.Mesh, OriginalMaterialState>();
  private readonly temporaryMaterials = new WeakMap<THREE.Mesh, THREE.Material[]>();
  private readonly edgeHelpers = new WeakMap<THREE.Mesh, THREE.LineSegments>();
  private readonly timer: number;
  private mode: ModelRenderMode = "SOLID";
  private disposed = false;

  constructor(options: Options) {
    this.designScene = options.designScene;

    const panel = document.createElement("div");
    panel.dataset["framelogicModelRenderMode"] = "true";
    Object.assign(panel.style, {
      position: "absolute",
      right: "14px",
      bottom: "42px",
      zIndex: "130",
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
    });

    const label = document.createElement("span");
    label.textContent = "Render";
    label.style.opacity = "0.75";

    const select = document.createElement("select");
    select.title = "Modo de visualización del Model Space";
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

    panel.append(label, select);
    options.container.append(panel);
    this.panel = panel;
    this.select = select;

    this.sync();
    this.timer = window.setInterval(() => this.sync(), 400);
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
    this.restoreAll();
    this.panel.remove();
  }

  private readonly handleChange = (): void => {
    this.setMode(this.select.value as ModelRenderMode);
  };

  private sync(): void {
    if (this.disposed) return;
    this.applyToAll(false);
  }

  private applyToAll(force: boolean): void {
    for (const [, root] of this.designScene.getInstanceEntries()) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!this.originals.has(object)) {
          this.originals.set(object, {
            material: object.material,
          });
          this.applyMode(object);
          return;
        }
        if (force) this.applyMode(object);
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
        (clone as THREE.MeshBasicMaterial).wireframe =
          this.mode === "WIREFRAME";
      }
      if (this.mode === "WIREFRAME") {
        clone.transparent = false;
        clone.opacity = 1;
        clone.depthWrite = true;
      }
      else {
        clone.transparent = true;
        clone.opacity = 0.24;
        clone.depthWrite = false;
        clone.side = THREE.DoubleSide;
      }
      clone.needsUpdate = true;
      return clone;
    });

    this.temporaryMaterials.set(mesh, replacements);
    mesh.material = Array.isArray(original.material)
      ? replacements
      : replacements[0] ?? original.material;

    if (this.mode === "TRANSPARENT") {
      this.ensureEdges(mesh, 0x6f8792, 0.72);
    }
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

    const geometry = new THREE.EdgesGeometry(mesh.geometry, 28);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest: true,
      depthWrite: false,
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
