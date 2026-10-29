import * as THREE from "three";

import {
  DrawingProductionController,
} from "../drawing/DrawingProductionController";

import type {
  SectionViewDefinition,
} from "../drawing/SectionDrawingController";

import {
  GeneralPdfController,
} from "../drawing/GeneralPdfController";

import {
  SectionInstanceTreeBridgeController,
} from "../drawing/SectionInstanceTreeBridgeController";

import {
  migrateLegacyProjectPackage,
} from "./MillimeterProjectMigration";


const MM_PER_METER = 1000;
const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const PAPER_MARGIN = 42;

const SHEET_MM: Record<string, readonly [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};

interface PaperTransformRuntime {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly height: number;
}

interface ScaleSheetRuntime {
  readonly size: string;
  readonly orientation: string;
  readonly views: readonly unknown[];
  readonly scaleDenominator: number | null;
}

interface DrawingProductionScaleRuntime {
  getActiveSheet(): ScaleSheetRuntime | null;
}

interface DefinitionRuntime {
  readonly id: string;
  readonly geometryAssetId: string;
}

interface ImportedPieceRuntime {
  readonly definition: DefinitionRuntime;
}

interface LoadedModelRuntime {
  readonly id: string;
}

interface ProjectPackageOptionsRuntime {
  importIfcPiece?: (
    file: File,
    input: {
      code: string;
      name?: string;
      classification?: string;
      tags?: string[];
    },
  ) => Promise<ImportedPieceRuntime>;
  loadReferenceIfc?: (
    file: File,
  ) => Promise<LoadedModelRuntime>;
}

interface ProjectPackageRuntime {
  options?: ProjectPackageOptionsRuntime;
  createProjectPackage(name?: string): unknown;
  restoreProjectPackage(project: unknown): Promise<void>;
}

interface MillimeterCoreRuntime {
  readonly world: {
    readonly scene: {
      readonly three: THREE.Scene;
    };
    readonly camera: {
      readonly three: THREE.Camera;
      readonly controls: {
        distance: number;
        minDistance: number;
        truckSpeed: number;
        setLookAt(
          positionX: number,
          positionY: number,
          positionZ: number,
          targetX: number,
          targetY: number,
          targetZ: number,
          enableTransition?: boolean,
        ): Promise<void> | void;
        addEventListener(type: string, listener: () => void): void;
        removeEventListener(type: string, listener: () => void): void;
      };
    };
  };
  readonly cadWorkPlane: object;
  readonly sectionDrawing: {
    getSections(): readonly unknown[];
  };
  readonly designModel: {
    readonly assets: {
      get(id: string): { readonly format: string } | undefined;
    };
    readonly pieceDefinitions: {
      get(id: string): DefinitionRuntime | undefined;
    };
  };
  readonly designScene: {
    getAssetPrototype(assetId: string): THREE.Object3D | undefined;
    sync(): void;
  };
  readonly projectPackage: ProjectPackageRuntime;
  importDesignPieceIfc: (
    file: File,
    input: {
      code: string;
      name?: string;
      classification?: string;
      tags?: string[];
    },
  ) => Promise<ImportedPieceRuntime>;
  loadIfcFile: (file: File) => Promise<LoadedModelRuntime>;
}

interface CadWorkPlaneRuntime {
  readonly grid?: THREE.GridHelper;
}

interface SectionDrawingRuntime {
  readonly panel?: HTMLDivElement;
  readonly depthInput?: HTMLInputElement;
}

let prototypePatchesInstalled = false;

/** 1 unidad geométrica de FrameLogic = 1 milímetro. */
export function installMillimeterUnitSystem(): void {
  if (prototypePatchesInstalled) return;
  prototypePatchesInstalled = true;
  patchDrawingProductionScale();
  patchGeneralPdfScale();
  patchAssemblySnapScale();
}

export function configureMillimeterRuntime(
  coreValue: unknown,
  container: HTMLElement,
): () => void {
  const core = coreValue as MillimeterCoreRuntime;
  const disposers: Array<() => void> = [];

  configureCamera(core, disposers);
  configureWorkPlaneGrid(core);
  configureSectionUi(core);
  configureIfcBoundaries(core);
  configureProjectPersistence(core);

  const observer = new MutationObserver(() => {
    normalizeVisibleUnits(container);
    decorateNumericInputs(container);
  });
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  normalizeVisibleUnits(container);
  decorateNumericInputs(container);
  disposers.push(() => observer.disconnect());

  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}

function patchDrawingProductionScale(): void {
  const prototype = DrawingProductionController.prototype as unknown as {
    paperTransform(section: SectionViewDefinition): PaperTransformRuntime;
  };
  const base = prototype.paperTransform;

  prototype.paperTransform = function (
    this: DrawingProductionScaleRuntime,
    section: SectionViewDefinition,
  ): PaperTransformRuntime {
    const sheet = this.getActiveSheet();
    if (!sheet || sheet.scaleDenominator === null) {
      return base.call(this, section);
    }

    const [rawWidth, rawHeight] = SHEET_MM[sheet.size] ?? SHEET_MM["A3"]!;
    const paperWidth = sheet.orientation === "LANDSCAPE" ? rawWidth : rawHeight;
    const paperHeight = sheet.orientation === "LANDSCAPE" ? rawHeight : rawWidth;
    const pxPerMm = Math.min(
      (SHEET_WIDTH - 2 * PAPER_MARGIN) / paperWidth,
      (SHEET_HEIGHT - 2 * PAPER_MARGIN) / paperHeight,
    );
    const scale = pxPerMm / Math.max(sheet.scaleDenominator, 1);
    const width = section.width * scale;
    const height = section.height * scale;
    const maxContentWidth = sheet.views.length > 1
      ? (SHEET_WIDTH - 2 * PAPER_MARGIN) * 0.60
      : SHEET_WIDTH - 2 * PAPER_MARGIN;

    return {
      scale,
      offsetX: PAPER_MARGIN + Math.max(0, (maxContentWidth - width) / 2),
      offsetY: PAPER_MARGIN + Math.max(
        0,
        (SHEET_HEIGHT - 2 * PAPER_MARGIN - 100 - height) / 2,
      ),
      height,
    };
  };
}

function patchGeneralPdfScale(): void {
  const prototype = GeneralPdfController.prototype as unknown as {
    technicalScale(sheet: ScaleSheetRuntime, denominator: number): number;
  };
  prototype.technicalScale = function (
    sheet: ScaleSheetRuntime,
    denominator: number,
  ): number {
    return modelToPaperScale(sheet, denominator);
  };
}

function patchAssemblySnapScale(): void {
  const prototype = SectionInstanceTreeBridgeController.prototype as unknown as {
    technicalScale(sheet: ScaleSheetRuntime, denominator: number): number;
  };
  prototype.technicalScale = function (
    sheet: ScaleSheetRuntime,
    denominator: number,
  ): number {
    return modelToPaperScale(sheet, denominator);
  };
}

function modelToPaperScale(
  sheet: ScaleSheetRuntime,
  denominator: number,
): number {
  const [rawWidth, rawHeight] = SHEET_MM[sheet.size] ?? SHEET_MM["A3"]!;
  const paperWidth = sheet.orientation === "LANDSCAPE" ? rawWidth : rawHeight;
  const paperHeight = sheet.orientation === "LANDSCAPE" ? rawHeight : rawWidth;
  const pxPerMm = Math.min(
    (SHEET_WIDTH - 84) / paperWidth,
    (SHEET_HEIGHT - 84) / paperHeight,
  );
  return pxPerMm / Math.max(denominator, 1);
}

function configureCamera(
  core: MillimeterCoreRuntime,
  disposers: Array<() => void>,
): void {
  const camera = core.world.camera.three;
  const controls = core.world.camera.controls;
  controls.minDistance = 20;

  if (
    camera instanceof THREE.PerspectiveCamera
    || camera instanceof THREE.OrthographicCamera
  ) {
    camera.near = 1;
    camera.far = 10_000_000;
    camera.updateProjectionMatrix();
  }

  void controls.setLookAt(6000, 6000, 6000, 0, 0, 0, false);

  const updateTruckSpeed = (): void => {
    const distance = Math.max(controls.distance, controls.minDistance, 20);
    controls.truckSpeed = THREE.MathUtils.clamp(500 / distance, 2, 20);
  };
  controls.addEventListener("update", updateTruckSpeed);
  updateTruckSpeed();
  disposers.push(() => controls.removeEventListener("update", updateTruckSpeed));
}

function configureWorkPlaneGrid(core: MillimeterCoreRuntime): void {
  const grid = (core.cadWorkPlane as CadWorkPlaneRuntime).grid;
  if (!grid || grid.userData["framelogicMillimeterGrid"]) return;

  /* 20 unidades históricas -> 20 000 mm; división principal = 1000 mm. */
  grid.scale.multiplyScalar(MM_PER_METER);
  grid.userData["framelogicMillimeterGrid"] = true;
  grid.updateMatrixWorld(true);
}

function configureSectionUi(core: MillimeterCoreRuntime): void {
  const runtime = core.sectionDrawing as SectionDrawingRuntime;
  const input = runtime.depthInput;
  if (input) {
    input.min = "1";
    input.step = "100";
    if (core.sectionDrawing.getSections().length < 1 && Number(input.value) === 1) {
      input.value = "1000";
    }
  }

  for (const span of Array.from(runtime.panel?.querySelectorAll("span") ?? [])) {
    if (span.textContent?.trim() === "Prof. m") span.textContent = "Prof. mm";
  }
}

function configureIfcBoundaries(core: MillimeterCoreRuntime): void {
  const baseImportIfc = core.importDesignPieceIfc.bind(core);
  core.importDesignPieceIfc = async (file, input) => {
    const result = await baseImportIfc(file, input);
    scaleIfcPrototype(core, result.definition.id);
    return result;
  };

  const baseLoadIfc = core.loadIfcFile.bind(core);
  core.loadIfcFile = async (file) => {
    const before = new Set(core.world.scene.three.children);
    const model = await baseLoadIfc(file);
    scaleNewReferenceRoots(core.world.scene.three, before);
    return model;
  };

  const options = core.projectPackage.options;
  if (options?.importIfcPiece) {
    const baseProjectIfc = options.importIfcPiece;
    options.importIfcPiece = async (file, input) => {
      const result = await baseProjectIfc(file, input);
      scaleIfcPrototype(core, result.definition.id);
      return result;
    };
  }

  if (options?.loadReferenceIfc) {
    const baseProjectReference = options.loadReferenceIfc;
    options.loadReferenceIfc = async (file) => {
      const before = new Set(core.world.scene.three.children);
      const model = await baseProjectReference(file);
      scaleNewReferenceRoots(core.world.scene.three, before);
      return model;
    };
  }
}

/** IFC propio: se hornea el factor 1000 en coordenadas locales, no en la instancia. */
function scaleIfcPrototype(
  core: MillimeterCoreRuntime,
  definitionId: string,
): void {
  const definition = core.designModel.pieceDefinitions.get(definitionId);
  if (!definition) return;
  const asset = core.designModel.assets.get(definition.geometryAssetId);
  if (!asset || asset.format !== "IFC") return;

  const prototype = core.designScene.getAssetPrototype(definition.geometryAssetId);
  if (!prototype || prototype.userData["framelogicMillimeterGeometry"]) return;

  const geometries = new Set<THREE.BufferGeometry>();
  prototype.traverse((object) => {
    object.position.multiplyScalar(MM_PER_METER);
    if (object instanceof THREE.Mesh && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.scale(MM_PER_METER, MM_PER_METER, MM_PER_METER);
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
    }
  });
  prototype.userData["framelogicMillimeterGeometry"] = true;
  prototype.updateMatrixWorld(true);
  core.designScene.sync();
}

/** IFC de referencia conserva su jerarquía; la raíz transforma metros -> mm. */
function scaleNewReferenceRoots(
  scene: THREE.Scene,
  before: ReadonlySet<THREE.Object3D>,
): void {
  for (const object of scene.children) {
    if (before.has(object) || object.userData["framelogicMillimeterReference"]) continue;
    object.scale.multiplyScalar(MM_PER_METER);
    object.userData["framelogicMillimeterReference"] = true;
    object.updateMatrixWorld(true);
  }
}

function configureProjectPersistence(core: MillimeterCoreRuntime): void {
  const projectPackage = core.projectPackage;
  const baseCreate = projectPackage.createProjectPackage.bind(projectPackage);
  const baseRestore = projectPackage.restoreProjectPackage.bind(projectPackage);

  projectPackage.createProjectPackage = (name): unknown => {
    const created = baseCreate(name);
    if (!isRecord(created)) return created;
    return {
      ...created,
      lengthUnit: "mm",
    };
  };

  projectPackage.restoreProjectPackage = async (project): Promise<void> => {
    await baseRestore(migrateLegacyProjectPackage(project));
  };
}

function normalizeVisibleUnits(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode instanceof Text) nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    const source = node.nodeValue ?? "";
    let next = source.trim() === "Prof. m"
      ? source.replace("Prof. m", "Prof. mm")
      : source;
    next = next.replace(/(-?\d+(?:[.,]\d+)?)\s+m(?!m)\b/g, "$1 mm");
    if (next !== source) node.nodeValue = next;
  }
}

function decorateNumericInputs(container: HTMLElement): void {
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[data-cad-numeric="true"]'),
  );

  for (const input of inputs) {
    const label = input.closest("label");
    const fields = label?.parentElement;
    const root = fields?.parentElement;
    const title = root?.firstElementChild?.textContent ?? "";
    if (
      !(label instanceof HTMLElement)
      || title.startsWith("ROTATE")
      || label.querySelector('[data-framelogic-unit="mm"]')
    ) {
      continue;
    }

    const unit = document.createElement("span");
    unit.dataset["framelogicUnit"] = "mm";
    unit.textContent = "mm";
    unit.style.opacity = "0.72";
    label.append(unit);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
