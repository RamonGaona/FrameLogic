import * as THREE from "three";
import * as OBC from "@thatopen/components";

import {
  addSceneHelpers,
} from "../helpers/addSceneHelpers";


export function createBimCore(
  container: HTMLElement,
) {

  // ====================================================
  // COMPONENTS
  // ====================================================

  const components =
    new OBC.Components();


  // ====================================================
  // WORLDS
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


  // ====================================================
  // THREE CAMERA
  // ====================================================

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
  // INITIALIZE
  // ====================================================

  components.init();


  // ====================================================
  // INITIAL CAMERA POSITION
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
  // DISPOSE
  // ====================================================

  function dispose(): void {

    components.dispose();

    container.replaceChildren();
  }


  // ====================================================
  // PUBLIC API
  // ====================================================

  return {
    components,
    world,
    helpers,
    dispose,
  };
}


export type BimCoreInstance =
  ReturnType<
    typeof createBimCore
  >;