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

interface AssetRuntime {
  readonly format: string;
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
  createProjectPackage(
    name?: string,
  ): unknown;
  restoreProjectPackage(
    project: unknown,
  ): Promise<void>;
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
        addEventListener(
          type: string,
          listener: () => void,
        ): void;
        removeEventListener(
          type: string,
          listener: () => void,
        ): void;
      };
    };
  };
  readonly cadWorkPlane: object;
  readonly designModel: {
    readonly assets: {
      get(id: string): AssetRuntime | undefined;
    };
    readonly pieceDefinitions: {
      get(id: string): DefinitionRuntime | undefined;
      getAll(): readonly DefinitionRuntime[];
    };
  };
  readonly designScene: {
    getAssetPrototype(
      assetId: string,
    ): THREE.Object3D | undefined;
    sync(): void;
  };
  readonly drawingWorkspace: {
    readonly overlay: HTMLElement;
  };
  readonly sectionDrawing: {
    getSections(): readonly unknown[];
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
  loadIfcFile: (
    file: File,
  ) => Promise<LoadedModelRuntime>;
}

interface CadWorkPlaneRuntime {
  readonly grid?: THREE.GridHelper;
}

interface SectionDrawingRuntime {
  readonly panel?: HTMLDivElement;
  readonly depthInput?: HTMLInputElement;
}

let prototypePatchesInstalled = false;

/**
 * Instala antes de construir el BIM Core los parches de escala de Paper Space.
 * Desde esta versión una unidad geométrica FrameLogic equivale a 1 mm.
 */
export function installMillimeterUnitSystem(): void {
  if (prototypePatchesInstalled) {
    return;
  }
  prototypePatchesInstalled = true;

  patchDrawingProductionScale();
  patchGeneralPdfScale();
  patchAssemblySnapScale();
}

/**
 * Ajustes de runtime que dependen de instancias ya creadas: cámara, grid,
 * fronteras IFC, persistencia/migración y etiquetas de interfaz.
 */
export function configureMillimeterRuntime(
  coreValue: unknown,
  container: HTMLElement,
): () => void {
  const core =
    coreValue as MillimeterCoreRuntime;
  const disposers: Array<() => void> = [];

  configureCamera(core, disposers);
  configureWorkPlaneGrid(core);
  configureSectionUi(core);
  configureIfcBoundaries(core);
  configureProjectPersistence(core);

  const observer =
    new MutationObserver(
      () => {
        normalizeVisibleUnits(container);
        decorateNumericInputs(container);
      },
    );
  observer.observe(
    container,
    {
      childList: true,
      subtree: true,
      characterData: true,
    },
  );
  normalizeVisibleUnits(container);
  decorateNumericInputs(container);

  disposers.push(
    () => observer.disconnect(),
  );

  return () => {
    for (const dispose of disposers.reverse()) {
      dispose();
    }
  };
}

function patchDrawingProductionScale(): void {
  const prototype =
    DrawingProductionController.prototype as unknown as {
      paperTransform(
        section: SectionViewDefinition,
      ): PaperTransformRuntime;
    };
  const base =
    prototype.paperTransform;

  prototype.paperTransform = function (
    this: DrawingProductionController & DrawingProductionScaleRuntime,
    section: SectionViewDefinition,
  ): PaperTransformRuntime {
    const sheet =
      this.getActiveSheet();

    if (
      !sheet
      || sheet.scaleDenominator === null
    ) {
      return base.call(
        this,
        section,
      );
    }

    const [rawWidth, rawHeight] =
      SHEET_MM[sheet.size]
      ?? SHEET_MM["A3"]!;
    const paperWidth =
      sheet.orientation === "LANDSCAPE"
        ? rawWidth
        : rawHeight;
    const paperHeight =
      sheet.orientation === "LANDSCAPE"
        ? rawHeight
        : rawWidth;
    const pxPerMm =
      Math.min(
        (SHEET_WIDTH - 2 * PAPER_MARGIN) / paperWidth,
        (SHEET_HEIGHT - 2 * PAPER_MARGIN) / paperHeight,
      );

    /*
     * Modelo y papel están ahora expresados en mm.
     * Escala 1:N => 1 mm de modelo ocupa 1/N mm en el papel.
     */
    const scale =
      pxPerMm
      / Math.max(
        sheet.scaleDenominator,
        1,
      );
    const width =
      section.width
      * scale;
    const height =
      section.height
      * scale;
    const maxContentWidth =
      sheet.views.length > 1
        ? (SHEET_WIDTH - 2 * PAPER_MARGIN) * 0.60
        : SHEET_WIDTH - 2 * PAPER_MARGIN;

    return {
      scale,
      offsetX:
        PAPER_MARGIN
        + Math.max(
          0,
          (maxContentWidth - width) / 2,
        ),
      offsetY:
        PAPER_MARGIN
        + Math.max(
          0,
          (SHEET_HEIGHT - 2 * PAPER_MARGIN - 100 - height) / 2,
        ),
      height,
    };
  };
}

function patchGeneralPdfScale(): void {
  const prototype =
    GeneralPdfController.prototype as unknown as {
      technicalScale(
        sheet: ScaleSheetRuntime,
        denominator: number,
      ): number;
    };

  prototype.technicalScale = function (
    sheet: ScaleSheetRuntime,
    denominator: number,
  ): number {
    return modelToPaperScale(
      sheet,
      denominator,
    );
  };
}

function patchAssemblySnapScale(): void {
  const prototype =
    SectionInstanceTreeBridgeController.prototype as unknown as {
      technicalScale(
        sheet: ScaleSheetRuntime,
        denominator: number,
      ): number;
    };

  prototype.technicalScale = function (
    sheet: ScaleSheetRuntime,
    denominator: number,
  ): number {
    return modelToPaperScale(
      sheet,
      denominator,
    );
  };
}

function modelToPaperScale(
  sheet: ScaleSheetRuntime,
  denominator: number,
): number {
  const [rawWidth, rawHeight] =
    SHEET_MM[sheet.size]
    ?? SHEET_MM["A3"]!;
  const paperWidth =
    sheet.orientation === "LANDSCAPE"
      ? rawWidth
      : rawHeight;
  const paperHeight =
    sheet.orientation === "LANDSCAPE"
      ? rawHeight
      : rawWidth;
  const pxPerMm =
    Math.min(
      (SHEET_WIDTH - 84) / paperWidth,
      (SHEET_HEIGHT - 84) / paperHeight,
    );

  return pxPerMm
    / Math.max(
      denominator,
      1,
    );
}

function configureCamera(
  core: MillimeterCoreRuntime,
  disposers: Array<() => void>,
): void {
  const camera =
    core.world.camera.three;
  const controls =
    core.world.camera.controls;

  controls.minDistance =
    20;

  if (
    camera instanceof THREE.PerspectiveCamera
    || camera instanceof THREE.OrthographicCamera
  ) {
    camera.near =
      1;
    camera.far =
      10_000_000;
    camera.updateProjectionMatrix();
  }

  /* Equivalente físico a la vista inicial histórica de 6 m. */
  void controls.setLookAt(
    6000,
    6000,
    6000,
    0,
    0,
    0,
    false,
  );

  const updateTruckSpeed =
    (): void => {
      const distance =
        Math.max(
          controls.distance,
          controls.minDistance,
          20,
        );
      controls.truckSpeed =
        THREE.MathUtils.clamp(
          500 / distance,
          2,
          20,
        );
    };

  controls.addEventListener(
    "update",
    updateTruckSpeed,
  );
  updateTruckSpeed();
  disposers.push(
    () =>
      controls.removeEventListener(
        "update",
        updateTruckSpeed,
      ),
  );
}

function configureWorkPlaneGrid(
  core: MillimeterCoreRuntime,
): void {
  const runtime =
    core.cadWorkPlane as CadWorkPlaneRuntime;
  const grid =
    runtime.grid;

  if (
    !grid
    || grid.userData["framelogicMillimeterGrid"]
  ) {
    return;
  }

  /* GridHelper histórico: 20 unidades / 20 divisiones. */
  grid.scale.multiplyScalar(
    MM_PER_METER,
  );
  grid.userData[
    "framelogicMillimeterGrid"
  ] = true;
  grid.updateMatrixWorld(
    true,
  );
}

function configureSectionUi(
  core: MillimeterCoreRuntime,
): void {
  const runtime =
    core.sectionDrawing as SectionDrawingRuntime;
  const input =
    runtime.depthInput;

  if (input) {
    input.min =
      "1";
    input.step =
      "100";

    if (
      core.sectionDrawing
        .getSections()
        .length < 1
      && Number(input.value) === 1
    ) {
      input.value =
        "1000";
    }
  }

  const panel =
    runtime.panel;
  if (panel) {
    for (
      const span
      of Array.from(
        panel.querySelectorAll("span"),
      )
    ) {
      if (
        span.textContent?.trim()
        === "Prof. m"
      ) {
        span.textContent =
          "Prof. mm";
      }
    }
  }
}

function configureIfcBoundaries(
  core: MillimeterCoreRuntime,
): void {
  const baseImportIfc =
    core.importDesignPieceIfc.bind(
      core,
    );
  core.importDesignPieceIfc =
    async (
      file,
      input,
    ) => {
      const result =
        await baseImportIfc(
          file,
          input,
        );
      scaleIfcPrototype(
        core,
        result.definition.id,
      );
      return result;
    };

  const baseLoadIfc =
    core.loadIfcFile.bind(
      core,
    );
  core.loadIfcFile =
    async (
      file,
    ) => {
      const before =
        new Set(
          core.world.scene.three.children,
        );
      const model =
        await baseLoadIfc(
          file,
        );
      scaleNewReferenceRoots(
        core.world.scene.three,
        before,
      );
      return model;
    };

  /*
   * ProjectPackage conserva callbacks capturados antes de que el Core final
   * exista. Se parchean también esas fronteras para que restaurar un proyecto
   * use exactamente la misma normalización IFC -> mm.
   */
  const options =
    core.projectPackage.options;

  if (options?.importIfcPiece) {
    const baseProjectIfc =
      options.importIfcPiece;
    options.importIfcPiece =
      async (
        file,
        input,
      ) => {
        const result =
          await baseProjectIfc(
            file,
            input,
          );
        scaleIfcPrototype(
          core,
          result.definition.id,
        );
        return result;
      };
  }

  if (options?.loadReferenceIfc) {
    const baseProjectReference =
      options.loadReferenceIfc;
    options.loadReferenceIfc =
      async (
        file,
      ) => {
        const before =
          new Set(
            core.world.scene.three.children,
          );
        const model =
          await baseProjectReference(
            file,
          );
        scaleNewReferenceRoots(
          core.world.scene.three,
          before,
        );
        return model;
      };
  }
}

function scaleIfcPrototype(
  core: MillimeterCoreRuntime,
  definitionId: string,
): void {
  const definition =
    core.designModel
      .pieceDefinitions
      .get(
        definitionId,
      );
  if (!definition) {
    return;
  }

  const asset =
    core.designModel.assets.get(
      definition.geometryAssetId,
    );
  if (
    !asset
    || asset.format !== "IFC"
  ) {
    return;
  }

  const prototype =
    core.designScene
      .getAssetPrototype(
        definition.geometryAssetId,
      );
  if (
    !prototype
    || prototype.userData[
      "framelogicMillimeterGeometry"
    ]
  ) {
    return;
  }

  const geometries =
    new Set<THREE.BufferGeometry>();

  prototype.traverse(
    (
      object,
    ) => {
      object.position.multiplyScalar(
        MM_PER_METER,
      );

      if (
        object instanceof THREE.Mesh
        && !geometries.has(
          object.geometry,
        )
      ) {
        geometries.add(
          object.geometry,
        );
        object.geometry.scale(
          MM_PER_METER,
          MM_PER_METER,
          MM_PER_METER,
        );
        object.geometry.computeBoundingBox();
        object.geometry.computeBoundingSphere();
      }
    },
  );

  prototype.userData[
    "framelogicMillimeterGeometry"
  ] = true;
  prototype.updateMatrixWorld(
    true,
  );
  core.designScene.sync();
}

function scaleNewReferenceRoots(
  scene: THREE.Scene,
  before: ReadonlySet<THREE.Object3D>,
): void {
  for (
    const object
    of scene.children
  ) {
    if (
      before.has(object)
      || object.userData[
        "framelogicMillimeterReference"
      ]
    ) {
      continue;
    }

    object.scale.multiplyScalar(
      MM_PER_METER,
    );
    object.userData[
      "framelogicMillimeterReference"
    ] = true;
    object.updateMatrixWorld(
      true,
    );
  }
}

function configureProjectPersistence(
  core: MillimeterCoreRuntime,
): void {
  const projectPackage =
    core.projectPackage;
  const baseCreate =
    projectPackage
      .createProjectPackage
      .bind(
        projectPackage,
      );
  const baseRestore =
    projectPackage
      .restoreProjectPackage
      .bind(
        projectPackage,
      );

  projectPackage.createProjectPackage =
    (
      name,
    ): unknown => {
      const created =
        baseCreate(
          name,
        );

      if (!isRecord(created)) {
        return created;
      }

      return {
        ...created,
        lengthUnit:
          "mm",
      };
    };

  projectPackage.restoreProjectPackage =
    async (
      project,
    ): Promise<void> => {
      await baseRestore(
        migrateLegacyProjectPackage(
          project,
        ),
      );
    };
}

function migrateLegacyProjectPackage(
  source: unknown,
): unknown {
  if (!isRecord(source)) {
    return source;
  }

  const clone =
    JSON.parse(
      JSON.stringify(source),
    ) as Record<string, unknown>;

  if (
    clone["schema"]
      !== "FRAMELOGIC_PROJECT"
    || clone["lengthUnit"]
      === "mm"
  ) {
    return clone;
  }

  forEachRecord(
    clone["pieceDefinitions"],
    (
      definition,
    ) => {
      const coordinateSystem =
        asRecord(
          definition["coordinateSystem"],
        );
      scalePoint(
        coordinateSystem?.["origin"],
      );

      forEachRecord(
        definition["snapPoints"],
        (
          snap,
        ) =>
          scalePoint(
            snap["position"],
          ),
      );

      const referenceGeometry =
        asRecord(
          definition[
            "referenceGeometry"
          ],
        );
      forEachRecord(
        referenceGeometry?.[
          "axisLines"
        ],
        (
          axis,
        ) => {
          scalePoint(
            axis["origin"],
          );
          scaleNumber(
            axis,
            "length",
          );
        },
      );
    },
  );

  forEachRecord(
    clone["pieceInstances"],
    (
      instance,
    ) => {
      const transform =
        asRecord(
          instance["transform"],
        );
      scalePoint(
        transform?.["position"],
      );
    },
  );

  forEachRecord(
    clone["cadPoints"],
    (
      point,
    ) =>
      scalePoint(
        point["position"],
      ),
  );

  forEachRecord(
    clone["cadLines"],
    (
      line,
    ) => {
      scalePoint(
        line["start"],
      );
      scalePoint(
        line["end"],
      );
    },
  );

  migrateEngineering(
    clone["engineering"],
  );
  migrateDocumentation(
    clone["documentation"],
  );
  migrateProfessionalDrawing(
    clone["professionalDrawing"],
  );

  clone["lengthUnit"] =
    "mm";
  return clone;
}

function migrateEngineering(
  value: unknown,
): void {
  const engineering =
    asRecord(value);
  if (!engineering) {
    return;
  }

  forEachRecord(
    engineering["pieces"],
    (
      piece,
    ) => {
      const axis =
        asRecord(
          piece["structuralAxis"],
        );
      if (axis) {
        scalePoint(
          axis["start"],
        );
        scalePoint(
          axis["end"],
        );
      }

      forEachRecord(
        piece["features"],
        migrateEngineeringFeature,
      );
    },
  );

  forEachRecord(
    engineering["assemblies"],
    (
      assembly,
    ) => {
      forEachRecord(
        assembly["components"],
        (
          component,
        ) => {
          const transform =
            asRecord(
              component["transform"],
            );
          scalePoint(
            transform?.["position"],
          );
        },
      );
      forEachRecord(
        assembly["constraints"],
        (
          constraint,
        ) =>
          scaleNumber(
            constraint,
            "offset",
          ),
      );
    },
  );
}

function migrateEngineeringFeature(
  feature: Record<string, unknown>,
): void {
  const kind =
    feature["kind"];

  if (kind === "HOLE") {
    scalePoint(
      feature["center"],
    );
    scaleNumber(
      feature,
      "diameter",
    );
    scaleNumber(
      feature,
      "depth",
    );
  }
  else if (kind === "AXIS") {
    scalePoint(
      feature["origin"],
    );
    scaleNumber(
      feature,
      "length",
    );
  }
  else if (kind === "PLANE") {
    scalePoint(
      feature["origin"],
    );
  }
  else if (kind === "POINT") {
    scalePoint(
      feature["position"],
    );
  }
  else if (kind === "CIRCLE") {
    scalePoint(
      feature["center"],
    );
    scaleNumber(
      feature,
      "radius",
    );
  }
  else if (kind === "CYLINDER") {
    scalePoint(
      feature["axisOrigin"],
    );
    scaleNumber(
      feature,
      "radius",
    );
    scaleNumber(
      feature,
      "length",
    );
  }
}

function migrateDocumentation(
  value: unknown,
): void {
  const documentation =
    asRecord(value);
  if (!documentation) {
    return;
  }

  forEachRecord(
    documentation["sections"],
    (
      section,
    ) => {
      scalePoint(
        section["origin"],
      );
      scaleNumber(
        section,
        "width",
      );
      scaleNumber(
        section,
        "height",
      );
      scaleNumber(
        section,
        "depth",
      );
    },
  );

  forEachRecord(
    documentation["documents"],
    (
      documentState,
    ) => {
      forEachRecord(
        documentState[
          "annotations"
        ],
        (
          annotation,
        ) => {
          for (
            const key
            of [
              "a",
              "b",
              "c",
              "target",
            ]
          ) {
            migrateDrawingReference(
              annotation[key],
            );
          }
        },
      );
    },
  );

  forEachRecord(
    documentation["sheets"],
    (
      sheet,
    ) => {
      forEachRecord(
        sheet["views"],
        (
          view,
        ) => {
          if (
            view["kind"]
            !== "ASSEMBLY"
          ) {
            return;
          }
          scaleNumber(
            view,
            "width",
          );
          scaleNumber(
            view,
            "height",
          );
          const workPlane =
            asRecord(
              view["workPlane"],
            );
          scalePoint(
            workPlane?.["origin"],
          );
          forEachRecord(
            view["segments"],
            (
              segment,
            ) => {
              scaleNumber(
                segment,
                "x1",
              );
              scaleNumber(
                segment,
                "y1",
              );
              scaleNumber(
                segment,
                "x2",
              );
              scaleNumber(
                segment,
                "y2",
              );
            },
          );
        },
      );
    },
  );
}

function migrateDrawingReference(
  value: unknown,
): void {
  const reference =
    asRecord(value);
  if (!reference) {
    return;
  }

  for (
    const key
    of [
      "x",
      "y",
      "radius",
      "centerX",
      "centerY",
    ]
  ) {
    scaleNumber(
      reference,
      key,
    );
  }
}

function migrateProfessionalDrawing(
  value: unknown,
): void {
  const snapshot =
    asRecord(value);
  const state =
    asRecord(
      snapshot?.["state"],
    );
  if (!state) {
    return;
  }

  forEachRecord(
    state["dimensionStyles"],
    (
      style,
    ) => {
      scaleNumber(
        style,
        "toleranceUpper",
      );
      scaleNumber(
        style,
        "toleranceLower",
      );
    },
  );

  forEachRecord(
    state["viewLayouts"],
    (
      layout,
    ) => {
      scaleNumber(
        layout,
        "cropCenterX",
      );
      scaleNumber(
        layout,
        "cropCenterY",
      );
      scaleNumber(
        layout,
        "cropRadius",
      );
    },
  );
}

function scalePoint(
  value: unknown,
): void {
  const point =
    asRecord(value);
  if (!point) {
    return;
  }

  scaleNumber(
    point,
    "x",
  );
  scaleNumber(
    point,
    "y",
  );
  scaleNumber(
    point,
    "z",
  );
}

function scaleNumber(
  record: Record<string, unknown>,
  key: string,
): void {
  const value =
    record[key];
  if (
    typeof value === "number"
    && Number.isFinite(value)
  ) {
    record[key] =
      value
      * MM_PER_METER;
  }
}

function forEachRecord(
  value: unknown,
  callback: (
    record: Record<string, unknown>,
  ) => void,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const entry of value) {
    const record =
      asRecord(entry);
    if (record) {
      callback(record);
    }
  }
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return isRecord(value)
    ? value
    : null;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function normalizeVisibleUnits(
  container: HTMLElement,
): void {
  const walker =
    document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
    );
  const nodes:
    Text[] = [];

  while (walker.nextNode()) {
    if (walker.currentNode instanceof Text) {
      nodes.push(
        walker.currentNode,
      );
    }
  }

  for (const node of nodes) {
    const source =
      node.nodeValue
      ?? "";
    let next =
      source;

    if (
      source.trim()
      === "Prof. m"
    ) {
      next =
        source.replace(
          "Prof. m",
          "Prof. mm",
        );
    }

    next =
      next.replace(
        /(-?\d+(?:[.,]\d+)?)\s+m(?!m)\b/g,
        "$1 mm",
      );

    if (next !== source) {
      node.nodeValue =
        next;
    }
  }
}

function decorateNumericInputs(
  container: HTMLElement,
): void {
  const inputs =
    Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[data-cad-numeric="true"]',
      ),
    );

  for (const input of inputs) {
    const label =
      input.closest("label");
    const fields =
      label?.parentElement;
    const root =
      fields?.parentElement;
    const title =
      root?.firstElementChild
        ?.textContent
      ?? "";

    if (
      !(label instanceof HTMLElement)
      || title.startsWith(
        "ROTATE",
      )
      || label.querySelector(
        '[data-framelogic-unit="mm"]',
      )
    ) {
      continue;
    }

    const unit =
      document.createElement(
        "span",
      );
    unit.dataset[
      "framelogicUnit"
    ] =
      "mm";
    unit.textContent =
      "mm";
    unit.style.opacity =
      "0.72";
    label.append(
      unit,
    );
  }
}
