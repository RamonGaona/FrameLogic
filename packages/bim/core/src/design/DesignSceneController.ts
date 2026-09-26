import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";


export class DesignSceneController {

  // ==========================================================
  // DEPENDENCIES
  // ==========================================================

  private readonly scene:
    THREE.Scene;


  private readonly designModel:
    DesignModel;


  // ==========================================================
  // VISUAL PROTOTYPES
  //
  // AssetDefinition.id -> THREE.Object3D reutilizable
  // ==========================================================

  private readonly assetPrototypes =
    new Map<
      string,
      THREE.Object3D
    >();


  // ==========================================================
  // INSTANCE OBJECTS
  //
  // PieceInstance.id -> THREE.Object3D visible
  // ==========================================================

  private readonly instanceObjects =
    new Map<
      string,
      THREE.Object3D
    >();


  // ==========================================================
  // CONSTRUCTOR
  // ==========================================================

  constructor(
    scene: THREE.Scene,
    designModel: DesignModel,
  ) {

    this.scene =
      scene;


    this.designModel =
      designModel;

  }


  // ==========================================================
  // REGISTER ASSET PROTOTYPE
  // ==========================================================

  registerAssetPrototype(
    assetId: string,
    prototype: THREE.Object3D,
  ): void {

    const current =
      this.assetPrototypes.get(
        assetId,
      );


    if (
      current
      && current !== prototype
    ) {

      throw new Error(
        `A visual prototype is already registered for asset "${assetId}".`,
      );

    }


    this.assetPrototypes.set(
      assetId,
      prototype,
    );

  }


  // ==========================================================
  // HAS ASSET PROTOTYPE
  // ==========================================================

  hasAssetPrototype(
    assetId: string,
  ): boolean {

    return this.assetPrototypes.has(
      assetId,
    );

  }


  // ==========================================================
  // GET ASSET PROTOTYPE
  // ==========================================================

  getAssetPrototype(
    assetId: string,
  ):
    THREE.Object3D
    | undefined {

    return this.assetPrototypes.get(
      assetId,
    );

  }


  // ==========================================================
  // GET INSTANCE OBJECT
  // ==========================================================

  getInstanceObject(
    instanceId: string,
  ):
    THREE.Object3D
    | undefined {

    return this.instanceObjects.get(
      instanceId,
    );

  }

  // ==========================================================
// GET ALL INSTANCE OBJECTS
// ==========================================================

getInstanceObjects():
THREE.Object3D[] {

return Array.from(
  this.instanceObjects.values(),
);

}


// ==========================================================
// GET INSTANCE ENTRIES
// ==========================================================

getInstanceEntries():
Array<
  [
    string,
    THREE.Object3D,
  ]
> {

return Array.from(
  this.instanceObjects.entries(),
);

}


  // ==========================================================
  // SYNC COMPLETE DESIGN MODEL
  // ==========================================================

  sync(): void {

    const instances =
      this.designModel
        .pieceInstances
        .getAll();


    const activeInstanceIds =
      new Set(
        instances.map(
          (
            instance,
          ) =>
            instance.id,
        ),
      );


    // --------------------------------------------------------
    // REMOVE OBJECTS WHOSE INSTANCE NO LONGER EXISTS
    // --------------------------------------------------------

    for (
      const [
        instanceId,
        object,
      ]
      of this.instanceObjects
    ) {

      if (
        activeInstanceIds.has(
          instanceId,
        )
      ) {

        continue;

      }


      this.scene.remove(
        object,
      );


      this.instanceObjects.delete(
        instanceId,
      );

    }


    // --------------------------------------------------------
    // CREATE / UPDATE INSTANCE OBJECTS
    // --------------------------------------------------------

    for (
      const instance
      of instances
    ) {

      const definition =
        this.designModel
          .pieceDefinitions
          .get(
            instance.definitionId,
          );


      if (
        !definition
      ) {

        throw new Error(
          `Cannot render piece instance "${instance.id}". Piece definition "${instance.definitionId}" does not exist.`,
        );

      }


      const assetId =
        definition.geometryAssetId;


      const prototype =
        this.assetPrototypes.get(
          assetId,
        );


      if (
        !prototype
      ) {

        // El dominio puede contener una instancia
        // aunque todavía no exista geometría visual.
        continue;

      }


      let object =
        this.instanceObjects.get(
          instance.id,
        );


      // ------------------------------------------------------
      // CREATE VISUAL INSTANCE
      //
      // clone(true) clona la jerarquía Object3D,
      // pero THREE mantiene compartidas las geometrías
      // y materiales de los Mesh.
      // ------------------------------------------------------

      if (
        !object
      ) {

        object =
          prototype.clone(
            true,
          );


        object.name =
          `PieceInstance:${instance.id}`;


        object.userData = {

          ...object.userData,

          frameLogic: {

            entityType:
              "PieceInstance",

            instanceId:
              instance.id,

            definitionId:
              instance.definitionId,

            assetId,

          },

        };


        this.scene.add(
          object,
        );


        this.instanceObjects.set(
          instance.id,
          object,
        );

      }


      // ------------------------------------------------------
      // POSITION
      // ------------------------------------------------------

      object.position.set(
        instance.transform.position.x,
        instance.transform.position.y,
        instance.transform.position.z,
      );


      // ------------------------------------------------------
      // ROTATION
      // ------------------------------------------------------

      object.rotation.set(
        instance.transform.rotation.x,
        instance.transform.rotation.y,
        instance.transform.rotation.z,
      );


      // ------------------------------------------------------
      // MATRIX
      // ------------------------------------------------------

      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }

  }


  // ==========================================================
  // REMOVE VISUAL INSTANCE
  // ==========================================================

  removeInstanceObject(
    instanceId: string,
  ): boolean {

    const object =
      this.instanceObjects.get(
        instanceId,
      );


    if (
      !object
    ) {

      return false;

    }


    this.scene.remove(
      object,
    );


    this.instanceObjects.delete(
      instanceId,
    );


    return true;

  }


  // ==========================================================
  // CLEAR INSTANCES
  // ==========================================================

  clearInstances(): void {

    for (
      const object
      of this.instanceObjects.values()
    ) {

      this.scene.remove(
        object,
      );

    }


    this.instanceObjects.clear();

  }


  // ==========================================================
  // CLEAR ASSET PROTOTYPES
  // ==========================================================

  clearAssetPrototypes(): void {

    const geometries =
      new Set<
        THREE.BufferGeometry
      >();


    const materials =
      new Set<
        THREE.Material
      >();


    // --------------------------------------------------------
    // COLLECT UNIQUE GPU RESOURCES
    // --------------------------------------------------------

    for (
      const prototype
      of this.assetPrototypes.values()
    ) {

      prototype.traverse(
        (
          child,
        ) => {

          if (
            !(child instanceof THREE.Mesh)
          ) {

            return;

          }


          geometries.add(
            child.geometry,
          );


          if (
            Array.isArray(
              child.material,
            )
          ) {

            for (
              const material
              of child.material
            ) {

              materials.add(
                material,
              );

            }

          }
          else {

            materials.add(
              child.material,
            );

          }

        },
      );

    }


    // --------------------------------------------------------
    // DISPOSE GEOMETRY
    // --------------------------------------------------------

    for (
      const geometry
      of geometries
    ) {

      geometry.dispose();

    }


    // --------------------------------------------------------
    // DISPOSE MATERIALS
    // --------------------------------------------------------

    for (
      const material
      of materials
    ) {

      material.dispose();

    }


    this.assetPrototypes.clear();

  }


  // ==========================================================
  // COUNTS
  // ==========================================================

  get instanceCount(): number {

    return this.instanceObjects.size;

  }


  get assetPrototypeCount(): number {

    return this.assetPrototypes.size;

  }


  // ==========================================================
  // DISPOSE
  // ==========================================================

  dispose(): void {

    // Las instancias comparten los recursos de sus prototipos.
    // Primero las sacamos de la escena.
    this.clearInstances();


    // Después sí liberamos las geometrías/materiales.
    this.clearAssetPrototypes();

  }

}