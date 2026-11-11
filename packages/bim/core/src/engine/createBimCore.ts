import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { restoreCadMouseNavigationBindings } from "../navigation/CadMouseNavigationController";
import { finishActiveLineForAxisConversion } from "../interaction/finishActiveLineForAxisConversion";

import {
  DesignPlacementController,
} from "../interaction/DesignPlacementController";

import type {
  DesignSurfaceHit,
} from "../interaction/DesignPlacementController";

import {
  DEFAULT_DESIGN_LAYER_IDS,
  DesignModel,
} from "@framelogic/domain";

import type {
  CreateDesignLayerInput,
  DesignLayer,
  DesignLayerListener,
  RegisterPieceInstanceInput,
  UpdateDesignLayerInput,
} from "@framelogic/domain";

import {
  addSceneHelpers,
} from "../helpers/addSceneHelpers";

import {
  ModelRegistry,
} from "../models/ModelRegistry";

import {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import {
  PieceDefinitionHelperSceneController,
} from "../design/PieceDefinitionHelperSceneController";

import {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  DesignSelectionListener,
} from "../interaction/DesignSelectionController";

import {
  DesignTransformController,
} from "../interaction/DesignTransformController";

import type {
  DesignTransformMode,
} from "../interaction/DesignTransformController";

import {
  DesignRotateController,
} from "../interaction/DesignRotateController";
import { CadEntityRotateController } from "../interaction/CadEntityRotateController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

import {
  CadNumericInputController,
} from "../interaction/CadNumericInputController";

import {
  CadWorkPlaneController,
} from "../interaction/CadWorkPlaneController";

import type {
  CadWorkPlaneListener,
  CadWorkPlaneMode,
  CadWorkPlaneState,
} from "../interaction/CadWorkPlaneController";

import {
  CadWorkPlaneEditController,
} from "../interaction/CadWorkPlaneEditController";

import type {
  CadWorkPlaneEditListener,
  CadWorkPlaneEditState,
} from "../interaction/CadWorkPlaneEditController";

import {
  CadHistoryController,
} from "../interaction/CadHistoryController";

import {
  CadPointPlacementController,
} from "../interaction/CadPointPlacementController";

import {
  CadPointSelectionController,
} from "../interaction/CadPointSelectionController";

import type {
  CadPointSelectionListener,
} from "../interaction/CadPointSelectionController";

import {
  CadPointMoveController,
} from "../interaction/CadPointMoveController";

import {
  CadLineSelectionController,
} from "../interaction/CadLineSelectionController";

import type {
  CadLineSelectionListener,
} from "../interaction/CadLineSelectionController";

import {
  CadLinePlacementController,
} from "../interaction/CadLinePlacementController";

import {
  CadLineMoveController,
} from "../interaction/CadLineMoveController";

import {
  CadUnifiedSelectionController,
} from "../interaction/CadUnifiedSelectionController";

import type {
  CadSelectionState,
  CadUnifiedSelectionListener,
} from "../interaction/CadUnifiedSelectionController";

import {
  CadMixedMoveController,
} from "../interaction/CadMixedMoveController";

import {
  PieceDefinitionPreparationController,
} from "../interaction/PieceDefinitionPreparationController";

import {
  PieceDefinitionOriginEditController,
} from "../interaction/PieceDefinitionOriginEditController";

import type {
  PieceDefinitionOriginEditListener,
  PieceDefinitionOriginEditState,
} from "../interaction/PieceDefinitionOriginEditController";

import type {
  PieceDefinitionPreparationListener,
  PieceDefinitionPreparationState,
} from "../interaction/PieceDefinitionPreparationController";

import {
  CadWindowSelectionController,
} from "../interaction/CadWindowSelectionController";

import {
  DesignSnapController,
} from "../interaction/DesignSnapController";

import {
  CadCommandManager,
} from "../commands/CadCommandManager";

import {
  MoveCommand,
} from "../commands/MoveCommand";

import {
  RotateCommand,
} from "../commands/RotateCommand";

import {
  DeleteCommand,
} from "../commands/DeleteCommand";

import {
  PointCommand,
} from "../commands/PointCommand";

import {
  MoveCadPointCommand,
} from "../commands/MoveCadPointCommand";

import {
  DeleteCadPointCommand,
} from "../commands/DeleteCadPointCommand";

import {
  LineCommand,
} from "../commands/LineCommand";

import {
  MoveCadLineCommand,
} from "../commands/MoveCadLineCommand";

import {
  DeleteCadLineCommand,
} from "../commands/DeleteCadLineCommand";

import {
  MoveMixedSelectionCommand,
} from "../commands/MoveMixedSelectionCommand";

import {
  DeleteMixedSelectionCommand,
} from "../commands/DeleteMixedSelectionCommand";

export type StandardView =
  | "TOP"
  | "BOTTOM"
  | "FRONT"
  | "BACK"
  | "LEFT"
  | "RIGHT"
  | "ISO";

  export interface CameraOrientation {

    readonly azimuth:
      number;
  
    readonly polar:
      number;
  
  }

// ============================================================
// TYPES
// ============================================================

export interface ImportDesignPieceIfcInput {

  code: string;

  name?: string;

  classification?: string;

  tags?: string[];

}


// ============================================================
// CREATE BIM CORE
// ============================================================

export async function createBimCore(
  container: HTMLElement,
) {

  /*
   * FrameLogic usa Z como eje vertical global.
   * Se define antes de crear cámaras/controles Three.js.
   */
  THREE.Object3D.DEFAULT_UP.set(
    0,
    0,
    1,
  );


  // ==========================================================
  // COMPONENTS
  // ==========================================================

  const components =
    new OBC.Components();

    


  // ==========================================================
  // DESIGN MODEL
  // ==========================================================

  const designModel =
    new DesignModel();


  // ==========================================================
  // REFERENCE MODEL REGISTRY
  // ==========================================================

  const modelRegistry =
    new ModelRegistry();


  // ==========================================================
  // WORLD
  // ==========================================================

  const worlds =
    components.get(
      OBC.Worlds,
    );


    const world =
    worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBC.SimpleRenderer
    >();


  // ==========================================================
  // SCENE
  // ==========================================================

  world.scene =
    new OBC.SimpleScene(
      components,
    );


  world.scene.setup();

  // ==========================================================
// CARDINAL CAMERA DIRECTION
// ==========================================================

async function setCardinalDirection(
  direction:
    CardinalDirection,
): Promise<void> {

  const controls =
    world.camera.controls;


  const polar =
    controls.polarAngle;


  let azimuth:
    number;


  switch (
    direction
  ) {

    case "N":

      azimuth =
        0;

      break;


    case "E":

      azimuth =
        Math.PI / 2;

      break;


    case "S":

      azimuth =
        Math.PI;

      break;


    case "W":

      azimuth =
        -Math.PI / 2;

      break;

  }


  await controls.rotateTo(
    azimuth,
    polar,
    true,
  );

}


  // ==========================================================
  // DESIGN SCENE CONTROLLER
  // ==========================================================

  const designScene =
    new DesignSceneController(
      world.scene.three,
      designModel,
    );


  const cadPointScene =
    new CadPointSceneController(
      world.scene.three,
      designModel,
    );


  const cadLineScene =
    new CadLineSceneController(
      world.scene.three,
      designModel,
    );


  const pieceDefinitionHelpers =
    new PieceDefinitionHelperSceneController(
      world.scene.three,
      designModel,
      designScene,
    );


  // ==========================================================
  // RENDERER
  // ==========================================================

  world.renderer =
    new OBC.SimpleRenderer(
      components,
      container,
    );

  // That Open Engine permits hiding the optional corner logo.
  // Keep third-party MIT license notices intact in distributed code.
  world.renderer.showLogo = false;


  const canvas =
    world.renderer.three.domElement;


  world.renderer.three.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      2,
    ),
  );


  // ==========================================================
  // CAMERA
  // ==========================================================

  world.camera =
  new OBC.OrthoPerspectiveCamera(
    components,
  );


  world.camera.controls.dollySpeed =
    0.8;


  world.camera.controls.minDistance =
    0.02;


  /*
   * Navegación CAD cercana:
   *
   * - dollyToCursor hace que el zoom siga el punto que el
   *   usuario está inspeccionando;
   * - infinityDolly evita que la cámara quede "apretada"
   *   contra su target al alcanzar minDistance.
   */
  world.camera.controls.dollyToCursor =
    true;


  world.camera.controls.infinityDolly =
    true;


  const updateCloseCameraNavigation =
    (): void => {

      const distance =
        Math.max(
          world.camera.controls.distance,
          world.camera.controls.minDistance,
          0.02,
        );


      /*
       * CameraControls escala el truck/pan con la distancia
       * al target. Cerca de la geometría eso puede volver el
       * desplazamiento demasiado lento.
       *
       * Compensamos progresivamente solo en distancias cortas.
       */
      world.camera.controls.truckSpeed =
        THREE.MathUtils.clamp(
          0.5 / distance,
          2,
          20,
        );

    };


  world.camera.controls.addEventListener(
    "update",
    updateCloseCameraNavigation,
  );


  updateCloseCameraNavigation();


  world.camera.three.up.set(
    0,
    0,
    1,
  );


  const cameraControlsWithUp =
    world.camera.controls as
      typeof world.camera.controls
      & {
        updateCameraUp?:
          () => void;
      };


  cameraControlsWithUp
    .updateCameraUp
    ?.();


  // ==========================================================
  // THREE CAMERA
  // ==========================================================

  const cameraThree =
    world.camera.three;


  if (
    cameraThree
    instanceof THREE.PerspectiveCamera
  ) {

    cameraThree.near =
      0.01;


    cameraThree.far =
      1000;


    cameraThree.updateProjectionMatrix();

  }


  // ==========================================================
  // INITIALIZE COMPONENTS
  // ==========================================================

  components.init();


  // ==========================================================
  // INITIAL CAMERA POSITION
  // ==========================================================

  await world.camera.controls.setLookAt(
    6,
    6,
    6,

    0,
    0,
    0,
  );


  // ==========================================================
  // HELPERS
  // ==========================================================

  const helpers =
    addSceneHelpers(
      world.scene.three,
    );


  /*
   * La rejilla visible del espacio CAD la controla
   * CadWorkPlaneController. Ocultamos la antigua rejilla
   * fija XZ para no mostrar dos planos simultáneamente.
   */
  helpers.grid.visible =
    false;


  // ==========================================================
  // PIECE DEFINITION PREPARATION
  // ==========================================================

  function getPieceDefinitionPreparationState():
    PieceDefinitionPreparationState {

    return piecePreparation
      .getState();

  }


  function startPieceDefinitionPreparation(
    instanceId?:
      string,
  ):
    PieceDefinitionPreparationState {

    const currentPreparation = piecePreparation.getState();
    const selectedIds = designSelection.getSelectedIds();
    const targetId =
      instanceId
      ?? (selectedIds.length === 1 ? selectedIds[0] : undefined)
      ?? currentPreparation.instanceId
      ?? undefined;

    // No cancelar herramientas, perder una selección CAD o reiniciar
    // el workspace al convertir una línea o punto ya dibujado.
    if (currentPreparation.active && currentPreparation.instanceId === targetId) {
      return currentPreparation;
    }

    pieceOriginEdit.cancel();

    cadWindowSelection.cancel();

    cadCommandManager.cancelActive();

    cadNumericInput.hide();

    cadWorkPlaneEdit.cancel();


    if (
      !targetId
    ) {

      throw new Error(
        "Select exactly one PieceInstance before starting piece preparation.",
      );

    }


    const state =
      piecePreparation.start(
        targetId,
      );


    pieceDefinitionHelpers
      .setActiveInstanceId(
        targetId,
      );


    return state;

  }


  function getPieceDefinitionOriginEditState():
    PieceDefinitionOriginEditState {

    return pieceOriginEdit
      .getState();

  }


  function startPreparedPieceOriginSnapEdit():
    void {

    cadWindowSelection.cancel();

    cadCommandManager.cancelActive();

    cadNumericInput.hide();

    cadWorkPlaneEdit.cancel();


    pieceOriginEdit.start();

  }


  function cancelPreparedPieceOriginSnapEdit():
    void {

    pieceOriginEdit.cancel();

  }


  function subscribePieceDefinitionOriginEdit(
    listener:
      PieceDefinitionOriginEditListener,
  ):
    () => void {

    return pieceOriginEdit
      .subscribe(
        listener,
      );

  }


  function stopPieceDefinitionPreparation():
    void {

    pieceOriginEdit.cancel();


    piecePreparation.stop();


    pieceDefinitionHelpers
      .setActiveInstanceId(
        null,
      );

  }


  function setPreparedPieceOriginFromSelectedPoint():
    PieceDefinitionPreparationState {

    pieceOriginEdit.cancel();


    piecePreparation
      .setOriginFromSelectedCadPoint();


    pieceDefinitionHelpers.sync();


    return piecePreparation
      .getState();

  }


  function addPreparedPieceSnapsFromSelection():
    number {

    pieceOriginEdit.cancel();


    const added =
      piecePreparation
        .addSelectedCadPointsAsSnaps(
          "CUSTOM",
        );


    pieceDefinitionHelpers.sync();


    return added;

  }


  function addPreparedPieceAxesFromSelection():
    number {

    // Si se pulsa Línea → eje sin Esc, terminar LINE (sin deshacer
    // segmentos ya dibujados) y seleccionar el último segmento creado.
    // El comando LINE deshabilita selección CAD mientras está activo.
    finishActiveLineForAxisConversion(
      cadCommandManager,
      cadLinePlacement,
      cadLineSelection,
      (lineId) => Boolean(designModel.cadLines.get(lineId)),
    );
    pieceOriginEdit.cancel();


    const added =
      piecePreparation
        .addSelectedCadLinesAsAxes(
          "REFERENCE",
        );


    pieceDefinitionHelpers.sync();


    return added;

  }


  function subscribePieceDefinitionPreparation(
    listener:
      PieceDefinitionPreparationListener,
  ):
    () => void {

    return piecePreparation
      .subscribe(
        listener,
      );

  }


  // ==========================================================
  // CAD WORKPLANE
  // ==========================================================

  const cadWorkPlane =
    new CadWorkPlaneController(
      world.scene.three,
    );


  // ==========================================================
  // FRAGMENTS MANAGER
  // ==========================================================

  const fragments =
    components.get(
      OBC.FragmentsManager,
    );


  const workerUrl =
    await OBC.FragmentsManager.getWorker();


  fragments.init(
    workerUrl,
  );

  // ==========================================================
// REFERENCE SURFACE RAYCAST
//
// FrameLogic hace raycast modelo por modelo.
// Esto permite:
// - múltiples IFC de referencia
// - escoger siempre el impacto más cercano
// - evitar depender del raycaster global para multi-model
// ==========================================================

const referenceRaycaster =
new THREE.Raycaster();


const referencePointer =
new THREE.Vector2();


async function pickReferenceSurface(
clientX: number,
clientY: number,
): Promise<
DesignSurfaceHit
| null
> {

// --------------------------------------------------------
// FIND NEAREST FRAGMENTS HIT
// --------------------------------------------------------

let bestHit:
  {
    readonly modelId:
      string;

    readonly localId:
      number;

    readonly distance:
      number;
  }
  | null =
    null;


const rawMouse =
  new THREE.Vector2(
    clientX,
    clientY,
  );


for (
  const [, model]
  of fragments.list
) {

  // ------------------------------------------------------
  // IGNORE HIDDEN REFERENCE MODELS
  // ------------------------------------------------------

  if (
    !model.object.visible
  ) {

    continue;

  }


  const loadedReference =
    modelRegistry.getModel(
      model.modelId,
    );


  const referenceLayer =
    loadedReference
      ? designModel.layers.get(
          loadedReference.layerId,
        )
      : undefined;


  if (
    referenceLayer?.snapEnabled
    === false
  ) {

    continue;

  }


  try {

    const hit =
      await model.raycast({

        camera:
          world.camera.three,

        mouse:
          rawMouse,

        dom:
          canvas,

      });


    if (
      !hit
    ) {

      continue;

    }


    if (
      typeof hit.localId
      !== "number"
      || typeof hit.distance
      !== "number"
    ) {

      continue;

    }


    if (
      !bestHit
      || hit.distance
        < bestHit.distance
    ) {

      bestHit = {

        modelId:
          model.modelId,

        localId:
          hit.localId,

        distance:
          hit.distance,

      };

    }

  }
  catch (
    error
  ) {

    console.error(
      `Raycast failed for reference model "${model.modelId}":`,
      error,
    );

  }

}


if (
  !bestHit
) {

  return null;

}


// --------------------------------------------------------
// SCREEN -> NDC
//
// model.raycast() uses raw client coordinates.
// THREE.Raycaster uses normalized device coordinates.
// --------------------------------------------------------

const rect =
  canvas.getBoundingClientRect();


if (
  rect.width <= 0
  || rect.height <= 0
) {

  return null;

}


referencePointer.x =
  (
    (
      clientX
      - rect.left
    )
    / rect.width
  )
  * 2
  - 1;


referencePointer.y =
  -(
    (
      clientY
      - rect.top
    )
    / rect.height
  )
  * 2
  + 1;


// --------------------------------------------------------
// RECONSTRUCT WORLD POINT FROM DISTANCE
// --------------------------------------------------------

referenceRaycaster.setFromCamera(
  referencePointer,
  world.camera.three,
);


const point =
  referenceRaycaster.ray.at(
    bestHit.distance,
    new THREE.Vector3(),
  );


return {

  point,

  distance:
    bestHit.distance,

  modelId:
    bestHit.modelId,

  localId:
    bestHit.localId,

};

}


// ==========================================================
// DESIGN PLACEMENT
// ==========================================================

const designPlacement =
new DesignPlacementController(

  world.scene.three,

  canvas,

  () =>
    world.camera.three,

  designModel,

  designScene,

  pickReferenceSurface,

);

// ==========================================================
// DESIGN SNAP
// ==========================================================

const designSnap =
  new DesignSnapController(
    canvas,
    () =>
      world.camera.three,
    designScene,
    designModel,
  );


// ==========================================================
// DESIGN SELECTION
// ==========================================================

const designSelection =
  new DesignSelectionController(

    world.scene.three,

    canvas,

    () =>
      world.camera.three,

    designScene,

    designModel,

  );


designScene.setVisibilityFilter(
  (
    instanceId,
  ) =>
    designSelection
      .isInstanceVisibleByIsolation(
        instanceId,
      ),
);


// ==========================================================
// CAD POINT SELECTION
// ==========================================================

const cadPointSelection =
  new CadPointSelectionController(
    canvas,
    () =>
      world.camera.three,
    designModel,
    cadPointScene,
    designSelection,
  );


const cadLineSelection =
  new CadLineSelectionController(
    canvas,
    () =>
      world.camera.three,
    designModel,
    cadLineScene,
    designSelection,
    cadPointSelection,
  );


const cadSelection =
  new CadUnifiedSelectionController(
    designSelection,
    cadPointSelection,
    cadLineSelection,
  );


const piecePreparation =
  new PieceDefinitionPreparationController(
    designModel,
    designScene,
    cadPointSelection,
    cadLineSelection,
  );
piecePreparation.setReferenceFocusHandler(
  reference => pieceDefinitionHelpers.setHighlightedReference(reference),
);


designSelection
  .setExternalSelectionClearHandler(
    () => {

      cadPointSelection
        .clearSelection();


      cadLineSelection
        .clearSelection();

    },
  );


cadPointSelection
  .setExternalSelectionClearHandler(
    () => {

      cadLineSelection
        .clearSelection();

    },
  );


// ==========================================================
// WINDOW / CROSSING SELECTION
// ==========================================================

const cadWindowSelection =
  new CadWindowSelectionController(
    canvas,
    () =>
      world.camera.three,
    designModel,
    designScene,
    designSelection,
    cadPointSelection,
    cadLineSelection,
    (
      enabled,
    ) => {

      world.camera.controls.enabled =
        enabled;

    },
    () => designPlacement.isPlacing,
  );


// ==========================================================
// CAD WORKPLANE EDIT
// ==========================================================

const cadWorkPlaneEdit =
  new CadWorkPlaneEditController(
    canvas,
    cadWorkPlane,
    designSnap,
    designSelection,
    cadPointSelection,
    cadLineSelection,
  );


const pieceOriginEdit =
  new PieceDefinitionOriginEditController(
    canvas,
    designSnap,
    piecePreparation,
    designSelection,
    cadPointSelection,
    cadLineSelection,
  );


const unsubscribePiecePreparationHelpers =
  piecePreparation.subscribe(
    (
      state,
    ) => {

      pieceDefinitionHelpers
        .setActiveInstanceId(
          state.instanceId,
        );

    },
  );


// ==========================================================
// DESIGN LAYERS
// ==========================================================

function applyDesignLayerEffects(): void {

  designScene.sync();


  cadPointScene.sync();


  cadLineScene.sync();


  pieceDefinitionHelpers.sync();


  for (
    const layer
    of designModel.layers.getAll()
  ) {

    modelRegistry.setLayerVisible(
      layer.id,
      layer.visible,
    );

  }


  const selectableIds =
    designSelection
      .getSelectedIds()
      .filter(
        (
          instanceId,
        ) => {

          const instance =
            designModel
              .pieceInstances
              .get(
                instanceId,
              );


          if (
            !instance
          ) {

            return false;

          }


          const layer =
            designModel
              .layers
              .get(
                instance.layerId,
              );


          return (
            layer?.visible
            ?? true
          )
            && !(
              layer?.locked
              ?? false
            );

        },
      );


  if (
    selectableIds.length
    !== designSelection
      .getSelectedIds()
      .length
  ) {

    designSelection.setSelection(
      selectableIds,
    );

  }
  else {

    designSelection.refreshHelpers();

  }


  cadPointSelection.setSelection(
    cadPointSelection
      .getSelectedIds(),
    true,
  );


  cadLineSelection.setSelection(
    cadLineSelection
      .getSelectedIds(),
    true,
  );

}


const unsubscribeDesignLayers =
  designModel.layers.subscribe(
    applyDesignLayerEffects,
  );


// ==========================================================
// CAD HISTORY
// ==========================================================

const cadHistory =
  new CadHistoryController(
    designModel,
    designScene,
    designSelection,
  );


// ==========================================================
// CAD POINT PLACEMENT
// ==========================================================

const cadPointPlacement =
  new CadPointPlacementController(
    canvas,
    () =>
      world.camera.three,
    designModel,
    cadPointScene,
    designSnap,
    cadWorkPlane,
    cadHistory,
    designSelection,
    cadPointSelection,
    cadLineSelection,
  );


// ==========================================================
// CAD LINE PLACEMENT
// ==========================================================

const cadLinePlacement =
  new CadLinePlacementController(
    world.scene.three,
    canvas,
    () =>
      world.camera.three,
    designModel,
    cadLineScene,
    designSnap,
    cadWorkPlane,
    cadHistory,
    designSelection,
    cadPointSelection,
    cadLineSelection,
  );


// ==========================================================
// CAD POINT MOVE
// ==========================================================

const cadPointMove =
  new CadPointMoveController(
    world.scene.three,
    world.camera.three,
    canvas,
    designModel,
    cadPointScene,
    cadPointSelection,
    designSelection,
    cadHistory,
    (
      enabled,
    ) => {

      world.camera.controls.enabled =
        enabled;

    },
  );


// ==========================================================
// CAD LINE MOVE
// ==========================================================

const cadLineMove =
  new CadLineMoveController(
    world.scene.three,
    world.camera.three,
    canvas,
    designModel,
    cadLineScene,
    cadLineSelection,
    cadPointSelection,
    designSelection,
    cadHistory,
    designSnap,
    (
      enabled,
    ) => {

      world.camera.controls.enabled =
        enabled;

    },
  );


// ==========================================================
// MIXED CAD MOVE
// ==========================================================

const cadMixedMove =
  new CadMixedMoveController(
    world.scene.three,
    world.camera.three,
    canvas,
    designModel,
    designScene,
    cadPointScene,
    cadLineScene,
    cadSelection,
    designSelection,
    cadHistory,
    designSnap,
    (
      enabled,
    ) => {

      world.camera.controls.enabled =
        enabled;

    },
  );


  // ==========================================================
// DESIGN TRANSFORM
// ==========================================================

const designTransform =
new DesignTransformController(

  world.scene.three,

  world.camera.three,

  canvas,

  designModel,

  designScene,

  designSelection,

  cadHistory,

  designSnap,

  (
    enabled,
  ) => {

    world.camera.controls.enabled =
      enabled;

  },

);


// ==========================================================
// DESIGN ROTATE
// ==========================================================

const designRotate =
  new DesignRotateController(

    world.scene.three,

    world.camera.three,

    canvas,

    designModel,

    designScene,

    designSelection,

    cadHistory,

    designSnap,

    (
      enabled,
    ) => {

      world.camera.controls.enabled =
        enabled;

    },

  );


// ==========================================================
// CAD NUMERIC INPUT
// ==========================================================

const cadNumericInput =
  new CadNumericInputController(
    container,
  );

const cadEntityRotate = new CadEntityRotateController({
  scene: world.scene.three,
  camera: world.camera.three,
  canvas,
  model: designModel,
  lineScene: cadLineScene,
  pointScene: cadPointScene,
  lineSelection: cadLineSelection,
  pointSelection: cadPointSelection,
  designSelection,
  history: cadHistory,
  setCameraEnabled: enabled => { world.camera.controls.enabled = enabled; },
  onAxis: axis => cadNumericInput.showRotate(axis, false),
  onDeactivate: () => cadNumericInput.hide(),
});


designTransform.setNumericAxisHandler(
  (
    axis,
  ) => {

    cadNumericInput.showMove(
      axis,
    );

  },
);


cadPointMove.setNumericAxisHandler(
  (
    axis,
  ) => {

    cadNumericInput.showMove(
      axis,
    );

  },
);


cadLineMove.setNumericAxisHandler(
  (
    axis,
  ) => {

    cadNumericInput.showMove(
      axis,
    );

  },
);


cadMixedMove.setNumericAxisHandler(
  (
    axis,
  ) => {

    cadNumericInput.showMove(
      axis,
    );

  },
);


designRotate.setNumericAxisHandler(
  (
    axis,
  ) => {

    cadNumericInput.showRotate(
      axis,
      false, // Never steal focus while the physical mouse still drags a ring.
    );

  },
);


cadNumericInput.setMoveApplyHandler(
  (
    axis,
    first,
    second,
  ) => {

    if (
      cadMixedMove.isActive
    ) {

      cadMixedMove.applyNumericMove(
        axis,
        first,
        second,
      );


      return;

    }


    if (
      cadPointMove.isActive
    ) {

      cadPointMove.applyNumericMove(
        axis,
        first,
        second,
      );


      return;

    }


    if (
      cadLineMove.isActive
    ) {

      cadLineMove.applyNumericMove(
        axis,
        first,
        second,
      );


      return;

    }


    designTransform.applyNumericMove(
      axis,
      first,
      second,
    );

  },
);


cadNumericInput.setRotateApplyHandler(
  (
    axis,
    degrees,
  ) => {

    const reference = getActiveCadReferenceBlockController();
    if (reference?.isRotateActive) {
      reference.applyNumericRotation(axis, degrees);
    } else if (cadEntityRotate.isActive) {
      cadEntityRotate.applyNumericRotation(axis, degrees);
    } else {
      designRotate.applyNumericRotation(axis, degrees);
    }

  },
);


cadNumericInput.setPointApplyHandler(
  (
    x,
    y,
    z,
  ) => {

    cadPointPlacement
      .createAtCoordinates(
        x,
        y,
        z,
      );

  },
);


cadNumericInput.setLineApplyHandler(
  (
    x,
    y,
    z,
  ) => {

    cadLinePlacement
      .createAtCoordinates(
        x,
        y,
        z,
      );

  },
);

// ==========================================================
// CAD COMMANDS
// ==========================================================

const cadCommandManager =
  new CadCommandManager();


const moveCommand =
  new MoveCommand(
    designSelection,
    designTransform,
  );


const rotateCommand =
  new RotateCommand(
    designSelection,
    designRotate,
    () => cadNumericInput.showRotate("Z", false),
    () => cadNumericInput.hide(),
  );

const rotateCadEntityCommand = {
  id: "ROTATE_CAD_ENTITY",
  start: () => cadEntityRotate.activate(),
  cancel: () => cadEntityRotate.deactivate(),
};


const pointCommand =
  new PointCommand(
    cadPointPlacement,
  );


const lineCommand =
  new LineCommand(
    cadLinePlacement,
  );


const moveCadPointCommand =
  new MoveCadPointCommand(
    cadPointMove,
  );


const moveCadLineCommand =
  new MoveCadLineCommand(
    cadLineMove,
  );


const moveMixedSelectionCommand =
  new MoveMixedSelectionCommand(
    cadMixedMove,
  );


const deleteCadPointCommand =
  new DeleteCadPointCommand(
    designModel,
    cadPointScene,
    cadPointSelection,
    cadHistory,
  );


const deleteCadLineCommand =
  new DeleteCadLineCommand(
    designModel,
    cadLineScene,
    cadLineSelection,
    cadHistory,
  );


const deleteMixedSelectionCommand =
  new DeleteMixedSelectionCommand(
    designModel,
    designScene,
    cadPointScene,
    cadLineScene,
    cadSelection,
    designSelection,
    cadPointSelection,
    cadLineSelection,
    cadHistory,
  );


const deleteCommand =
  new DeleteCommand(
    designModel,
    designScene,
    designSelection,
    cadHistory,
  );

  const unsubscribeCadSelection =
  designSelection.subscribe(
    (
      selectedIds,
    ) => {

      /*
       * La selección puede ser mixta cuando se usa ventana
       * o Ctrl/Shift. Los clics simples siguen reemplazando
       * la selección mediante los controladores individuales.
       *
       * MOVE / ROTATE de piezas necesitan selección de piezas.
       * POINT y MOVE_POINT tienen su propia selección.
       */
      if (
        selectedIds.length === 0
        && (
          cadCommandManager.activeCommandId
            === "MOVE"
          || cadCommandManager.activeCommandId
            === "ROTATE"
        )
      ) {

        cadCommandManager.cancelActive();


        cadNumericInput.hide();

      }

    },
  );


const unsubscribeCadPointSelection =
  cadPointSelection.subscribe(
    (
      selectedIds,
    ) => {

      if (
        selectedIds.length === 0
        && cadCommandManager.activeCommandId
          === "MOVE_POINT"
      ) {

        cadCommandManager.cancelActive();


        cadNumericInput.hide();

      }

    },
  );


const unsubscribeCadLineSelection =
  cadLineSelection.subscribe(
    (
      selectedIds,
    ) => {

      if (
        selectedIds.length === 0
        && cadCommandManager.activeCommandId
          === "MOVE_LINE"
      ) {

        cadCommandManager.cancelActive();


        cadNumericInput.hide();

      }

    },
  );


const unsubscribeCadUnifiedSelection =
  cadSelection.subscribe(
    (
      state,
    ) => {

      if (
        (
          state.items.length === 0
          || state.selectedTypeCount < 2
        )
        && cadCommandManager.activeCommandId
          === "MOVE_MIXED"
      ) {

        cadCommandManager.cancelActive();


        cadNumericInput.hide();

      }

    },
  );


// ==========================================================
// KEYBOARD
// ==========================================================

function isEditableKeyboardTarget(
  target:
    EventTarget | null,
): boolean {

  if (
    !(target instanceof HTMLElement)
  ) {

    return false;

  }


  return (
    target.isContentEditable
    || target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
  );

}


const handleCadKeyDown =
  (
    event:
      KeyboardEvent,
  ): void => {

    /*
     * Escape siempre pertenece al flujo CAD,
     * incluso si el foco está dentro de una casilla numérica.
     */
    if (
      event.key === "Escape"
    ) {

      if (
        pieceOriginEdit.isActive
      ) {

        event.preventDefault();


        event.stopPropagation();


        pieceOriginEdit.cancel();


        return;

      }


      if (
        cadWindowSelection.isActive
      ) {

        event.preventDefault();


        event.stopPropagation();


        cadWindowSelection.cancel();


        return;

      }


      if (
        cadWorkPlaneEdit.isActive
      ) {

        event.preventDefault();


        event.stopPropagation();


        cadWorkPlaneEdit.cancel();


        return;

      }


      /*
       * Primer Escape:
       *
       * cancela MOVE pero conserva la selección.
       */

      if (
        cadCommandManager
          .hasActiveCommand
      ) {

        event.preventDefault();


        event.stopPropagation();


        cadCommandManager
          .cancelActive();


        cadNumericInput.hide();


        return;

      }


      /*
       * Segundo Escape:
       *
       * si no existe ningún comando,
       * limpia la selección.
       */

      const hasSelection =
        cadLineSelection
          .getSelectedIds()
          .length > 0
        || cadPointSelection
          .getSelectedIds()
          .length > 0
        || designSelection
          .getSelectedIds()
          .length > 0;


      if (
        hasSelection
      ) {

        event.preventDefault();


        event.stopPropagation();


        cadLineSelection
          .clearSelection();


        cadPointSelection
          .clearSelection();


        designSelection
          .clearSelection();

      }


      return;

    }


    /*
     * M / R no se capturan mientras el usuario
     * está escribiendo en una casilla.
     */
    if (
      isEditableKeyboardTarget(
        event.target,
      )
    ) {

      return;

    }


    // ------------------------------------------------------
    // CTRL+Z = UNDO
    // CTRL+Y / CTRL+SHIFT+Z = REDO
    // ------------------------------------------------------

    const key =
      event.key.toLowerCase();


    const commandModifier =
      event.ctrlKey
      || event.metaKey;


    if (
      commandModifier
      && key === "z"
    ) {

      event.preventDefault();


      event.stopPropagation();


      if (
        cadCommandManager
          .hasActiveCommand
      ) {

        cadCommandManager
          .cancelActive();


        cadNumericInput.hide();

      }


      if (
        event.shiftKey
      ) {

        cadHistory.redo();

      }
      else {

        cadHistory.undo();

      }


      return;

    }


    if (
      commandModifier
      && key === "y"
    ) {

      event.preventDefault();


      event.stopPropagation();


      if (
        cadCommandManager
          .hasActiveCommand
      ) {

        cadCommandManager
          .cancelActive();


        cadNumericInput.hide();

      }


      cadHistory.redo();


      return;

    }


    // ------------------------------------------------------
    // DELETE = DELETE SELECTED PIECES
    // ------------------------------------------------------

    if (
      event.key === "Delete"
    ) {

      event.preventDefault();


      event.stopPropagation();


      if (
        cadCommandManager
          .hasActiveCommand
      ) {

        cadCommandManager
          .cancelActive();


        cadNumericInput.hide();

      }


      try {

        const selectedLineCount =
          cadLineSelection
            .getSelectedIds()
            .length;


        const selectedPointCount =
          cadPointSelection
            .getSelectedIds()
            .length;


        const selectedPieceCount =
          designSelection
            .getSelectedIds()
            .length;


        const selectedTypeCount =
          Number(
            selectedLineCount > 0,
          )
          + Number(
              selectedPointCount > 0,
            )
          + Number(
              selectedPieceCount > 0,
            );


        if (
          selectedTypeCount > 1
        ) {

          deleteMixedSelectionCommand
            .execute();


          return;

        }


        if (
          selectedLineCount > 0
        ) {

          deleteCadLineCommand.execute();

        }
        else if (
          selectedPointCount > 0
        ) {

          deleteCadPointCommand.execute();

        }
        else {

          deleteCommand.execute();

        }

      }
      catch (
        error
      ) {

        console.error(
          "DELETE command failed:",
          error,
        );


        const message =
          error instanceof Error
            ? error.message
            : String(
                error,
              );


        window.alert(
          message,
        );

      }


      return;

    }


    // ------------------------------------------------------
    // P = POINT
    // ------------------------------------------------------

    if (
      event.key.toLowerCase()
        === "p"
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {

      pieceOriginEdit.cancel();


      cadWindowSelection.cancel();


      cadWorkPlaneEdit.cancel();


      cadNumericInput.hide();


      const started =
        cadCommandManager.start(
          pointCommand,
        );


      if (
        started
      ) {

        cadNumericInput.showPoint();


        event.preventDefault();


        event.stopPropagation();

      }


      return;

    }


    // ------------------------------------------------------
    // L = LINE
    // ------------------------------------------------------

    if (
      event.key.toLowerCase()
        === "l"
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {

      pieceOriginEdit.cancel();


      cadWindowSelection.cancel();


      cadWorkPlaneEdit.cancel();


      cadNumericInput.hide();


      const started =
        cadCommandManager.start(
          lineCommand,
        );


      if (
        started
      ) {

        cadNumericInput.showLine();


        event.preventDefault();


        event.stopPropagation();

      }


      return;

    }


    // ------------------------------------------------------
    // M = MOVE
    // ------------------------------------------------------

    if (
      event.key.toLowerCase()
        === "m"
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {

      pieceOriginEdit.cancel();


      cadWindowSelection.cancel();


      cadWorkPlaneEdit.cancel();


      cadNumericInput.hide();


      // In the piece editor LINE may still be active. M should
      // finish the last complete CAD segment and activate its own gizmo
      // without deleting the geometry or requiring two Esc presses.
      finishActiveLineForAxisConversion(
        cadCommandManager, cadLinePlacement, cadLineSelection,
        id => Boolean(designModel.cadLines.get(id)),
      );

      const selectedLineCount =
        cadLineSelection
          .getSelectedIds()
          .length;


      const selectedPointCount =
        cadPointSelection
          .getSelectedIds()
          .length;


      const selectedPieceCount =
        designSelection
          .getSelectedIds()
          .length;


      const selectedTypeCount =
        Number(
          selectedLineCount > 0,
        )
        + Number(
            selectedPointCount > 0,
          )
        + Number(
            selectedPieceCount > 0,
          );


      const started =
        selectedTypeCount > 1
          ? cadCommandManager.start(
              moveMixedSelectionCommand,
            )
          : selectedLineCount > 0
          ? cadCommandManager.start(
              moveCadLineCommand,
            )
          : selectedPointCount > 0
            ? cadCommandManager.start(
                moveCadPointCommand,
              )
            : cadCommandManager.start(
                moveCommand,
              );


      if (
        started
      ) {

        event.preventDefault();


        event.stopPropagation();

      }


      return;

    }


    // ------------------------------------------------------
    // R = ROTATE
    // ------------------------------------------------------

    if (
      event.key.toLowerCase()
        === "r"
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {

      pieceOriginEdit.cancel();


      cadWindowSelection.cancel();


      cadWorkPlaneEdit.cancel();


      cadNumericInput.hide();


      const hasCadEntitySelection =
        cadPointSelection.getSelectedIds().length > 0
        || cadLineSelection.getSelectedIds().length > 0;
      const hasPieceSelection = designSelection.getSelectedIds().length > 0;
      if (hasCadEntitySelection && hasPieceSelection) {
        window.alert(
          "ROTATE: selecciona entidades CAD o piezas 3D, no ambas clases simultáneamente.",
        );
        return;
      }

      const started = cadCommandManager.start(
        hasCadEntitySelection ? rotateCadEntityCommand : rotateCommand,
      );


      if (
        started
      ) {

        event.preventDefault();


        event.stopPropagation();

      }

    }

  };


window.addEventListener(
  "keydown",
  handleCadKeyDown,
);


// ==========================================================
// DOUBLE CLICK EMPTY SPACE = CANCEL ACTIVE CAD COMMAND
// ==========================================================

const handleCadDoubleClick =
  (
    event:
      MouseEvent,
  ): void => {

    if (
      !cadCommandManager
        .hasActiveCommand
    ) {

      return;

    }


    const instanceId =
      designSelection
        .getInstanceIdAt(
          event.clientX,
          event.clientY,
        );


    /*
     * Doble clic sobre geometría:
     * no cancela el comando.
     */
    if (
      instanceId
    ) {

      return;

    }


    event.preventDefault();


    event.stopPropagation();


    cadCommandManager
      .cancelActive();


    cadNumericInput.hide();

  };


canvas.addEventListener(
  "dblclick",
  handleCadDoubleClick,
);

  // ==========================================================
  // UPDATE FRAGMENTS WHEN CAMERA MOVES
  // ==========================================================

  const updateFragments =
    () => {

      /*
       * En modo ortográfico la cámara activa de
       * OrthoPerspectiveCamera puede cambiar/actualizarse
       * mientras el usuario navega.
       *
       * Sincronizamos los gizmos en CADA update para que
       * su raycast siga usando exactamente la cámara visible.
       */
      const activeCamera =
        world.camera.three;


      designTransform.setCamera(
        activeCamera,
      );


      designRotate.setCamera(
        activeCamera,
      );
      cadEntityRotate.setCamera(activeCamera);
      cadPointMove.setCamera(activeCamera);
      cadLineMove.setCamera(activeCamera);
      cadMixedMove.setCamera(activeCamera);

      fragments.core.update();

    };


  world.camera.controls.addEventListener(
    "update",
    updateFragments,
  );


  // ==========================================================
  // CAMERA CHANGED
  // ==========================================================

  world.onCameraChanged.add(
    (
      camera,
    ) => {

      /*
       * OrthoPerspectiveCamera puede cambiar la instancia
       * THREE.Camera activa al alternar proyección.
       *
       * Los gizmos deben recibir esa misma cámara para que
       * su raycast de ejes/anillos siga coincidiendo con lo
       * que el usuario ve.
       */
      camera.three.up.set(
        0,
        0,
        1,
      );


      cameraControlsWithUp
        .updateCameraUp
        ?.();


      designTransform.setCamera(
        camera.three,
      );


      cadPointMove.setCamera(
        camera.three,
      );


      cadLineMove.setCamera(
        camera.three,
      );


      cadMixedMove.setCamera(
        camera.three,
      );


      designRotate.setCamera(
        camera.three,
      );


      for (
        const [, model]
        of fragments.list
      ) {

        model.useCamera(
          camera.three,
        );

      }


      fragments.core.update(
        true,
      );

    },
  );


  // ==========================================================
  // IFC LOADER
  // ==========================================================

  const ifcLoader =
    components.get(
      OBC.IfcLoader,
    );


  const ifcReady =
    ifcLoader.setup({

      autoSetWasm:
        false,

      wasm: {

        path:
          "/wasm/",

        absolute:
          true,

      },

      webIfc: {

        // Las piezas y modelos de FrameLogic
        // conservan el origen definido en el IFC.
        COORDINATE_TO_ORIGIN:
          false,

      },

    });


  // ==========================================================
  // MESHER
  //
  // Extrae meshes Three.js desde Fragments.
  // Estos meshes se utilizarán como geometría base
  // reutilizable para las PieceInstance.
  // ==========================================================

  const mesher =
    components.get(
      OBF.Mesher,
    );


  // ==========================================================
  // LOAD REFERENCE IFC
  // ==========================================================

  async function loadIfcFile(
    file: File,
  ) {

    await ifcReady;


    // --------------------------------------------------------
    // READ FILE
    // --------------------------------------------------------

    const arrayBuffer =
      await file.arrayBuffer();


    const data =
      new Uint8Array(
        arrayBuffer,
      );


    // --------------------------------------------------------
    // UNIQUE INTERNAL MODEL ID
    //
    // Permite abrir varias veces incluso un IFC
    // con exactamente el mismo nombre.
    // --------------------------------------------------------

    const referenceModelId =
      `REFERENCE_${crypto.randomUUID()}`;


    // --------------------------------------------------------
    // LOAD IFC
    // --------------------------------------------------------

    const model =
      await ifcLoader.load(
        data,
        false,
        referenceModelId,
      );


    // --------------------------------------------------------
    // CAMERA
    // --------------------------------------------------------

    model.useCamera(
      world.camera.three,
    );


    // --------------------------------------------------------
    // ADD TO SCENE
    // --------------------------------------------------------

    world.scene.three.add(
      model.object,
    );


    // --------------------------------------------------------
    // REGISTER REFERENCE MODEL
    // --------------------------------------------------------

    const loadedModel =
      modelRegistry.register({

        id:
          referenceModelId,

        name:
          file.name,

        source:
          "IFC",

        role:
          "REFERENCE",

        layerId:
          DEFAULT_DESIGN_LAYER_IDS
            .EXTERNAL_REFERENCES,

        visible:
          true,


        // ====================================================
        // VISIBILITY
        // ====================================================

        setVisible:
          (
            visible,
          ) => {

            model.object.visible =
              visible;


            fragments.core.update(
              true,
            );

          },


        // ====================================================
        // REMOVE
        // ====================================================

        remove:
          () => {

            world.scene.three.remove(
              model.object,
            );


            void fragments.core.disposeModel(
              model.modelId,
            );

          },

      });


    const externalLayer =
      designModel.layers.get(
        DEFAULT_DESIGN_LAYER_IDS
          .EXTERNAL_REFERENCES,
      );


    modelRegistry.setLayerVisible(
      DEFAULT_DESIGN_LAYER_IDS
        .EXTERNAL_REFERENCES,
      externalLayer?.visible
      ?? true,
    );


    // --------------------------------------------------------
    // UPDATE FRAGMENTS
    // --------------------------------------------------------

    await fragments.core.update(
      true,
    );


    return loadedModel;

  }


  // ==========================================================
  // IMPORT IFC AS FRAMELOGIC PIECE DEFINITION
  // ==========================================================

  async function importDesignPieceIfc(
    file: File,
    input: ImportDesignPieceIfcInput,
  ) {

    await ifcReady;


    // --------------------------------------------------------
    // VALIDATE CODE
    // --------------------------------------------------------

    const code =
      input.code.trim();


    if (
      code.length === 0
    ) {

      throw new Error(
        "A piece code is required.",
      );

    }


    // --------------------------------------------------------
    // PREVENT DUPLICATE PIECE CODE
    // --------------------------------------------------------

    const existingDefinition =
      designModel
        .pieceDefinitions
        .findByCode(
          code,
        );


    if (
      existingDefinition
    ) {

      throw new Error(
        `A piece definition with code "${code}" already exists.`,
      );

    }


    // --------------------------------------------------------
    // READ IFC
    // --------------------------------------------------------

    const arrayBuffer =
      await file.arrayBuffer();


    const data =
      new Uint8Array(
        arrayBuffer,
      );


    // --------------------------------------------------------
    // TEMPORARY FRAGMENTS MODEL
    //
    // Solo se utiliza para extraer la geometría.
    // No se añade directamente a la escena.
    // --------------------------------------------------------

    const temporaryModelId =
      `PIECE_IMPORT_${crypto.randomUUID()}`;


    const model =
      await ifcLoader.load(
        data,
        false,
        temporaryModelId,
      );


    try {

      // ------------------------------------------------------
      // GET ITEMS WITH GEOMETRY
      // ------------------------------------------------------

      const items =
        await model.getItemsWithGeometry();


        const localIds =
        (
          await Promise.all(
            items.map(
              (
                item,
              ) =>
                item.getLocalId(),
            ),
          )
        ).filter(
          (
            localId,
          ): localId is number =>
            localId !== null,
        );
      
      
      if (
        localIds.length === 0
      ) {
      
        throw new Error(
          `The IFC "${file.name}" does not contain renderable geometry.`,
        );
      
      }
      
      
      // ------------------------------------------------------
      // MODEL ID MAP
      //
      // ModelIdMap utiliza:
      //
      // modelId -> Set<localId>
      // ------------------------------------------------------
      
      const modelIdMap:
        OBC.ModelIdMap = {
      
          [model.modelId]:
            new Set(
              localIds,
            ),
      
        };


      // ------------------------------------------------------
      // EXTRACT THREE.JS MESHES
      // ------------------------------------------------------

      const meshResult =
        await mesher.get(
          modelIdMap,
          {

            applyTransformation:
              true,

          },
        );


      const meshes =
        mesher.getMeshesFromResult(
          meshResult,
        );


      if (
        meshes.length === 0
      ) {

        throw new Error(
          `No meshes could be extracted from "${file.name}".`,
        );

      }


      // ------------------------------------------------------
      // CREATE REUSABLE VISUAL PROTOTYPE
      // ------------------------------------------------------

      const prototype =
        new THREE.Group();


      prototype.name =
        `PiecePrototype:${code}`;


      for (
        const mesh
        of meshes
      ) {

        prototype.add(
          mesh,
        );

      }


      // ------------------------------------------------------
      // REGISTER ASSET
      // ------------------------------------------------------

      const asset =
        designModel.registerAsset({

          name:
            file.name,

          format:
            "IFC",

        });


      // ------------------------------------------------------
      // REGISTER PIECE DEFINITION
      // ------------------------------------------------------

      let definition;


      try {

        definition =
          designModel.registerPieceDefinition({

            code,

            name:
              input.name
                ?.trim()
              || code,

            geometryAssetId:
              asset.id,

            classification:
              input.classification
                ?.trim()
              || undefined,

            tags:
              input.tags
              ?? [],

          });

      }
      catch (
        error
      ) {

        // Si falla la definición,
        // no dejamos un Asset huérfano.

        designModel.removeAsset(
          asset.id,
        );


        throw error;

      }


      // ------------------------------------------------------
      // CONNECT VISUAL PROTOTYPE WITH ASSET
      // ------------------------------------------------------

      try {

        designScene.registerAssetPrototype(
          asset.id,
          prototype,
        );

      }
      catch (
        error
      ) {

        // Rollback del dominio si falla el registro visual.

        designModel.removePieceDefinition(
          definition.id,
        );


        designModel.removeAsset(
          asset.id,
        );


        throw error;

      }


      // ------------------------------------------------------
      // RESULT
      // ------------------------------------------------------

      return {

        asset,

        definition,

      };

    }
    finally {

      // ------------------------------------------------------
      // DISPOSE TEMPORARY FRAGMENTS MODEL
      //
      // Los meshes Three.js necesarios ya fueron extraídos.
      // ------------------------------------------------------

      await fragments.core.disposeModel(
        model.modelId,
      );

    }

  }


  // ==========================================================
  // CREATE DESIGN PIECE INSTANCE
  // ==========================================================

  function createDesignPieceInstance(
    input: RegisterPieceInstanceInput,
  ) {

    const instance =
      designModel.registerPieceInstance(
        input,
      );


    designScene.sync();


    return instance;

  }


  // ==========================================================
  // UPDATE DESIGN PIECE INSTANCE TRANSFORM
  // ==========================================================

  function updateDesignPieceInstanceTransform(
    instanceId: string,
    transform:
      NonNullable<
        RegisterPieceInstanceInput["transform"]
      >,
  ) {

    const instance =
      designModel
        .pieceInstances
        .updateTransform(
          instanceId,
          transform,
        );


    if (
      instance
    ) {

      designScene.sync();

    }


    return instance;

  }


  // ==========================================================
  // REMOVE DESIGN PIECE INSTANCE
  // ==========================================================

  function removeDesignPieceInstance(
    instanceId: string,
  ): boolean {

    const removed =
      designModel.removePieceInstance(
        instanceId,
      );


    if (
      removed
    ) {

      designScene.sync();

    }


    return removed;

  }

  // ==========================================================
// START DESIGN PIECE PLACEMENT
// ==========================================================

async function startDesignPiecePlacement(
  definitionId: string,
) {

  // Una selección por ventana pendiente no debe consumir el primer clic.
  cadWindowSelection.cancel();
  cadCommandManager.cancelActive();
  designSelection.setEnabled(false);
  cadPointSelection.setEnabled(false);
  cadLineSelection.setEnabled(false);


  try {

    return await designPlacement
      .startPlacement(
        definitionId,
      );

  }
  finally {

    designSelection.setEnabled(true);
    cadPointSelection.setEnabled(true);
    cadLineSelection.setEnabled(true);

  }

}


// ==========================================================
// CANCEL DESIGN PIECE PLACEMENT
// ==========================================================

function cancelDesignPiecePlacement(): void {

  designPlacement
    .cancelPlacement();

}

  // ==========================================================
  // GET LOADED REFERENCE MODELS
  // ==========================================================

  function getLoadedModels() {

    return modelRegistry
      .getLoadedModels();

  }


  // ==========================================================
  // GET REFERENCE MODEL
  // ==========================================================

  function getModel(
    id: string,
  ) {

    return modelRegistry
      .getModel(
        id,
      );

  }


  // ==========================================================
  // REFERENCE MODEL VISIBILITY
  // ==========================================================

  function setModelVisible(
    id: string,
    visible: boolean,
  ): boolean {

    return modelRegistry
      .setModelVisible(
        id,
        visible,
      );

  }


  // ==========================================================
  // REMOVE REFERENCE MODEL
  // ==========================================================

  function removeModel(
    id: string,
  ): boolean {

    return modelRegistry
      .removeModel(
        id,
      );

  }


  // ==========================================================
  // CLEAR REFERENCE MODELS
  // ==========================================================

  function clearModels(): void {

    modelRegistry
      .clearModels();

  }

  // ==========================================================
  // CAD WORKPLANE
  // ==========================================================

  function getCadWorkPlaneState():
    CadWorkPlaneState {

    return cadWorkPlane
      .getState();

  }


  function setCadWorkPlaneMode(
    mode:
      CadWorkPlaneMode,
  ): void {

    pieceOriginEdit.cancel();


    cadWorkPlaneEdit.cancel();


    cadWorkPlane.setMode(
      mode,
    );

  }


  function cycleCadWorkPlane():
    CadWorkPlaneMode {

    pieceOriginEdit.cancel();


    cadWorkPlaneEdit.cancel();


    return cadWorkPlane
      .cycleMode();

  }


  function subscribeCadWorkPlane(
    listener:
      CadWorkPlaneListener,
  ): () => void {

    return cadWorkPlane
      .subscribe(
        listener,
      );

  }


  function getCadWorkPlaneEditState():
    CadWorkPlaneEditState {

    return cadWorkPlaneEdit
      .getState();

  }


  function startCadWorkPlaneOriginEdit():
    void {

    pieceOriginEdit.cancel();


    cadWindowSelection.cancel();


    cadCommandManager.cancelActive();

    cadNumericInput.hide();


    if (
      cadWorkPlane.mode
      === "OFF"
    ) {

      cadWorkPlane.setMode(
        "XY",
      );

    }


    cadWorkPlaneEdit.startOrigin();

  }


  function startCadWorkPlaneThreePointEdit():
    void {

    pieceOriginEdit.cancel();


    cadWindowSelection.cancel();


    cadCommandManager.cancelActive();

    cadNumericInput.hide();

    cadWorkPlaneEdit.startThreePoints();

  }


  function cancelCadWorkPlaneEdit():
    void {

    cadWorkPlaneEdit.cancel();

  }


  function subscribeCadWorkPlaneEdit(
    listener:
      CadWorkPlaneEditListener,
  ): () => void {

    return cadWorkPlaneEdit
      .subscribe(
        listener,
      );

  }


  // ==========================================================
  // DESIGN LAYERS
  // ==========================================================

  function getDesignLayers():
    DesignLayer[] {

    return designModel.layers
      .getAll();

  }


  function getActiveDesignLayerId():
    string {

    return designModel.layers
      .activeLayerId;

  }


  function createDesignLayer(
    input:
      CreateDesignLayerInput,
  ):
    DesignLayer {

    return designModel.layers
      .create(
        input,
      );

  }


  function updateDesignLayer(
    layerId: string,
    input:
      UpdateDesignLayerInput,
  ):
    DesignLayer
    | undefined {

    return designModel.layers
      .update(
        layerId,
        input,
      );

  }


  function setActiveDesignLayer(
    layerId: string,
  ): boolean {

    return designModel.layers
      .setActiveLayer(
        layerId,
      );

  }


  function subscribeDesignLayers(
    listener:
      DesignLayerListener,
  ): () => void {

    return designModel.layers
      .subscribe(
        listener,
      );

  }


  function assignSelectedPieceInstancesToLayer(
    layerId: string,
  ): number {

    const layer =
      designModel.layers.get(
        layerId,
      );


    if (
      !layer
    ) {

      throw new Error(
        `Layer "${layerId}" does not exist.`,
      );

    }


    let updated =
      0;


    for (
      const instanceId
      of designSelection
        .getSelectedIds()
    ) {

      if (
        designModel
          .updatePieceInstanceLayer(
            instanceId,
            layerId,
          )
      ) {

        updated +=
          1;

      }

    }


    for (
      const pointId
      of cadPointSelection
        .getSelectedIds()
    ) {

      if (
        designModel
          .updateCadPointLayer(
            pointId,
            layerId,
          )
      ) {

        updated +=
          1;

      }

    }


    for (
      const lineId
      of cadLineSelection
        .getSelectedIds()
    ) {

      if (
        designModel
          .updateCadLineLayer(
            lineId,
            layerId,
          )
      ) {

        updated +=
          1;

      }

    }


    applyDesignLayerEffects();


    return updated;

  }


  function assignCadSelectionToLayer(
    layerId: string,
  ):
    number {

    return assignSelectedPieceInstancesToLayer(
      layerId,
    );

  }


  function setReferenceModelLayer(
    modelId: string,
    layerId: string,
  ): boolean {

    const layer =
      designModel.layers.get(
        layerId,
      );


    if (
      !layer
    ) {

      throw new Error(
        `Layer "${layerId}" does not exist.`,
      );

    }


    const updated =
      modelRegistry
        .setModelLayerId(
          modelId,
          layerId,
        );


    if (
      !updated
    ) {

      return false;

    }


    modelRegistry.setLayerVisible(
      layerId,
      layer.visible,
    );


    return true;

  }


  function removeDesignLayer(
    layerId: string,
  ): boolean {

    if (
      !designModel.layers.get(
        layerId,
      )
    ) {

      return false;

    }


    for (
      const model
      of modelRegistry
        .findByLayerId(
          layerId,
        )
    ) {

      modelRegistry
        .setModelLayerId(
          model.id,
          DEFAULT_DESIGN_LAYER_IDS
            .EXTERNAL_REFERENCES,
        );

    }


    const removed =
      designModel
        .removeDesignLayer(
          layerId,
          DEFAULT_DESIGN_LAYER_IDS
            .GEOMETRY,
        );


    if (
      removed
    ) {

      applyDesignLayerEffects();

    }


    return removed;

  }


  // ==========================================================
// CAMERA PROJECTION MODE
// ==========================================================

function getCameraProjectionMode():
  CameraProjectionMode {

  return (
    world.camera.projection.current
    === "Orthographic"
  )
    ? "ORTHOGRAPHIC"
    : "PERSPECTIVE";

}


// ==========================================================
// TOGGLE CAMERA PROJECTION
// ==========================================================

async function toggleCameraProjection():
  Promise<CameraProjectionMode> {

  // --------------------------------------------------------
  // Perspective <-> Orthographic
  //
  // IMPORTANTE:
  // projection.toggle() es async.
  // --------------------------------------------------------

  await world.camera.projection.toggle();

  // ProjectionManager cambia el boton central a ZOOM en ORTHO y DOLLY
  // en PERSPECTIVA. Recuperar la orbita CAD sin modificar la rueda-zoom.
  restoreCadMouseNavigationBindings(world.camera.controls);


  // --------------------------------------------------------
  // UPDATE FRAGMENTS WITH ACTIVE CAMERA
  // --------------------------------------------------------

  for (
    const [, model]
    of fragments.list
  ) {

    model.useCamera(
      world.camera.three,
    );

  }


  await fragments.core.update(
    true,
  );


  // --------------------------------------------------------
  // RETURN REAL CURRENT MODE
  // --------------------------------------------------------

  return getCameraProjectionMode();

}

// ==========================================================
// CAMERA FIT / RECOVERY
// ==========================================================

function getVisiblePhysicalBounds():
  THREE.Box3
  | null {

  const bounds =
    new THREE.Box3();


  let hasBounds =
    false;


  const includeObject =
    (
      object:
        THREE.Object3D,
    ):
      void => {

      if (
        !object.visible
      ) {

        return;

      }


      object.updateWorldMatrix(
        true,
        true,
      );


      const objectBounds =
        new THREE.Box3()
          .setFromObject(
            object,
            true,
          );


      if (
        objectBounds.isEmpty()
      ) {

        return;

      }


      const min =
        objectBounds.min;


      const max =
        objectBounds.max;


      if (
        !Number.isFinite(
          min.x,
        )
        || !Number.isFinite(
          min.y,
        )
        || !Number.isFinite(
          min.z,
        )
        || !Number.isFinite(
          max.x,
        )
        || !Number.isFinite(
          max.y,
        )
        || !Number.isFinite(
          max.z,
        )
      ) {

        return;

      }


      if (
        !hasBounds
      ) {

        bounds.copy(
          objectBounds,
        );


        hasBounds =
          true;


        return;

      }


      bounds.union(
        objectBounds,
      );

    };


  /*
   * PieceInstance / design geometry.
   */
  for (
    const object
    of designScene
      .getInstanceObjects()
  ) {

    includeObject(
      object,
    );

  }


  /*
   * IFC reference models.
   */
  for (
    const [, model]
    of fragments.list
  ) {

    includeObject(
      model.object,
    );

  }


  return hasBounds
    ? bounds
    : null;

}


async function fitCameraToVisibleGeometry():
  Promise<void> {

  const controls =
    world.camera.controls;


  const bounds =
    getVisiblePhysicalBounds();


  if (
    !bounds
  ) {

    await controls.setLookAt(
      6,
      6,
      6,
      0,
      0,
      0,
      true,
    );


    return;

  }


  const sphere =
    bounds.getBoundingSphere(
      new THREE.Sphere(),
    );


  const center =
    sphere.center;


  const radius =
    Math.max(
      sphere.radius,
      0.1,
    );


  const camera =
    world.camera.three;


  const forward =
    new THREE.Vector3();


  camera.getWorldDirection(
    forward,
  );


  if (
    forward.lengthSq()
    <= 1e-12
  ) {

    forward.set(
      -1,
      -1,
      -1,
    )
      .normalize();

  }
  else {

    forward.normalize();

  }


  let distance =
    Math.max(
      radius * 2.5,
      1,
    );


  if (
    camera
    instanceof THREE.PerspectiveCamera
  ) {

    const verticalFov =
      THREE.MathUtils.degToRad(
        camera.fov,
      );


    const horizontalFov =
      2
      * Math.atan(
          Math.tan(
            verticalFov / 2,
          )
          * Math.max(
              camera.aspect,
              1e-6,
            ),
        );


    const limitingFov =
      Math.max(
        0.01,
        Math.min(
          verticalFov,
          horizontalFov,
        ),
      );


    distance =
      Math.max(
        radius
        / Math.sin(
            limitingFov / 2,
          )
        * 1.2,
        radius * 1.5,
        1,
      );

  }


  const position =
    center
      .clone()
      .addScaledVector(
        forward,
        -distance,
      );


  await controls.setLookAt(
    position.x,
    position.y,
    position.z,
    center.x,
    center.y,
    center.z,
    true,
  );


  if (
    camera
    instanceof THREE.OrthographicCamera
  ) {

    const availableWidth =
      Math.abs(
        camera.right
        - camera.left,
      );


    const availableHeight =
      Math.abs(
        camera.top
        - camera.bottom,
      );


    const diameter =
      Math.max(
        radius * 2.4,
        0.2,
      );


    const desiredZoom =
      Math.max(
        0.01,
        Math.min(
          availableWidth
          / diameter,
          availableHeight
          / diameter,
        ),
      );


    await controls.zoomTo(
      desiredZoom,
      true,
    );

  }


  updateCloseCameraNavigation();

}


  // ==========================================================
// STANDARD CAMERA VIEW
// ==========================================================

async function setStandardView(
  view: StandardView,
): Promise<void> {

  const controls =
    world.camera.controls;


  const currentAzimuth =
    controls.azimuthAngle;

  switch (
    view
  ) {

    // ------------------------------------------------------
    // TOP / BOTTOM
    //
    // Mantienen el azimut actual.
    // Solo cambia la inclinación.
    // ------------------------------------------------------

    case "TOP":

      await controls.rotateTo(
        currentAzimuth,
        0,
        true,
      );

      break;


    case "BOTTOM":

      await controls.rotateTo(
        currentAzimuth,
        Math.PI,
        true,
      );

      break;


    // ------------------------------------------------------
    // ISO
    //
    // Mantiene también la dirección horizontal actual.
    // Solo coloca una inclinación isométrica.
    // ------------------------------------------------------

    case "ISO":

      /*
       * ISO también funciona como recuperación de cámara:
       * reorienta y luego encuadra toda la geometría física
       * visible para recuperar un target/distancia cómodos.
       */
      await controls.rotateTo(
        currentAzimuth,
        Math.acos(
          1 / Math.sqrt(3),
        ),
        true,
      );


      await fitCameraToVisibleGeometry();

      break;


    // ------------------------------------------------------
    // SIDE VIEWS
    // ------------------------------------------------------

    case "FRONT":

      await controls.rotateTo(
        0,
        Math.PI / 2,
        true,
      );

      break;


      case "RIGHT":

      await controls.rotateTo(
        -Math.PI / 2,
        Math.PI / 2,
        true,
      );
    
      break;


    case "BACK":

      await controls.rotateTo(
        Math.PI,
        Math.PI / 2,
        true,
      );

      break;


    case "LEFT":

      await controls.rotateTo(
        Math.PI / 2,
        Math.PI / 2,
        true,
      );

      break;

  }

}

// ==========================================================
// CAMERA ORIENTATION
// ==========================================================

function getCameraOrientation():
  CameraOrientation {

  return {

    azimuth:
      world.camera.controls
        .azimuthAngle,

    polar:
      world.camera.controls
        .polarAngle,

  };

}


// ==========================================================
// SUBSCRIBE CAMERA ORIENTATION
// ==========================================================

function subscribeCameraOrientation(
  callback:
    (
      orientation:
        CameraOrientation,
    ) => void,
): () => void {

  const handleUpdate =
    (): void => {

      callback(
        getCameraOrientation(),
      );

    };


  world.camera.controls.addEventListener(
    "update",
    handleUpdate,
  );


  // Estado inicial
  handleUpdate();


  return () => {

    world.camera.controls.removeEventListener(
      "update",
      handleUpdate,
    );

  };

}

// ==========================================================
// GET SELECTED PIECE INSTANCES
// ==========================================================

function getSelectedPieceInstanceIds():
  readonly string[] {

  return designSelection
    .getSelectedIds();

}


// ==========================================================
// SELECT PIECE INSTANCE
// ==========================================================

function selectPieceInstance(
  instanceId: string,
): void {

  cadPointSelection
    .clearSelection();


  designSelection
    .selectSingle(
      instanceId,
    );

}


// ==========================================================
// CLEAR PIECE SELECTION
// ==========================================================

function clearPieceSelection(): void {

  designSelection
    .clearSelection();

}


// ==========================================================
// SUBSCRIBE PIECE SELECTION
// ==========================================================

function subscribePieceSelection(
  listener:
    DesignSelectionListener,
): () => void {

  return designSelection
    .subscribe(
      listener,
    );

}


// ==========================================================
// UNIFIED CAD SELECTION
// ==========================================================

function getCadSelectionState():
  CadSelectionState {

  return cadSelection
    .getState();

}


function clearCadSelection():
  void {

  cadSelection
    .clearSelection();

}


function subscribeCadSelection(
  listener:
    CadUnifiedSelectionListener,
):
  () => void {

  return cadSelection
    .subscribe(
      listener,
    );

}


// ==========================================================
// CAD POINT SELECTION
// ==========================================================

function getSelectedCadPointIds():
  readonly string[] {

  return cadPointSelection
    .getSelectedIds();

}


function clearCadPointSelection():
  void {

  cadPointSelection
    .clearSelection();

}


function subscribeCadPointSelection(
  listener:
    CadPointSelectionListener,
): () => void {

  return cadPointSelection
    .subscribe(
      listener,
    );

}


// ==========================================================
// CAD LINE SELECTION
// ==========================================================

function getSelectedCadLineIds():
  readonly string[] {

  return cadLineSelection
    .getSelectedIds();

}


function clearCadLineSelection():
  void {

  cadLineSelection
    .clearSelection();

}


function subscribeCadLineSelection(
  listener:
    CadLineSelectionListener,
): () => void {

  return cadLineSelection
    .subscribe(
      listener,
    );

}


// ==========================================================
// ISOLATE SELECTED PIECES
// ==========================================================

function isolateSelectedPieceInstances():
  boolean {

  return designSelection
    .isolateSelection();

}


// ==========================================================
// EXIT PIECE ISOLATION
// ==========================================================

function exitPieceIsolation():
  boolean {

  return designSelection
    .exitIsolation();

}

// ==========================================================
// TRANSFORM MODE
// ==========================================================

function setDesignTransformMode(
  mode:
    DesignTransformMode,
): void {

  designTransform.setMode(
    mode,
  );

}


// ==========================================================
// TRANSFORM SPACE
// ==========================================================

function setDesignTransformSpace(
  space:
    "world"
    | "local",
): void {

  designTransform.setSpace(
    space,
  );

}

// ==========================================================
// CAD COMMANDS
// ==========================================================

function startPointCommand():
  boolean {

  pieceOriginEdit.cancel();


  cadWindowSelection.cancel();


  cadWorkPlaneEdit.cancel();


  cadNumericInput.hide();


  const started =
    cadCommandManager
      .start(
        pointCommand,
      );


  if (
    started
  ) {

    cadNumericInput.showPoint();

  }


  return started;

}


function startLineCommand():
  boolean {

  pieceOriginEdit.cancel();


  cadWindowSelection.cancel();


  cadWorkPlaneEdit.cancel();


  cadNumericInput.hide();


  const started =
    cadCommandManager
      .start(
        lineCommand,
      );


  if (
    started
  ) {

    cadNumericInput.showLine();

  }


  return started;

}


function startMoveCommand():
  boolean {

  pieceOriginEdit.cancel();


  cadWindowSelection.cancel();


  cadWorkPlaneEdit.cancel();


  const selectedLineCount =
    cadLineSelection
      .getSelectedIds()
      .length;


  const selectedPointCount =
    cadPointSelection
      .getSelectedIds()
      .length;


  const selectedPieceCount =
    designSelection
      .getSelectedIds()
      .length;


  const selectedTypeCount =
    Number(
      selectedLineCount > 0,
    )
    + Number(
        selectedPointCount > 0,
      )
    + Number(
        selectedPieceCount > 0,
      );


  return selectedTypeCount > 1
    ? cadCommandManager
        .start(
          moveMixedSelectionCommand,
        )
    : selectedLineCount > 0
      ? cadCommandManager
          .start(
            moveCadLineCommand,
          )
    : selectedPointCount > 0
      ? cadCommandManager
          .start(
            moveCadPointCommand,
          )
      : cadCommandManager
          .start(
            moveCommand,
          );

}


function startRotateCommand():
  boolean {

  pieceOriginEdit.cancel();


  cadWindowSelection.cancel();


  cadWorkPlaneEdit.cancel();


  if (
    cadPointSelection
      .getSelectedIds()
      .length > 0
    || cadLineSelection
      .getSelectedIds()
      .length > 0
  ) {

    return false;

  }


  return cadCommandManager
    .start(
      rotateCommand,
    );

}


function deleteSelectedPieceInstances():
  boolean {

  if (
    cadCommandManager
      .hasActiveCommand
  ) {

    cadCommandManager
      .cancelActive();


    cadNumericInput.hide();

  }


  const selectedLineCount =
    cadLineSelection
      .getSelectedIds()
      .length;


  const selectedPointCount =
    cadPointSelection
      .getSelectedIds()
      .length;


  const selectedPieceCount =
    designSelection
      .getSelectedIds()
      .length;


  const selectedTypeCount =
    Number(
      selectedLineCount > 0,
    )
    + Number(
        selectedPointCount > 0,
      )
    + Number(
        selectedPieceCount > 0,
      );


  if (
    selectedTypeCount > 1
  ) {

    return deleteMixedSelectionCommand
      .execute();

  }


  if (
    selectedLineCount > 0
  ) {

    return deleteCadLineCommand
      .execute();

  }


  if (
    selectedPointCount > 0
  ) {

    return deleteCadPointCommand
      .execute();

  }


  return deleteCommand.execute();

}


function deleteCadSelection():
  boolean {

  return deleteSelectedPieceInstances();

}


function cancelActiveCadCommand():
  void {

  cadCommandManager
    .cancelActive();


  cadNumericInput.hide();

}


function undoCadAction():
  boolean {

  if (
    cadCommandManager
      .hasActiveCommand
  ) {

    cadCommandManager
      .cancelActive();


    cadNumericInput.hide();

  }


  return cadHistory.undo();

}


function redoCadAction():
  boolean {

  if (
    cadCommandManager
      .hasActiveCommand
  ) {

    cadCommandManager
      .cancelActive();


    cadNumericInput.hide();

  }


  return cadHistory.redo();

}


// ==========================================================
// DISPOSE
// ==========================================================

function dispose(): void {

  window.removeEventListener(
    "keydown",
    handleCadKeyDown,
  );


  world.camera.controls.removeEventListener(
    "update",
    updateCloseCameraNavigation,
  );


  canvas.removeEventListener(
    "dblclick",
    handleCadDoubleClick,
  );

  unsubscribeCadSelection();


  unsubscribeCadPointSelection();


  unsubscribeCadLineSelection();


  unsubscribeCadUnifiedSelection();


  unsubscribePiecePreparationHelpers();


  unsubscribeDesignLayers();


  cadCommandManager.dispose();


  cadHistory.clear();


  cadNumericInput.dispose();


  // --------------------------------------------------------
  // CAMERA EVENT
  // --------------------------------------------------------

  world.camera.controls.removeEventListener(
    "update",
    updateFragments,
  );


  // --------------------------------------------------------
  // REFERENCE MODELS
  // --------------------------------------------------------

  modelRegistry.clearModels();


  // --------------------------------------------------------
  // INTERACTION CONTROLLERS
  // --------------------------------------------------------

  designPlacement.dispose();

  designTransform.dispose();

  cadEntityRotate.dispose();
  designRotate.dispose();


  cadPointMove.dispose();


  cadLineMove.dispose();


  cadMixedMove.dispose();


  cadWorkPlaneEdit.dispose();


  pieceOriginEdit.dispose();


  cadPointPlacement.dispose();


  cadLinePlacement.dispose();


  designSnap.dispose();


  cadWindowSelection.dispose();


  cadSelection.dispose();


  piecePreparation.dispose();


  cadLineSelection.dispose();


  cadPointSelection.dispose();


  designSelection.dispose();


  cadWorkPlane.dispose();


  // --------------------------------------------------------
  // DESIGN VISUALS
  // --------------------------------------------------------

  cadPointScene.dispose();


  cadLineScene.dispose();


  pieceDefinitionHelpers.dispose();


  designScene.dispose();


  // --------------------------------------------------------
  // DESIGN DOMAIN
  // --------------------------------------------------------

  designModel.clear();


  // --------------------------------------------------------
  // THAT OPEN
  // --------------------------------------------------------

  components.dispose();


  // --------------------------------------------------------
  // REMOVE ONLY THIS BIM CORE CANVAS
  // --------------------------------------------------------

  if (
    canvas.parentElement
    === container
  ) {

    canvas.remove();

  }

}


  // ==========================================================
  // PUBLIC API
  // ==========================================================

  return {

    // --------------------------------------------------------
    // FRAMELOGIC DOMAIN
    // --------------------------------------------------------

    designModel,


    // --------------------------------------------------------
    // FRAMELOGIC DESIGN VISUAL LAYER
    // --------------------------------------------------------

    designScene,

    cadPointScene,

    cadLineScene,


    // --------------------------------------------------------
    // INFRASTRUCTURE
    // --------------------------------------------------------

    components,

    world,

    helpers,


    // --------------------------------------------------------
    // BIM
    // --------------------------------------------------------

    fragments,

    ifcLoader,


    // --------------------------------------------------------
    // REFERENCE MODELS
    // --------------------------------------------------------

    loadIfcFile,

    getLoadedModels,

    getModel,

    setModelVisible,

    removeModel,

    clearModels,

    setReferenceModelLayer,


    // --------------------------------------------------------
    // PIECE DEFINITION PREPARATION
    // --------------------------------------------------------

    piecePreparation,

    pieceDefinitionHelpers,

    getPieceDefinitionPreparationState,

    startPieceDefinitionPreparation,

    stopPieceDefinitionPreparation,

    setPreparedPieceOriginFromSelectedPoint,

    pieceOriginEdit,

    getPieceDefinitionOriginEditState,

    startPreparedPieceOriginSnapEdit,

    cancelPreparedPieceOriginSnapEdit,

    subscribePieceDefinitionOriginEdit,

    addPreparedPieceSnapsFromSelection,

    addPreparedPieceAxesFromSelection,

    subscribePieceDefinitionPreparation,


    // --------------------------------------------------------
    // CAD WORKPLANE
    // --------------------------------------------------------

    cadWorkPlane,

    getCadWorkPlaneState,

    setCadWorkPlaneMode,

    cycleCadWorkPlane,

    subscribeCadWorkPlane,

    cadWorkPlaneEdit,

    getCadWorkPlaneEditState,

    startCadWorkPlaneOriginEdit,

    startCadWorkPlaneThreePointEdit,

    cancelCadWorkPlaneEdit,

    subscribeCadWorkPlaneEdit,


    // --------------------------------------------------------
    // DESIGN LAYERS
    // --------------------------------------------------------

    getDesignLayers,

    getActiveDesignLayerId,

    createDesignLayer,

    updateDesignLayer,

    setActiveDesignLayer,

    removeDesignLayer,

    subscribeDesignLayers,

    assignSelectedPieceInstancesToLayer,

assignCadSelectionToLayer,


    // --------------------------------------------------------
    // DESIGN PIECES
    // --------------------------------------------------------

    importDesignPieceIfc,

    createDesignPieceInstance,

    updateDesignPieceInstanceTransform,

    removeDesignPieceInstance,

    startDesignPiecePlacement,

    cancelDesignPiecePlacement,

    // Camera
setStandardView,

setCardinalDirection,

getCameraOrientation,

subscribeCameraOrientation,

getCameraProjectionMode,
toggleCameraProjection,

// Snap
designSnap,

cadPointPlacement,

cadLinePlacement,

// Selection
designSelection,

cadPointSelection,

cadLineSelection,

cadSelection,

getCadSelectionState,

clearCadSelection,

subscribeCadSelection,

cadWindowSelection,

getSelectedCadLineIds,

clearCadLineSelection,

subscribeCadLineSelection,

getSelectedCadPointIds,

clearCadPointSelection,

subscribeCadPointSelection,

getSelectedPieceInstanceIds,

selectPieceInstance,

clearPieceSelection,

subscribePieceSelection,

isolateSelectedPieceInstances,

exitPieceIsolation,

// CAD commands
cadCommandManager,

startPointCommand,

startLineCommand,

startMoveCommand,

startRotateCommand,

deleteSelectedPieceInstances,

deleteCadSelection,

cancelActiveCadCommand,

undoCadAction,

redoCadAction,

cadHistory,

// Transform
designTransform,

cadPointMove,

cadLineMove,

cadMixedMove,

designRotate,

cadEntityRotate,

showCadRotateInput: (axis: "X" | "Y" | "Z" = "Z") =>
  cadNumericInput.showRotate(axis, false),

hideCadRotateInput: () => cadNumericInput.hide(),

setDesignTransformMode,

setDesignTransformSpace,

    // --------------------------------------------------------
    // LIFECYCLE
    // --------------------------------------------------------

    dispose,

  };

}


// ============================================================
// PUBLIC INSTANCE TYPE
// ============================================================

export type BimCoreInstance =
  Awaited<
    ReturnType<
      typeof createBimCore
    >
  >;

  export type CardinalDirection =
  | "N"
  | "E"
  | "S"
  | "W";

  export type CameraProjectionMode =
  | "PERSPECTIVE"
  | "ORTHOGRAPHIC";