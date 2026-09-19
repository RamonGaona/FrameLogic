import type {
    AssetDefinition,
  } from "./AssetDefinition";
  
  
  export interface RegisterAssetInput {
  
    id?: string;
  
    name: string;
  
    format:
      AssetDefinition["format"];
  
    contentHash?: string;
  
    sourceUri?: string;
  
    version?: number;
  
  }
  
  
  export class AssetRegistry {
  
    private readonly assets =
      new Map<
        string,
        AssetDefinition
      >();
  
  
    // ==========================================================
    // REGISTER
    // ==========================================================
  
    register(
      input: RegisterAssetInput,
    ): AssetDefinition {
  
      if (
        input.contentHash
      ) {
  
        const existing =
          this.findByHash(
            input.contentHash,
          );
  
  
        if (
          existing
        ) {
  
          return existing;
  
        }
  
      }
  
  
      const id =
        input.id
        ?? crypto.randomUUID();
  
  
      if (
        this.assets.has(
          id,
        )
      ) {
  
        throw new Error(
          `An asset with id "${id}" is already registered.`,
        );
  
      }
  
  
      const asset:
        AssetDefinition = {
  
          id,
  
          name:
            input.name,
  
          format:
            input.format,
  
          contentHash:
            input.contentHash,
  
          sourceUri:
            input.sourceUri,
  
          version:
            input.version
            ?? 1,
  
        };
  
  
      this.assets.set(
        id,
        asset,
      );
  
  
      return asset;
  
    }
  
  
    // ==========================================================
    // GET ONE
    // ==========================================================
  
    get(
      id: string,
    ):
      AssetDefinition
      | undefined {
  
      return this.assets.get(
        id,
      );
  
    }
  
  
    // ==========================================================
    // GET ALL
    // ==========================================================
  
    getAll():
      AssetDefinition[] {
  
      return Array.from(
        this.assets.values(),
      );
  
    }
  
  
    // ==========================================================
    // FIND BY HASH
    // ==========================================================
  
    findByHash(
      contentHash: string,
    ):
      AssetDefinition
      | undefined {
  
      for (
        const asset
        of this.assets.values()
      ) {
  
        if (
          asset.contentHash
          === contentHash
        ) {
  
          return asset;
  
        }
  
      }
  
  
      return undefined;
  
    }
  
  
    // ==========================================================
    // REMOVE
    // ==========================================================
  
    remove(
      id: string,
    ): boolean {
  
      return this.assets.delete(
        id,
      );
  
    }
  
  
    // ==========================================================
    // CLEAR
    // ==========================================================
  
    clear(): void {
  
      this.assets.clear();
  
    }
  
  }