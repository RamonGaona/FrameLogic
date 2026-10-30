import * as THREE from "three";

import "./drawing/PdfPaperNavigationAutoBootstrap";

import {
  createBimCore as createNavigationBimCore,
} from "./engine/createFrameLogicBimCoreNavigation";

import type {
  PrecisionBimCoreInstance,
} from "./engine/createFrameLogicBimCoreNavigation";

import {
  CadCommandInputController,
} from "./interaction/CadCommandInputController";

import {
  CadLineNumericPreviewBridgeController,
} from "./interaction/CadLineNumericPreviewBridgeController";

import {
  CadLineSnapOrthoPriorityController,
} from "./interaction/CadLineSnapOrthoPriorityController";

import {
  CadLineTemporaryDimensionController,
} from "./interaction/CadLineTemporaryDimensionController";

import {
  ProjectCameraStateController,
} from "./project/ProjectCameraStateController";

import {
  configureMillimeterRuntime,
  installMillimeterUnitSystem,
} from "./units/MillimeterUnitSystemController";

export * from "./index";

export type {
  PrecisionBimCoreInstance,
} from "./engine/createFrameLogicBimCoreNavigation";

/*
 * Debe instalarse antes de crear DrawingProduction / GeneralPdf para que las
 * escalas de Paper Space nazcan usando la unidad canónica del Model Space.
 */
installMillimeterUnitSystem();

const STANDARD_START_DISTANCE_MM = 5000;
const STANDARD_ORTHO_VISIBLE_HEIGHT_MM = 5000;
const MODEL_SPACE_MIN_ORTHO_ZOOM = 0.0001;
const STANDARD_GRID_SIZE_MM = 20_000;
const STANDARD_GRID_STEP_MM = 100;

export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createNavigationBimCore(
      container,
    );
  const disposeMillimeterRuntime =
    configureMillimeterRuntime(
      core,
      container,
    );

  /*
   * Vista inicial canónica en milímetros.
   *
   * La distancia perspectiva queda en 5000 mm. La cámara ortográfica de
   * That Open, en cambio, nace con un frustum de aproximadamente 50 unidades;
   * tras adoptar mm eso equivalía a ver solamente ~50 mm de alto. Por eso una
   * línea de 10-20 mm ocupaba gran parte de la pantalla y la cuadrícula de
   * 100 mm parecía desaparecer.
   *
   * Ajustamos el zoom ortográfico para que el alto visible inicial sea 5000 mm.
   * Ese zoom inicial ronda 0.01, pero NO debe ser también el límite de zoom-out:
   * permitimos bajar hasta 0.0001 para poder inspeccionar estructuras mucho
   * mayores sin bloquear la rueda al encuadrar una geometría de 5 m.
   */
  const cameraControls =
    core.world.camera.controls as
      typeof core.world.camera.controls
      & {
        minZoom: number;
      };

  cameraControls.minZoom =
    MODEL_SPACE_MIN_ORTHO_ZOOM;

  const diagonal =
    STANDARD_START_DISTANCE_MM
    / Math.sqrt(3);

  await cameraControls.setLookAt(
    diagonal,
    diagonal,
    diagonal,
    0,
    0,
    0,
    false,
  );

  const orthoCamera =
    core.world.camera.threeOrtho;
  const orthoFrustumHeight =
    Math.abs(
      orthoCamera.top
      - orthoCamera.bottom,
    );
  const standardOrthoZoom =
    orthoFrustumHeight
    / STANDARD_ORTHO_VISIBLE_HEIGHT_MM;

  orthoCamera.zoom =
    standardOrthoZoom;
  orthoCamera.near =
    1;
  orthoCamera.far =
    10_000_000;
  orthoCamera.updateProjectionMatrix();

  if (
    core.world.camera.three
    === orthoCamera
  ) {
    await cameraControls.zoomTo(
      standardOrthoZoom,
      false,
    );
  }

  /*
   * Un proyecto nuevo siempre abre con la orientación CAD estándar:
   * Norte arriba y vista TOP. La escala ortográfica se conserva.
   */
  await core.setCardinalDirection(
    "N",
  );
  await core.setStandardView(
    "TOP",
  );

  /*
   * configureMillimeterRuntime conserva la escala física histórica del grid
   * multiplicándolo por 1000. Sustituimos únicamente su geometría para pasar
   * de 20 divisiones de 1000 mm a una retícula útil de 100 mm, manteniendo
   * un área total visible de 20 000 x 20 000 mm.
   */
  const workPlaneRuntime =
    core.cadWorkPlane as unknown as {
      readonly grid?: THREE.GridHelper;
    };
  const grid =
    workPlaneRuntime.grid;

  if (grid) {
    const unscaledSize =
      STANDARD_GRID_SIZE_MM / 1000;
    const divisions =
      Math.round(
        STANDARD_GRID_SIZE_MM
        / STANDARD_GRID_STEP_MM,
      );
    const replacement =
      new THREE.GridHelper(
        unscaledSize,
        divisions,
      );
    const previousGeometry =
      grid.geometry;

    grid.geometry =
      replacement.geometry;
    previousGeometry.dispose();

    replacement.geometry =
      new THREE.BufferGeometry();
    if (Array.isArray(replacement.material)) {
      for (const material of replacement.material) {
        material.dispose();
      }
    }
    else {
      replacement.material.dispose();
    }

    const materials =
      Array.isArray(grid.material)
        ? grid.material
        : [grid.material];
    for (const material of materials) {
      material.opacity =
        0.42;
      material.needsUpdate =
        true;
    }

    grid.updateMatrixWorld(
      true,
    );
  }

  const renderer =
    core.world.renderer;

  const lineSnapOrthoPriority =
    new CadLineSnapOrthoPriorityController(
      core.cadLinePlacement,
    );

  const temporaryLineDimensions =
    renderer
      ? new CadLineTemporaryDimensionController({
          domElement:
            renderer.three.domElement,
          scene:
            core.world.scene.three,
          cameraProvider: () =>
            core.world.camera.three,
          designModel:
            core.designModel,
          lineSelection:
            core.cadLineSelection,
          workPlane:
            core.cadWorkPlane,
          isLinePlacementActive: () =>
            core.cadLinePlacement.isActive,
        })
      : null;

  const lineNumericPreview =
    renderer
      ? new CadLineNumericPreviewBridgeController({
          container,
          linePlacement:
            core.cadLinePlacement,
        })
      : null;

  const commandInput =
    renderer
      ? new CadCommandInputController({
          domElement:
            renderer.three.domElement,
          hasActiveCommand: () =>
            core.cadCommandManager.hasActiveCommand,
          startLine: () =>
            core.startLineCommand(),
        })
      : null;

  const projectCameraState =
    new ProjectCameraStateController({
      projectPackage:
        core.projectPackage,
      cameraProvider: () =>
        core.world.camera.three,
      orthoCameraProvider: () =>
        core.world.camera.threeOrtho,
      controls:
        core.world.camera.controls,
      getProjectionMode: () =>
        core.getCameraProjectionMode(),
      toggleProjection: () =>
        core.toggleCameraProjection(),
    });

  const baseDispose =
    core.dispose;
  let disposed =
    false;

  const dispose =
    (): void => {
      if (disposed) {
        return;
      }
      disposed =
        true;
      projectCameraState.dispose();
      commandInput?.dispose();
      lineNumericPreview?.dispose();
      temporaryLineDimensions?.dispose();
      lineSnapOrthoPriority.dispose();
      disposeMillimeterRuntime();
      baseDispose();
    };

  Object.defineProperty(
    core,
    "dispose",
    {
      configurable: true,
      enumerable: true,
      writable: true,
      value: dispose,
    },
  );

  return core;
}
