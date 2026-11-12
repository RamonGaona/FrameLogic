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


  private readonly selectedIds =
    new Set<
      string
    >();


  private readonly hiddenIds =
    new Set<string>();


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


  getPointObject(
    id: string,
  ):
    THREE.Points
    | undefined {

    return this.pointObjects.get(
      id,
    );

  }


  getPointObjects():
    THREE.Points[] {

    return Array.from(
      this.pointObjects.values(),
    );

  }


  isHidden(id: string): boolean {
    return this.hiddenIds.has(id);
  }


  setHidden(id: string, hidden: boolean): void {
    if (hidden) this.hiddenIds.add(id);
    else this.hiddenIds.delete(id);
    this.applyVisibility(id);
  }


  setSelectedIds(
    ids:
      readonly string[],
  ): void {

    this.selectedIds.clear();


    for (
      const id
      of ids
    ) {

      this.selectedIds.add(
        id,
      );

    }


    this.updateSelectionAppearance();

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
      this.hiddenIds.delete(id);

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


      this.applyVisibility(point.id);


      object.updateMatrix();
      object.updateMatrixWorld(
        true,
      );

    }


    this.updateSelectionAppearance();

  }


  private applyVisibility(id: string): void {
    const object = this.pointObjects.get(id);
    const point = this.designModel.cadPoints.get(id);
    if (!object || !point) return;
    const layer = this.designModel.layers.get(point.layerId);
    object.visible = (layer?.visible ?? true) && !this.hiddenIds.has(id);
  }


  private updateSelectionAppearance():
    void {

    for (
      const [
        id,
        object,
      ]
      of this.pointObjects
    ) {

      const materials =
        Array.isArray(
          object.material,
        )
          ? object.material
          : [
              object.material,
            ];


      for (
        const material
        of materials
      ) {

        if (
          material
          instanceof THREE.PointsMaterial
        ) {

          const point = this.designModel.cadPoints.get(id);
          const layerColor = point
            ? this.designModel.layers.get(point.layerId)?.color
            : undefined;
          material.color.set(
            this.selectedIds.has(id) ? "#ffc533"
              : layerColor ?? "#e5e7eb",
          );
          material.size =
            this.selectedIds.has(id)
              ? 14
              : 8;

          material.needsUpdate =
            true;

        }

      }

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
    this.hiddenIds.clear();

  }

}
