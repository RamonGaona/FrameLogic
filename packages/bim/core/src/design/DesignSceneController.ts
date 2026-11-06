import { setPieceVisualLevel, getPieceVisualGeometries, type PieceVisualLevel } from "./PieceVisualGeometry";
import { getStablePieceColorIdentity } from "./getStablePieceColorIdentity";
import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";
import { pieceDefinitionLocalViewMatrix } from "./pieceDefinitionLocalViewMatrix";

import {
  preparePiecePrototypeGeometry,
} from "./preparePiecePrototypeGeometry";


export class DesignSceneController {

  // ==========================================================
  // DEPENDENCIES
  // ==========================================================

  private readonly assetBounds = new Map<string, THREE.Box3>();

  /** Broad phase uses detail bounds, never the approximate silhouette. */
  getRaycastInstanceObjects(ray: THREE.Ray): THREE.Object3D[] {
    return this.getInstanceObjects().filter((object) => {
      const assetId = object.userData["frameLogic"]?.assetId as string | undefined;
      const bounds = assetId ? this.assetBounds.get(assetId) : undefined;
      if (!bounds) return true;
      object.updateMatrixWorld(true);
      return ray.intersectsBox(bounds.clone().applyMatrix4(object.matrixWorld));
    });
  }

  private visualLevel: PieceVisualLevel = "WORK";
  private isolatedPieceWorkspaceInstanceId: string | null = null;

  /**
   * Render-only local CAD frame. The saved PieceInstance transform must remain
   * unchanged while an isolated piece is being prepared.
   */
  setIsolatedPieceWorkspaceInstanceId(instanceId: string | null): void {
    if (this.isolatedPieceWorkspaceInstanceId === instanceId) return;
    this.isolatedPieceWorkspaceInstanceId = instanceId;
    this.sync();
  }
  private readonly detailInstances = new Set<string>();

  setVisualLevel(level: PieceVisualLevel, detailInstanceIds: readonly string[] = []): void {
    this.visualLevel = level;
    this.detailInstances.clear();
    for (const id of detailInstanceIds) this.detailInstances.add(id);
    this.sync();
  }

  private readonly scene:
    THREE.Scene;


  private readonly designModel:
    DesignModel;


  private visibilityFilter:
    (
      (
        instanceId: string,
      ) => boolean
    )
    | null =
      null;


  // ==========================================================
  // PIECE VISUAL STYLE
  //
  // Colores pastel de contraste medio pensados para un visor
  // CAD oscuro. MeshLambertMaterial conserva lectura de volumen
  // mediante iluminación difusa, pero evita el aspecto metálico,
  // los reflejos y los highlights especulares fuertes.
  // ==========================================================

  private readonly piecePastelPalette = [
    0x9db7c7, // azul grisáceo
    0xa8bfa3, // verde salvia
    0xc4b5d6, // lavanda
    0xd7c7a3, // arena
    0xd6a6ad, // rosa apagado
    0xa8c9bf, // menta
    0xd9b38c, // durazno suave
    0xa7bfd9, // celeste
  ] as const;


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
  // VISIBILITY FILTER
  // ==========================================================

  setVisibilityFilter(
    filter:
      (
        (
          instanceId: string,
        ) => boolean
      )
      | null,
  ): void {

    this.visibilityFilter =
      filter;


    this.sync();

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


    /*
     * Primero preparamos las normales de la geometría.
     * Esto elimina diagonales de triangulación visibles en caras planas
     * y suaviza visualmente facetas de curvas sin redondear aristas duras.
     */
    preparePiecePrototypeGeometry(
      prototype,
    );


    this.applyMattePastelStyle(
      assetId,
      prototype,
    );


    this.assetPrototypes.set(
      assetId,
      prototype,
    );
    prototype.updateMatrixWorld(true);
    const inverseRoot = prototype.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    prototype.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.computeBoundingBox();
      if (child.geometry.boundingBox) {
        bounds.union(child.geometry.boundingBox.clone().applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld),
        ));
      }
    });
    this.assetBounds.set(assetId, bounds);

  }


  // ==========================================================
  // MATTE PASTEL PIECE STYLE
  // ==========================================================

  private applyMattePastelStyle(
    assetId: string,
    prototype: THREE.Object3D,
  ): void {

    const color =
      this.getPastelColorForAsset(
        assetId,
      );


    prototype.traverse(
      (
        child,
      ) => {

        if (
          !(child instanceof THREE.Mesh)
        ) {

          return;

        }


        const createMatteMaterial =
          (
            source:
              THREE.Material,
          ):
            THREE.MeshLambertMaterial => {

            /*
             * Conservamos únicamente propiedades de render
             * necesarias para no romper geometría/transparencia.
             * Deliberadamente NO copiamos envMap, metalness,
             * roughness, specular ni clearcoat.
             */
            const material =
              new THREE.MeshLambertMaterial({
                color,
                side:
                  source.side,
                transparent:
                  source.transparent,
                opacity:
                  source.opacity,
                depthTest:
                  source.depthTest,
                depthWrite:
                  source.depthWrite,
                alphaTest:
                  source.alphaTest,
                vertexColors:
                  false,
                flatShading:
                  false,
              });


            material.name =
              `FrameLogicPastel:${assetId}`;


            material.polygonOffset =
              source.polygonOffset;


            material.polygonOffsetFactor =
              source.polygonOffsetFactor;


            material.polygonOffsetUnits =
              source.polygonOffsetUnits;


            return material;

          };


        if (
          Array.isArray(
            child.material,
          )
        ) {

          child.material =
            child.material.map(
              createMatteMaterial,
            );

        }
        else {

          child.material =
            createMatteMaterial(
              child.material,
            );

        }


        child.castShadow =
          false;


        child.receiveShadow =
          false;

      },
    );

  }


  private getPastelColorForAsset(
    assetId: string,
  ):
    number {

    let hash =
      2166136261;


    // Nunca derivar el color automático de un UUID generado
    // durante la importación: al reabrir un .flproject se crean
    // AssetDefinitions nuevas para la misma geometría.
    const stableIdentity = getStablePieceColorIdentity(
      this.designModel.assets.get(assetId),
      assetId,
    );

    for (
      let index = 0;
      index < stableIdentity.length;
      index += 1
    ) {

      hash ^=
        stableIdentity.charCodeAt(
          index,
        );


      hash =
        Math.imul(
          hash,
          16777619,
        );

    }


    const paletteIndex =
      (
        hash >>> 0
      )
      % this.piecePastelPalette.length;


    return this.piecePastelPalette[
      paletteIndex
    ]
      ?? this.piecePastelPalette[0];

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
  // GET VISIBLE INSTANCE OBJECTS
  // ==========================================================

  getInstanceObjects():
    THREE.Object3D[] {

    return Array.from(
      this.instanceObjects.values(),
    ).filter(
      (
        object,
      ) =>
        object.visible,
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
      // LAYER VISIBILITY
      // ------------------------------------------------------

      const layer =
        this.designModel
          .layers
          .get(
            instance.layerId,
          );


      object.visible =
        (
          layer?.visible
          ?? true
        )
        && (
          this.visibilityFilter
            ?.(
              instance.id,
            )
          ?? true
        );


      // ------------------------------------------------------
      // MATRIX
      // ------------------------------------------------------

      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          setPieceVisualLevel(child, this.detailInstances.has(instance.id) ? "DETAIL" : this.visualLevel);
        }
      });

      if (this.isolatedPieceWorkspaceInstanceId === instance.id) {
        object.matrixAutoUpdate = false;
        object.matrix.copy(pieceDefinitionLocalViewMatrix(definition.coordinateSystem));
      } else {
        object.matrixAutoUpdate = true;
        object.updateMatrix();
      }

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


          for (const geometry of getPieceVisualGeometries(child.geometry)) {
            geometries.add(geometry);
          }


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
    this.assetBounds.clear();

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
