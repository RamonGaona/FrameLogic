import * as THREE from "three";


export interface SceneHelpers {
  grid: THREE.GridHelper;
  axes: THREE.AxesHelper;
}


export function addSceneHelpers(
  scene: THREE.Scene,
): SceneHelpers {

  const grid =
    new THREE.GridHelper(
      20,
      20,
    );


  const axes =
    new THREE.AxesHelper(
      5,
    );


  scene.add(
    grid,
    axes,
  );


  return {
    grid,
    axes,
  };
}