import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

import {
  DesignPlacementController,
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
      OBC.SimpleCamera,
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
    new OBC.SimpleCamera(
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

function startDesignPiecePlacement(
  definitionId: string,
) {

  return designPlacement
    .startPlacement(
      definitionId,
    );

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
  // DISPOSE
  // ==========================================================

  function dispose(): void {

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

    designPlacement.dispose();

    // --------------------------------------------------------
    // DESIGN VISUALS
    //
    // Primero quitamos las instancias y liberamos
    // geometrías/materiales compartidos.
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
    // REMOVE ONLY THIS INSTANCE CANVAS
    //
    // No usamos container.replaceChildren()
    // porque React StrictMode puede crear temporalmente
    // más de una instancia durante desarrollo.
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