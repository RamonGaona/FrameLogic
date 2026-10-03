import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";


export class CadPointSceneController {

  private readonly scene:
    THREE.Scene;


  private readonly designModel:
    DesignModel;


  private readonly pointObjects =
    new Map<
      string,
      THREE.Points
    >();


  constructor(
    scene:
      THREE.Scene,

    designModel:
      DesignModel,
  ) {

    this.scene =
      scene;


    this.designModel =
      designModel;

  }


  sync():
    void {

    const points =
      this.designModel
        .cadPoints
        .getAll();


    const activeIds =
      new Set(
        points.map(
          (
            point,
          ) =>
            point.id,
        ),
      );


    for (
      const [
        id,
        object,
      ]
      of this.pointObjects
    ) {

      if (
        activeIds.has(
          id,
        )
      ) {

        continue;

      }


      this.scene.remove(
        object,
      );


      object.geometry.dispose();


      if (
        Array.isArray(
          object.material,
        )
      ) {

        for (
          const material
          of object.material
        ) {

          material.dispose();

        }

      }
      else {

        object.material.dispose();

      }


      this.pointObjects.delete(
        id,
      );

    }


    for (
      const point
      of points
    ) {

      let object =
        this.pointObjects.get(
          point.id,
        );


      if (
        !object
      ) {

        const geometry =
          new THREE.BufferGeometry();


        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [
              0,
              0,
              0,
            ],
            3,
          ),
        );


        const material =
          new THREE.PointsMaterial({
            size:
              8,
            sizeAttenuation:
              false,
          });


        object =
          new THREE.Points(
            geometry,
            material,
          );


        object.name =
          `CadPoint:${point.id}`;


        object.userData = {
          frameLogic: {
            entityType:
              "CadPoint",
            pointId:
              point.id,
          },
        };


        this.scene.add(
          object,
        );


        this.pointObjects.set(
          point.id,
          object,
        );

      }


      object.position.set(
        point.position.x,
        point.position.y,
        point.position.z,
      );


      const layer =
        this.designModel
          .layers
          .get(
            point.layerId,
          );


      object.visible =
        layer?.visible
        ?? true;


      object.updateMatrix();
      object.updateMatrixWorld(
        true,
      );

    }

  }


  dispose():
    void {

    for (
      const object
      of this.pointObjects.values()
    ) {

      this.scene.remove(
        object,
      );


      object.geometry.dispose();


      if (
        Array.isArray(
          object.material,
        )
      ) {

        for (
          const material
          of object.material
        ) {

          material.dispose();

        }

      }
      else {

        object.material.dispose();

      }

    }


    this.pointObjects.clear();

  }

}
