import * as THREE from "three";

import {
  toCreasedNormals,
} from "three/addons/utils/BufferGeometryUtils.js";


const MAX_CREASED_NORMAL_VERTICES =
  200_000;


/**
 * Prepara la geometría visual de una PieceDefinition para un visor CAD/BIM.
 *
 * Para mallas pequeñas conservamos el suavizado por crease. En mallas grandes
 * importadas por OCCT reutilizamos las normales existentes para evitar clonar
 * y desindexar cientos de miles de vértices durante la apertura. Esto solo
 * afecta sombreado visual: el STEP/B-Rep exacto permanece intacto.
 */
export function preparePiecePrototypeGeometry(
  prototype:
    THREE.Object3D,
): void {

  const startedAt =
    typeof performance !== "undefined"
      ? performance.now()
      : Date.now();

  const creaseAngle =
    THREE.MathUtils.degToRad(
      35,
    );


  const preparedBySource =
    new Map<
      THREE.BufferGeometry,
      THREE.BufferGeometry
    >();


  const replacedSources =
    new Set<
      THREE.BufferGeometry
    >();


  let reusedLargeGeometryCount =
    0;


  prototype.traverse(
    (
      child,
    ) => {

      if (
        !(child instanceof THREE.Mesh)
      ) {

        return;

      }


      const sourceGeometry =
        child.geometry;


      let preparedGeometry =
        preparedBySource.get(
          sourceGeometry,
        );


      if (
        !preparedGeometry
      ) {

        const position =
          sourceGeometry.getAttribute(
            "position",
          );

        const normal =
          sourceGeometry.getAttribute(
            "normal",
          );

        const canReuseImportedNormals =
          Boolean(
            normal
            && position
            && position.count
              >= MAX_CREASED_NORMAL_VERTICES,
          );


        if (
          canReuseImportedNormals
        ) {

          preparedGeometry =
            sourceGeometry;

          reusedLargeGeometryCount +=
            1;

        }
        else {

          preparedGeometry =
            toCreasedNormals(
              sourceGeometry.clone(),
              creaseAngle,
            );

          replacedSources.add(
            sourceGeometry,
          );

        }


        if (
          preparedGeometry.boundingBox
          === null
        ) {

          preparedGeometry.computeBoundingBox();

        }


        if (
          preparedGeometry.boundingSphere
          === null
        ) {

          preparedGeometry.computeBoundingSphere();

        }


        preparedBySource.set(
          sourceGeometry,
          preparedGeometry,
        );

      }


      child.geometry =
        preparedGeometry;

    },
  );


  for (
    const sourceGeometry
    of replacedSources
  ) {

    sourceGeometry.dispose();

  }


  const elapsed =
    (
      typeof performance !== "undefined"
        ? performance.now()
        : Date.now()
    )
    - startedAt;


  if (
    elapsed >= 25
    || reusedLargeGeometryCount > 0
  ) {

    console.debug(
      "[FrameLogic][Geometry] prototype preparation",
      {
        ms:
          Math.round(
            elapsed * 10,
          ) / 10,
        geometries:
          preparedBySource.size,
        reusedLargeGeometryCount,
      },
    );

  }

}
