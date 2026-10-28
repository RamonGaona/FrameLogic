import * as THREE from "three";

import {
  toCreasedNormals,
} from "three/addons/utils/BufferGeometryUtils.js";


/**
 * Prepara la geometría visual de una PieceDefinition para un visor CAD/BIM.
 *
 * El objetivo no es modificar la forma real del IFC, sino recalcular normales
 * de sombreado de forma coherente:
 *
 * - triángulos coplanares se ven como una sola cara plana;
 * - facetas consecutivas de una curva se suavizan visualmente;
 * - aristas mecánicas marcadas se conservan duras.
 *
 * 35° es suficientemente alto para suavizar una circunferencia IFC de
 * 12 segmentos (30° entre facetas), pero mantiene una esquina de 90°.
 */
export function preparePiecePrototypeGeometry(
  prototype:
    THREE.Object3D,
): void {

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

        preparedGeometry =
          toCreasedNormals(
            sourceGeometry.clone(),
            creaseAngle,
          );


        preparedGeometry.computeBoundingBox();

        preparedGeometry.computeBoundingSphere();


        preparedBySource.set(
          sourceGeometry,
          preparedGeometry,
        );


        replacedSources.add(
          sourceGeometry,
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

}
