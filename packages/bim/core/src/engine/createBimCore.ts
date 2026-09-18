import * as THREE from "three";
import * as OBC from "@thatopen/components";


import {
  addSceneHelpers,
} from "../helpers/addSceneHelpers";


export async function createBimCore(
  container: HTMLElement,
) {

  // ====================================================
  // COMPONENTS
  // ====================================================

  const components =
    new OBC.Components();


  // ====================================================
  // WORLD
  // ====================================================

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


  // ====================================================
  // SCENE
  // ====================================================

  world.scene =
    new OBC.SimpleScene(
      components,
    );


  world.scene.setup();


  // ====================================================
  // RENDERER
  // ====================================================

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


  // ====================================================
  // CAMERA
  // ====================================================

  world.camera =
    new OBC.SimpleCamera(
      components,
    );


  world.camera.controls.dollySpeed =
    0.5;


  world.camera.controls.minDistance =
    0.02;


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


  // ====================================================
  // INITIALIZE COMPONENTS
  // ====================================================

  components.init();


  // ====================================================
  // INITIAL CAMERA
  // ====================================================

  world.camera.controls.setLookAt(
    6,
    6,
    6,

    0,
    0,
    0,
  );


  // ====================================================
  // HELPERS
  // ====================================================

  const helpers =
    addSceneHelpers(
      world.scene.three,
    );


  // ====================================================
  // FRAGMENTS MANAGER
  // ====================================================

  const fragments =
  components.get(
    OBC.FragmentsManager,
  );


const workerUrl =
  await OBC.FragmentsManager.getWorker();


fragments.init(
  workerUrl,
);


  // ====================================================
  // UPDATE FRAGMENTS WHEN CAMERA MOVES
  // ====================================================

  const updateFragments =
    () => {

      fragments.core.update();

    };


  world.camera.controls.addEventListener(
    "update",
    updateFragments,
  );


  // ====================================================
  // CAMERA CHANGE
  // ====================================================

  world.onCameraChanged.add(
    (camera) => {

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


  // ====================================================
  // IFC LOADER
  // ====================================================

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

        // Las piezas de FrameLogic deben conservar
        // el origen definido en el propio IFC.
        COORDINATE_TO_ORIGIN:
          false,

      },

    });


  // ====================================================
  // LOAD IFC FILE
  // ====================================================

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


    model.useCamera(
      world.camera.three,
    );


    world.scene.three.add(
      model.object,
    );


    await fragments.core.update(
      true,
    );


    return model;
  }


  // ====================================================
  // DISPOSE
  // ====================================================

  function dispose(): void {

    world.camera.controls.removeEventListener(
      "update",
      updateFragments,
    );
  
  
    components.dispose();
  
  
    if (
      canvas.parentElement === container
    ) {
  
      canvas.remove();
  
    }
  }


  // ====================================================
  // PUBLIC BIM CORE API
  // ====================================================

  return {

    components,

    world,

    helpers,

    fragments,

    ifcLoader,

    loadIfcFile,

    dispose,

  };
}


export type BimCoreInstance =
  Awaited<
    ReturnType<
      typeof createBimCore
    >
  >;