import * as THREE from "three";
import * as OBC from "@thatopen/components";

import {
  addSceneHelpers,
} from "../helpers/addSceneHelpers";

import {
  ModelRegistry,
} from "../models/ModelRegistry";

import {
  DesignModel,
} from "@framelogic/domain";


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
  // MODEL REGISTRY
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

        // FrameLogic conserva el origen
        // definido en el propio IFC.
        COORDINATE_TO_ORIGIN:
          false,

      },

    });


  // ==========================================================
  // LOAD IFC FILE
  // ==========================================================

  async function loadIfcFile(
    file: File,
  ) {

    await ifcReady;


    const arrayBuffer =
      await file.arrayBuffer();


    const data =
      new Uint8Array(
        arrayBuffer,
      );


    const model =
      await ifcLoader.load(
        data,
        false,
        file.name,
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
    // REGISTER IN FRAMELOGIC
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


            fragments.core.update(
              true,
            );

          },

      });


    // --------------------------------------------------------
    // UPDATE FRAGMENTS
    // --------------------------------------------------------

    await fragments.core.update(
      true,
    );


    // --------------------------------------------------------
    // IMPORTANT:
    // We return our FrameLogic model information,
    // not the internal That Open model.
    // --------------------------------------------------------

    return loadedModel;

  }


  // ==========================================================
  // GET LOADED MODELS
  // ==========================================================

  function getLoadedModels() {

    return modelRegistry
      .getLoadedModels();

  }


  // ==========================================================
  // GET MODEL
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
  // MODEL VISIBILITY
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
  // REMOVE MODEL
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
  // CLEAR MODELS
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
    // FRAMELOGIC MODELS
    // --------------------------------------------------------

    modelRegistry.clearModels();

    designModel.clear();

    // --------------------------------------------------------
    // THAT OPEN
    // --------------------------------------------------------

    components.dispose();


    // --------------------------------------------------------
    // REMOVE ONLY THIS BIM CORE CANVAS
    //
    // Do NOT use:
    //
    // container.replaceChildren()
    //
    // because React StrictMode can initialize two instances
    // during development.
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

    // FrameLogic domain
    designModel,
  
    // Infrastructure
    components,
    world,
    helpers,
  
    // BIM
    fragments,
    ifcLoader,
  
    // Reference models
    loadIfcFile,
    getLoadedModels,
    getModel,
    setModelVisible,
    removeModel,
    clearModels,
  
    // Lifecycle
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