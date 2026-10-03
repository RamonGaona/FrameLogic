import {
    AssetRegistry,
  } from "../assets/AssetRegistry";
  
  import type {
    AssetDefinition,
  } from "../assets/AssetDefinition";
  
  import type {
    RegisterAssetInput,
  } from "../assets/AssetRegistry";
  
  
  import {
    PieceDefinitionRegistry,
  } from "../pieces/PieceDefinitionRegistry";
  
  import type {
    PieceDefinition,
  } from "../pieces/PieceDefinition";
  
  import type {
    RegisterPieceDefinitionInput,
  } from "../pieces/PieceDefinitionRegistry";
  
  
  import {
    PieceInstanceRegistry,
  } from "../pieces/PieceInstanceRegistry";
  
  import type {
    PieceInstance,
  } from "../pieces/PieceInstance";
  
  import type {
    RegisterPieceInstanceInput,
  } from "../pieces/PieceInstanceRegistry";
  
  
  import {
    AssemblyRegistry,
  } from "../assemblies/AssemblyRegistry";
  
  import type {
    Assembly,
  } from "../assemblies/Assembly";
  
  import type {
    RegisterAssemblyInput,
  } from "../assemblies/AssemblyRegistry";


  import {
    DesignLayerRegistry,
  } from "../layers/DesignLayerRegistry";


  import {
    CadPointRegistry,
  } from "../cad/CadPointRegistry";

  import type {
    CadPoint,
  } from "../cad/CadPoint";

  import type {
    RegisterCadPointInput,
  } from "../cad/CadPointRegistry";

  import {
    DEFAULT_DESIGN_LAYER_IDS,
  } from "../layers/DesignLayer";
  
  
  export class DesignModel {
  
    // ==========================================================
    // REGISTRIES
    // ==========================================================
  
    readonly assets =
      new AssetRegistry();
  
  
    readonly pieceDefinitions =
      new PieceDefinitionRegistry();
  
  
    readonly pieceInstances =
      new PieceInstanceRegistry();
  
  
    readonly assemblies =
      new AssemblyRegistry();


    readonly layers =
      new DesignLayerRegistry();


    readonly cadPoints =
      new CadPointRegistry();
  
  
    // ==========================================================
    // ASSETS
    // ==========================================================
  
    registerAsset(
      input: RegisterAssetInput,
    ): AssetDefinition {
  
      return this.assets.register(
        input,
      );
  
    }
  
  
    // ==========================================================
    // PIECE DEFINITIONS
    // ==========================================================
  
    registerPieceDefinition(
      input: RegisterPieceDefinitionInput,
    ): PieceDefinition {
  
      const asset =
        this.assets.get(
          input.geometryAssetId,
        );
  
  
      if (!asset) {
  
        throw new Error(
          `Cannot create piece definition. Asset "${input.geometryAssetId}" does not exist.`,
        );
  
      }
  
  
      return this
        .pieceDefinitions
        .register(
          input,
        );
  
    }
  
  
    // ==========================================================
    // PIECE INSTANCES
    // ==========================================================
  
    registerPieceInstance(
      input: RegisterPieceInstanceInput,
    ): PieceInstance {
  
      const definition =
        this.pieceDefinitions.get(
          input.definitionId,
        );
  
  
      if (!definition) {
  
        throw new Error(
          `Cannot create piece instance. Piece definition "${input.definitionId}" does not exist.`,
        );
  
      }
  
  
      const layerId =
        input.layerId
        ?? DEFAULT_DESIGN_LAYER_IDS
          .GEOMETRY;


      if (
        !this.layers.get(
          layerId,
        )
      ) {

        throw new Error(
          `Cannot create piece instance. Layer "${layerId}" does not exist.`,
        );

      }


      return this
        .pieceInstances
        .register({
          ...input,
          layerId,
        });
  
    }
  
  
    // ==========================================================
    // CAD POINTS
    // ==========================================================

    registerCadPoint(
      input:
        RegisterCadPointInput,
    ):
      CadPoint {

      const layerId =
        input.layerId
        ?? this.layers
          .activeLayerId;


      const layer =
        this.layers.get(
          layerId,
        );


      if (
        !layer
      ) {

        throw new Error(
          `Cannot create CAD point. Layer "${layerId}" does not exist.`,
        );

      }


      if (
        layer.locked
      ) {

        throw new Error(
          `Cannot create CAD point. Layer "${layer.name}" is locked.`,
        );

      }


      return this
        .cadPoints
        .register({
          ...input,
          layerId,
        });

    }


    removeCadPoint(
      id: string,
    ): boolean {

      return this
        .cadPoints
        .remove(
          id,
        );

    }


    // ==========================================================
    // ASSEMBLIES
    // ==========================================================
  
    registerAssembly(
      input: RegisterAssemblyInput,
    ): Assembly {
  
      const pieceInstanceIds =
        input.pieceInstanceIds
        ?? [];
  
  
      for (
        const pieceInstanceId
        of pieceInstanceIds
      ) {
  
        const instance =
          this.pieceInstances.get(
            pieceInstanceId,
          );
  
  
        if (!instance) {
  
          throw new Error(
            `Cannot create assembly. Piece instance "${pieceInstanceId}" does not exist.`,
          );
  
        }
  
      }
  
  
      const layerId =
        input.layerId
        ?? DEFAULT_DESIGN_LAYER_IDS
          .GEOMETRY;


      if (
        !this.layers.get(
          layerId,
        )
      ) {

        throw new Error(
          `Cannot create assembly. Layer "${layerId}" does not exist.`,
        );

      }


      return this
        .assemblies
        .register({
          ...input,
          layerId,
        });
  
    }
  
  
    // ==========================================================
    // UPDATE ASSEMBLY PIECES
    // ==========================================================
  
    updateAssemblyPieceInstances(
      assemblyId: string,
      pieceInstanceIds:
        readonly string[],
    ):
      Assembly
      | undefined {
  
      for (
        const pieceInstanceId
        of pieceInstanceIds
      ) {
  
        if (
          !this.pieceInstances.get(
            pieceInstanceId,
          )
        ) {
  
          throw new Error(
            `Cannot update assembly. Piece instance "${pieceInstanceId}" does not exist.`,
          );
  
        }
  
      }
  
  
      return this
        .assemblies
        .updatePieceInstanceIds(
          assemblyId,
          pieceInstanceIds,
        );
  
    }
  
  
    // ==========================================================
    // UPDATE PIECE INSTANCE LAYER
    // ==========================================================

    updatePieceInstanceLayer(
      instanceId: string,
      layerId: string,
    ):
      PieceInstance
      | undefined {

      if (
        !this.layers.get(
          layerId,
        )
      ) {

        throw new Error(
          `Cannot move piece instance to layer "${layerId}" because the layer does not exist.`,
        );

      }


      return this
        .pieceInstances
        .updateLayerId(
          instanceId,
          layerId,
        );

    }


    // ==========================================================
    // UPDATE ASSEMBLY LAYER
    // ==========================================================

    updateAssemblyLayer(
      assemblyId: string,
      layerId: string,
    ):
      Assembly
      | undefined {

      if (
        !this.layers.get(
          layerId,
        )
      ) {

        throw new Error(
          `Cannot move assembly to layer "${layerId}" because the layer does not exist.`,
        );

      }


      return this
        .assemblies
        .updateLayerId(
          assemblyId,
          layerId,
        );

    }


    // ==========================================================
    // REMOVE DESIGN LAYER
    // ==========================================================

    removeDesignLayer(
      layerId: string,
      fallbackLayerId =
        DEFAULT_DESIGN_LAYER_IDS
          .GEOMETRY,
    ): boolean {

      const layer =
        this.layers.get(
          layerId,
        );


      if (
        !layer
      ) {

        return false;

      }


      if (
        layer.system
      ) {

        throw new Error(
          `System layer "${layer.name}" cannot be removed.`,
        );

      }


      if (
        layerId
        === fallbackLayerId
      ) {

        throw new Error(
          "A layer cannot use itself as its removal fallback.",
        );

      }


      if (
        !this.layers.get(
          fallbackLayerId,
        )
      ) {

        throw new Error(
          `Cannot remove layer. Fallback layer "${fallbackLayerId}" does not exist.`,
        );

      }


      for (
        const instance
        of this.pieceInstances
          .findByLayerId(
            layerId,
          )
      ) {

        this.pieceInstances
          .updateLayerId(
            instance.id,
            fallbackLayerId,
          );

      }


      for (
        const assembly
        of this.assemblies
          .findByLayerId(
            layerId,
          )
      ) {

        this.assemblies
          .updateLayerId(
            assembly.id,
            fallbackLayerId,
          );

      }


      for (
        const point
        of this.cadPoints
          .findByLayerId(
            layerId,
          )
      ) {

        this.cadPoints
          .updateLayerId(
            point.id,
            fallbackLayerId,
          );

      }


      return this.layers.remove(
        layerId,
      );

    }


    // ==========================================================
    // REMOVE ASSEMBLY
    // ==========================================================
  
    removeAssembly(
      id: string,
    ): boolean {
  
      return this
        .assemblies
        .remove(
          id,
        );
  
    }
  
  
    // ==========================================================
    // REMOVE PIECE INSTANCE
    // ==========================================================
  
    removePieceInstance(
      id: string,
    ): boolean {
  
      const usedBy =
        this.assemblies
          .findByPieceInstanceId(
            id,
          );
  
  
      if (
        usedBy.length > 0
      ) {
  
        throw new Error(
          `Cannot remove piece instance "${id}" because it is used by ${usedBy.length} assembly/assemblies.`,
        );
  
      }
  
  
      return this
        .pieceInstances
        .remove(
          id,
        );
  
    }
  
  
    // ==========================================================
    // REMOVE PIECE DEFINITION
    // ==========================================================
  
    removePieceDefinition(
      id: string,
    ): boolean {
  
      const instances =
        this.pieceInstances
          .findByDefinitionId(
            id,
          );
  
  
      if (
        instances.length > 0
      ) {
  
        throw new Error(
          `Cannot remove piece definition "${id}" because ${instances.length} instance(s) use it.`,
        );
  
      }
  
  
      return this
        .pieceDefinitions
        .remove(
          id,
        );
  
    }
  
  
    // ==========================================================
    // REMOVE ASSET
    // ==========================================================
  
    removeAsset(
      id: string,
    ): boolean {
  
      const definitions =
        this.pieceDefinitions
          .findByAssetId(
            id,
          );
  
  
      if (
        definitions.length > 0
      ) {
  
        throw new Error(
          `Cannot remove asset "${id}" because ${definitions.length} piece definition(s) use it.`,
        );
  
      }
  
  
      return this.assets.remove(
        id,
      );
  
    }
  
  
    // ==========================================================
    // CLEAR
    // ==========================================================
  
    clear(): void {
  
      this.assemblies.clear();
  
      this.pieceInstances.clear();
  
      this.pieceDefinitions.clear();
  
      this.assets.clear();


      this.cadPoints.clear();


      this.layers.reset();
  
    }
  
  }