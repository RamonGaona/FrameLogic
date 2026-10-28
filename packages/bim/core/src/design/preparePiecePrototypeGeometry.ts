import * as THREE from "three";

import {
  toCreasedNormals,
} from "three/addons/utils/BufferGeometryUtils.js";


const MAX_TOTAL_CREASED_VERTICES =
  100_000;


/**
 * Prepara la geometría visual de una PieceDefinition para un visor CAD/BIM.
 *
 * En piezas pequeñas mantenemos el suavizado por crease que da una lectura
 * CAD limpia. En piezas grandes evitamos toCreasedNormals(), porque clona y
 * desindexa geometría de forma síncrona y puede bloquear el hilo principal.
 *
 * La ruta rápida conserva las normales importadas. Si una geometría grande
 * no trae normales, se clona solo esa geometría y se calculan normales de
 * vértice estándar. La geometría STEP/B-Rep exacta no se modifica.
 */
export function preparePiecePrototypeGeometry(
  prototype:
    THREE.Object3D,
): void {

  const creaseAngle =
    THREE.MathUtils.degToRad(
      35,
    );


  const sourceGeometries =
    new Set<
      THREE.BufferGeometry
    >();


  prototype.traverse(
    (
      child,
    ) => {

      if (
        child instanceof THREE.Mesh
        && child.geometry
          instanceof THREE.BufferGeometry
      ) {

        sourceGeometries.add(
          child.geometry,
        );

      }

    },
  );


  let totalVertexCount =
    0;


  for (
    const geometry
    of sourceGeometries
  ) {

    totalVertexCount +=
      geometry.getAttribute(
        "position",
      )?.count
      ?? 0;

  }


  const useFastPath =
    totalVertexCount
    > MAX_TOTAL_CREASED_VERTICES;


  const preparedBySource =
    new Map<
      THREE.BufferGeometry,
      THREE.BufferGeometry
    >();


  const replacedSources =
    new Set<
      THREE.BufferGeometry
    >();


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

        if (
          useFastPath
        ) {

          if (
            sourceGeometry.getAttribute(
              "normal",
            )
          ) {

            preparedGeometry =
              sourceGeometry;

          }
          else {

            preparedGeometry =
              sourceGeometry.clone();

            preparedGeometry
              .computeVertexNormals();

            replacedSources.add(
              sourceGeometry,
            );

          }

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

          preparedGeometry
            .computeBoundingBox();

        }


        if (
          preparedGeometry.boundingSphere
          === null
        ) {

          preparedGeometry
            .computeBoundingSphere();

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


  if (
    useFastPath
  ) {

    console.debug(
      "[FrameLogic][Geometry] fast prototype preparation",
      {
        vertices:
          totalVertexCount,
        geometries:
          sourceGeometries.size,
      },
    );

  }

}
