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
  
  
      return this
        .pieceInstances
        .register(
          input,
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
  
  
      return this
        .assemblies
        .register(
          input,
        );
  
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
  
    }
  
  }