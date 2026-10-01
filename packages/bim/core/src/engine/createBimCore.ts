import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

import {
  DesignPlacementController,
} from "../interaction/DesignPlacementController";

import type {
  DesignSurfaceHit,
} from "../interaction/DesignPlacementController";

import {
  DesignModel,
} from "@framelogic/domain";

import type {
  RegisterPieceInstanceInput,
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
  CadCommandManager,
} from "../commands/CadCommandManager";

import {
  MoveCommand,
} from "../commands/MoveCommand";

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


  // ==========================================================
  // RENDERER
  // ==========================================================

  world.renderer =
    new OBC.SimpleRenderer(
      components,
      container,
    );


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
    0.5;


  world.camera.controls.minDistance =
    0.02;


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
// DESIGN SELECTION
// ==========================================================

const designSelection =
  new DesignSelectionController(

    world.scene.three,

    canvas,

    () =>
      world.camera.three,

    designScene,

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

  (
    enabled,
  ) => {

    world.camera.controls.enabled =
      enabled;

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

  const unsubscribeCadSelection =
  designSelection.subscribe(
    (
      selectedIds,
    ) => {

      /*
       * Si desaparece la selección mientras
       * existe una orden CAD activa,
       * la orden también debe terminar.
       */
      if (
        selectedIds.length === 0
        && cadCommandManager.hasActiveCommand
      ) {

        cadCommandManager.cancelActive();

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
     * No capturamos M/Escape mientras el usuario
     * está escribiendo en un input.
     */

    if (
      isEditableKeyboardTarget(
        event.target,
      )
    ) {

      return;

    }


    // ------------------------------------------------------
    // ESCAPE
    // ------------------------------------------------------

    if (
      event.key === "Escape"
    ) {

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


        return;

      }


      /*
       * Segundo Escape:
       *
       * si no existe ningún comando,
       * limpia la selección.
       */

      if (
        designSelection
          .getSelectedIds()
          .length > 0
      ) {

        event.preventDefault();


        event.stopPropagation();


        designSelection
          .clearSelection();

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

      const started =
        cadCommandManager.start(
          moveCommand,
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

        name:
          file.name,

        source:
          "IFC",

        role:
          "REFERENCE",

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

  // Mientras colocamos una pieza, no queremos
  // que el mismo clic seleccione objetos existentes.

  designSelection.setEnabled(
    false,
  );


  try {

    return await designPlacement
      .startPlacement(
        definitionId,
      );

  }
  finally {

    designSelection.setEnabled(
      true,
    );

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

      await controls.rotateTo(
        currentAzimuth,
        Math.acos(
          1 / Math.sqrt(3),
        ),
        true,
      );

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

function startMoveCommand():
  boolean {

  return cadCommandManager
    .start(
      moveCommand,
    );

}


function cancelActiveCadCommand():
  void {

  cadCommandManager
    .cancelActive();

}


// ==========================================================
// DISPOSE
// ==========================================================

function dispose(): void {

  window.removeEventListener(
    "keydown",
    handleCadKeyDown,
  );


  canvas.removeEventListener(
    "dblclick",
    handleCadDoubleClick,
  );

  unsubscribeCadSelection();


  cadCommandManager.dispose();


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


  designSelection.dispose();


  // --------------------------------------------------------
  // DESIGN VISUALS
  // --------------------------------------------------------

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

// Selection
designSelection,

getSelectedPieceInstanceIds,

selectPieceInstance,

clearPieceSelection,

subscribePieceSelection,

isolateSelectedPieceInstances,

exitPieceIsolation,

// CAD commands
cadCommandManager,

startMoveCommand,

cancelActiveCadCommand,

// Transform
designTransform,

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