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
    CadLineRegistry,
  } from "../cad/CadLineRegistry";

  import type {
    CadLine,
  } from "../cad/CadLine";

  import type {
    RegisterCadLineInput,
  } from "../cad/CadLineRegistry";


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


    readonly cadLines =
      new CadLineRegistry();
  
  
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
    // CAD LINES
    // ==========================================================

    registerCadLine(
      input:
        RegisterCadLineInput,
    ):
      CadLine {

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
          `Cannot create CAD line. Layer "${layerId}" does not exist.`,
        );

      }


      if (
        layer.locked
      ) {

        throw new Error(
          `Cannot create CAD line. Layer "${layer.name}" is locked.`,
        );

      }


      return this
        .cadLines
        .register({
          ...input,
          layerId,
        });

    }


    removeCadLine(
      id: string,
    ):
      boolean {

      return this
        .cadLines
        .remove(
          id,
        );

    }


    // ==========================================================
    // ASSEMBLIES
    // ==========================================================
  
    /**
     * New assemblies have a single owner for each piece instance. Older
     * snapshots can still be restored through the legacy registry without
     * changing their stored representation.
     */
    private validateAssemblyMemberIds(
      pieceInstanceIds: readonly string[],
      options: {
        readonly excludeAssemblyId?: string;
        readonly allowAssigned?: boolean;
      } = {},
    ): void {
      const seen = new Set<string>();
      for (const pieceInstanceId of pieceInstanceIds) {
        if (seen.has(pieceInstanceId)) {
          throw new Error(
            `Cannot group piece instance "${pieceInstanceId}" twice in one assembly.`,
          );
        }
        seen.add(pieceInstanceId);

        if (!this.pieceInstances.get(pieceInstanceId)) {
          throw new Error(
            `Cannot create or update assembly. Piece instance "${pieceInstanceId}" does not exist.`,
          );
        }

        if (!options.allowAssigned) {
          const otherOwner = this.assemblies
            .findByPieceInstanceId(pieceInstanceId)
            .find((assembly) => assembly.id !== options.excludeAssemblyId);
          if (otherOwner) {
            throw new Error(
              `Piece instance "${pieceInstanceId}" already belongs to assembly "${otherOwner.id}".`,
            );
          }
        }
      }
    }

    private detachPiecesFromOtherAssemblies(
      targetAssemblyId: string,
      pieceInstanceIds: readonly string[],
    ): void {
      const moving = new Set(pieceInstanceIds);
      for (const assembly of this.assemblies.getAll()) {
        if (assembly.id === targetAssemblyId) continue;
        const remaining = assembly.pieceInstanceIds.filter(
          (id) => !moving.has(id),
        );
        if (remaining.length !== assembly.pieceInstanceIds.length) {
          this.assemblies.updatePieceInstanceIds(assembly.id, remaining);
        }
      }
    }

    // ==========================================================
    // ASSEMBLIES
    // ==========================================================

    registerAssembly(
      input: RegisterAssemblyInput,
    ): Assembly {
      const pieceInstanceIds = input.pieceInstanceIds ?? [];
      this.validateAssemblyMemberIds(pieceInstanceIds);

      const layerId =
        input.layerId ?? DEFAULT_DESIGN_LAYER_IDS.GEOMETRY;
      if (!this.layers.get(layerId)) {
        throw new Error(
          `Cannot create assembly. Layer "${layerId}" does not exist.`,
        );
      }

      return this.assemblies.register({
        ...input,
        layerId,
      });
    }

    /**
     * Group or regroup existing pieces atomically with respect to validation:
     * create the target first, then detach its members from prior assemblies.
     * A duplicate assembly ID or invalid input cannot lose memberships.
     */
    groupPieceInstances(
      input: RegisterAssemblyInput,
    ): Assembly {
      const pieceInstanceIds = input.pieceInstanceIds ?? [];
      this.validateAssemblyMemberIds(pieceInstanceIds, {
        allowAssigned: true,
      });

      const layerId =
        input.layerId ?? DEFAULT_DESIGN_LAYER_IDS.GEOMETRY;
      if (!this.layers.get(layerId)) {
        throw new Error(
          `Cannot create assembly. Layer "${layerId}" does not exist.`,
        );
      }

      const assembly = this.assemblies.register({
        ...input,
        layerId,
      });
      this.detachPiecesFromOtherAssemblies(
        assembly.id,
        pieceInstanceIds,
      );
      return assembly;
    }

    // ==========================================================
    // UPDATE ASSEMBLY PIECES
    // ==========================================================

    updateAssemblyPieceInstances(
      assemblyId: string,
      pieceInstanceIds: readonly string[],
    ): Assembly | undefined {
      this.validateAssemblyMemberIds(pieceInstanceIds, {
        excludeAssemblyId: assemblyId,
      });
      return this.assemblies.updatePieceInstanceIds(
        assemblyId,
        pieceInstanceIds,
      );
    }

    /**
     * Move selected pieces between existing groups without creating geometry.
     * Existing ordering is preserved and duplicate IDs are collapsed.
     */
    movePieceInstancesToAssembly(
      assemblyId: string,
      pieceInstanceIds: readonly string[],
    ): Assembly | undefined {
      const assembly = this.assemblies.get(assemblyId);
      if (!assembly) return undefined;

      const members = [
        ...new Set([...assembly.pieceInstanceIds, ...pieceInstanceIds]),
      ];
      this.validateAssemblyMemberIds(members, {
        allowAssigned: true,
      });

      const updated = this.assemblies.updatePieceInstanceIds(
        assemblyId,
        members,
      );
      this.detachPiecesFromOtherAssemblies(
        assemblyId,
        pieceInstanceIds,
      );
      return updated;
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
    // UPDATE CAD POINT LAYER
    // ==========================================================

    updateCadPointLayer(
      pointId: string,
      layerId: string,
    ):
      CadPoint
      | undefined {

      if (
        !this.layers.get(
          layerId,
        )
      ) {

        throw new Error(
          `Cannot move CAD point to layer "${layerId}" because the layer does not exist.`,
        );

      }


      return this
        .cadPoints
        .updateLayerId(
          pointId,
          layerId,
        );

    }


    // ==========================================================
    // UPDATE CAD LINE LAYER
    // ==========================================================

    updateCadLineLayer(
      lineId: string,
      layerId: string,
    ):
      CadLine
      | undefined {

      if (
        !this.layers.get(
          layerId,
        )
      ) {

        throw new Error(
          `Cannot move CAD line to layer "${layerId}" because the layer does not exist.`,
        );

      }


      return this
        .cadLines
        .updateLayerId(
          lineId,
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


      const cadFallbackLayerId =
        DEFAULT_DESIGN_LAYER_IDS
          .REFERENCE_CAD;


      if (
        !this.layers.get(
          cadFallbackLayerId,
        )
      ) {

        throw new Error(
          `Cannot remove layer. CAD fallback layer "${cadFallbackLayerId}" does not exist.`,
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
            cadFallbackLayerId,
          );

      }


      for (
        const line
        of this.cadLines
          .findByLayerId(
            layerId,
          )
      ) {

        this.cadLines
          .updateLayerId(
            line.id,
            cadFallbackLayerId,
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


      this.cadLines.clear();


      this.layers.reset();
  
    }
  
  }