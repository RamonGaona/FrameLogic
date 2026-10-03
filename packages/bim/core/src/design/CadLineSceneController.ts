import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";


export class CadLineSceneController {

  private readonly scene:
    THREE.Scene;


  private readonly designModel:
    DesignModel;


  private readonly lineObjects =
    new Map<
      string,
      THREE.Line
    >();


  private readonly selectedIds =
    new Set<
      string
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


  getLineObject(
    id: string,
  ):
    THREE.Line
    | undefined {

    return this.lineObjects.get(
      id,
    );

  }


  getLineObjects():
    THREE.Line[] {

    return Array.from(
      this.lineObjects.values(),
    );

  }


  getLineEntries():
    Array<
      [
        string,
        THREE.Line,
      ]
    > {

    return Array.from(
      this.lineObjects.entries(),
    );

  }


  setSelectedIds(
    ids:
      readonly string[],
  ):
    void {

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

    const lines =
      this.designModel
        .cadLines
        .getAll();


    const activeIds =
      new Set(
        lines.map(
          (
            line,
          ) =>
            line.id,
        ),
      );


    for (
      const [
        id,
        object,
      ]
      of this.lineObjects
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


      this.lineObjects.delete(
        id,
      );

    }


    for (
      const line
      of lines
    ) {

      let object =
        this.lineObjects.get(
          line.id,
        );


      if (
        !object
      ) {

        const geometry =
          new THREE.BufferGeometry();


        const material =
          new THREE.LineBasicMaterial();


        object =
          new THREE.Line(
            geometry,
            material,
          );


        object.name =
          `CadLine:${line.id}`;


        object.userData = {
          frameLogic: {
            entityType:
              "CadLine",
            lineId:
              line.id,
          },
        };


        this.scene.add(
          object,
        );


        this.lineObjects.set(
          line.id,
          object,
        );

      }


      object.geometry.setFromPoints(
        [
          new THREE.Vector3(
            line.start.x,
            line.start.y,
            line.start.z,
          ),
          new THREE.Vector3(
            line.end.x,
            line.end.y,
            line.end.z,
          ),
        ],
      );


      object.geometry.computeBoundingSphere();


      const layer =
        this.designModel
          .layers
          .get(
            line.layerId,
          );


      object.visible =
        layer?.visible
        ?? true;


      object.updateMatrixWorld(
        true,
      );

    }


    this.updateSelectionAppearance();

  }


  private updateSelectionAppearance():
    void {

    for (
      const [
        id,
        object,
      ]
      of this.lineObjects
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
          instanceof THREE.LineBasicMaterial
        ) {

          material.color.setHex(
            this.selectedIds.has(
              id,
            )
              ? 0xffc533
              : 0xe5e7eb,
          );

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
      of this.lineObjects.values()
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


    this.lineObjects.clear();

  }

}
