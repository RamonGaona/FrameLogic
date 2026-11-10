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
  
  
  import { validateAssemblyHierarchy } from "../assemblies/validateAssemblyHierarchy";

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
    // ASSEMBLY HIERARCHY (no duplicated piece geometry)
    // ==========================================================

    getAssemblyChildren(parentId: string | null): Assembly[] {
      return this.assemblies.getAll().filter(
        (assembly) => (assembly.parentAssemblyId ?? null) === parentId,
      );
    }

    getAssemblyPieceIdsDeep(assemblyId: string): string[] {
      const collected = new Set<string>();
      const visiting = new Set<string>();
      const walk = (id: string): void => {
        if (visiting.has(id)) {
          throw new Error("Circular assembly relationship detected.");
        }
        const assembly = this.assemblies.get(id);
        if (!assembly) throw new Error(`Assembly "${id}" does not exist.`);
        visiting.add(id);
        for (const pieceId of assembly.pieceInstanceIds) {
          if (this.pieceInstances.get(pieceId)) collected.add(pieceId);
        }
        for (const child of this.getAssemblyChildren(id)) walk(child.id);
        visiting.delete(id);
      };
      walk(assemblyId);
      return [...collected];
    }

    getAssemblyDescendantIds(assemblyId: string): string[] {
      const result: string[] = [];
      const seen = new Set<string>([assemblyId]);
      const walk = (id: string): void => {
        for (const child of this.getAssemblyChildren(id)) {
          if (seen.has(child.id)) {
            throw new Error("Circular assembly relationship detected.");
          }
          seen.add(child.id);
          result.push(child.id);
          walk(child.id);
        }
      };
      walk(assemblyId);
      return result;
    }

    isAssemblyLocked(assemblyId: string): boolean {
      const visited = new Set<string>();
      let id: string | undefined = assemblyId;
      while (id) {
        if (visited.has(id)) return true; // invalid legacy cycle: fail closed
        visited.add(id);
        const assembly: Assembly | undefined = this.assemblies.get(id);
        if (!assembly) return true;
        if (assembly.locked || this.layers.get(assembly.layerId)?.locked) return true;
        id = assembly.parentAssemblyId;
      }
      return false;
    }

    isPieceLocked(instanceId: string): boolean {
      const piece = this.pieceInstances.get(instanceId);
      if (!piece) return true;
      if (this.layers.get(piece.layerId)?.locked) return true;
      return this.assemblies.findByPieceInstanceId(instanceId)
        .some((assembly) => this.isAssemblyLocked(assembly.id));
    }

    setAssemblyLocked(assemblyId: string, locked: boolean): Assembly {
      const assembly = this.assemblies.get(assemblyId);
      if (!assembly) throw new Error("El ensamble no existe.");
      // A descendant cannot bypass a locked ancestor.
      if (assembly.parentAssemblyId
        && this.isAssemblyLocked(assembly.parentAssemblyId)) {
        throw new Error("No se puede modificar un subensamble dentro de uno bloqueado.");
      }
      return this.assemblies.updateLocked(assemblyId, locked)!;
    }

    setAssemblyParent(
      assemblyId: string,
      parentAssemblyId: string | null,
    ): Assembly {
      const assembly = this.assemblies.get(assemblyId);
      if (!assembly) throw new Error("El ensamble seleccionado no existe.");
      if (parentAssemblyId === assemblyId) {
        throw new Error("Un ensamble no puede contenerse a sí mismo.");
      }
      if (this.isAssemblyLocked(assemblyId)) {
        throw new Error("No se puede mover un ensamble bloqueado.");
      }
      if (parentAssemblyId) {
        const parent = this.assemblies.get(parentAssemblyId);
        if (!parent) throw new Error("El ensamble de destino no existe.");
        if (this.isAssemblyLocked(parentAssemblyId)) {
          throw new Error("El ensamble de destino está bloqueado.");
        }
        if (this.getAssemblyDescendantIds(assemblyId).includes(parentAssemblyId)) {
          throw new Error("No se puede crear una relación circular de ensambles.");
        }
      }
      return this.assemblies.updateParentAssemblyId(
        assemblyId, parentAssemblyId,
      )!;
    }

    /**
     * Create a true parent containing selected child assemblies and selected
     * loose pieces. All validations run before registration or reparenting.
     * Never detach components from a child assembly as a side effect.
     */
    createNestedAssembly(
      input: RegisterAssemblyInput & { childAssemblyIds?: readonly string[] },
    ): Assembly {
      const childIds = [...new Set(input.childAssemblyIds ?? [])];
      if (childIds.length !== (input.childAssemblyIds ?? []).length) {
        throw new Error("El mismo subensamble está seleccionado dos veces.");
      }
      for (const id of childIds) {
        if (!this.assemblies.get(id)) {
          throw new Error(`El subensamble "${id}" no existe.`);
        }
        if (this.isAssemblyLocked(id)) {
          throw new Error("No se puede reagrupar un ensamble bloqueado.");
        }
      }
      for (const id of childIds) {
        if (this.getAssemblyDescendantIds(id).some(
          (descendantId) => childIds.includes(descendantId),
        )) {
          throw new Error(
            "Seleccionaste un ensamble y uno de sus descendientes. Selecciona solo el ensamble superior.",
          );
        }
      }

      const pieces = input.pieceInstanceIds ?? [];
      this.validateAssemblyMemberIds(pieces);
      for (const pieceId of pieces) {
        if (this.isPieceLocked(pieceId)) {
          throw new Error("No se puede agrupar una pieza bloqueada.");
        }
      }

      const layerId = input.layerId ?? DEFAULT_DESIGN_LAYER_IDS.GEOMETRY;
      if (!this.layers.get(layerId)) {
        throw new Error(`La capa "${layerId}" no existe.`);
      }
      if (this.layers.get(layerId)?.locked) {
        throw new Error("La capa de destino está bloqueada.");
      }

      // A new parent cannot be placed anywhere inside a child being
      // regrouped: the child would later become its own ancestor.
      if (input.parentAssemblyId && childIds.some((id) =>
        id === input.parentAssemblyId
        || this.getAssemblyDescendantIds(id).includes(input.parentAssemblyId!)
      )) {
        throw new Error("No se puede crear una relación circular de ensambles.");
      }
      if (input.parentAssemblyId
        && (!this.assemblies.get(input.parentAssemblyId)
          || this.isAssemblyLocked(input.parentAssemblyId))) {
        throw new Error("El ensamble padre no existe o está bloqueado.");
      }
      // Reparenting is a single transaction. A registry error must not
      // leave a new empty parent or half-moved children in the model.
      const before = this.captureAssemblies();
      try {
        const created = this.assemblies.register({
          ...input,
          layerId,
          pieceInstanceIds: [...pieces],
        });
        for (const id of childIds) {
          this.assemblies.updateParentAssemblyId(id, created.id);
        }
        return created;
      } catch (error) {
        this.restoreAssemblies(before);
        throw error;
      }
    }

    captureAssemblies(): Assembly[] {
      return this.assemblies.getAll().map((assembly) => ({
        ...assembly,
        tags: [...assembly.tags],
        pieceInstanceIds: [...assembly.pieceInstanceIds],
      }));
    }

    restoreAssemblies(snapshot: readonly Assembly[]): void {
      validateAssemblyHierarchy(snapshot);
      // History restoration is allowed to restore locked members. No geometry,
      // materials, transforms or STEP assets are created or deleted here.
      this.assemblies.clear();
      for (const assembly of snapshot) {
        this.assemblies.register({
          id: assembly.id,
          name: assembly.name,
          layerId: assembly.layerId,
          classification: assembly.classification,
          tags: [...assembly.tags],
          pieceInstanceIds: [...assembly.pieceInstanceIds],
          parentAssemblyId: assembly.parentAssemblyId,
          locked: assembly.locked,
        });
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
      if (input.parentAssemblyId) {
        if (!this.assemblies.get(input.parentAssemblyId)) {
          throw new Error("El ensamble padre no existe.");
        }
        if (this.isAssemblyLocked(input.parentAssemblyId)) {
          throw new Error("El ensamble padre está bloqueado.");
        }
        if (input.id === input.parentAssemblyId) {
          throw new Error("Un ensamble no puede ser su propio padre.");
        }
      }

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
     * Create a flat assembly only from currently loose pieces. Attempting to
     * regroup children without selecting the original assembly explicitly is
     * forbidden; use createNestedAssembly for true parent/child composition.
     */
    groupPieceInstances(
      input: RegisterAssemblyInput,
    ): Assembly {
      const pieceInstanceIds = input.pieceInstanceIds ?? [];
      // Creating a new group from internal parts would silently dissolve
      // the old assembly. Require an explicitly selected child assembly.
      this.validateAssemblyMemberIds(pieceInstanceIds);
      for (const pieceId of pieceInstanceIds) {
        if (this.isPieceLocked(pieceId)) {
          throw new Error("No se puede agrupar una pieza bloqueada.");
        }
      }

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
      if (this.isAssemblyLocked(assemblyId)) {
        throw new Error("El ensamble de destino está bloqueado.");
      }
      for (const id of pieceInstanceIds) {
        if (this.isPieceLocked(id)) {
          throw new Error("La pieza seleccionada está bloqueada.");
        }
      }

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
  
      const assembly = this.assemblies.get(id);
      if (!assembly) return false;
      if (this.isAssemblyLocked(id)) {
        throw new Error("No se puede desagrupar un ensamble bloqueado.");
      }
      const parentId = assembly.parentAssemblyId ?? null;
      if (parentId) {
        const parent = this.assemblies.get(parentId);
        if (!parent) throw new Error("El ensamble padre no existe.");
        this.assemblies.updatePieceInstanceIds(parentId, [
          ...parent.pieceInstanceIds,
          ...assembly.pieceInstanceIds,
        ]);
      }
      for (const child of this.getAssemblyChildren(id)) {
        this.assemblies.updateParentAssemblyId(child.id, parentId);
      }
      return this.assemblies.remove(id);
  
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