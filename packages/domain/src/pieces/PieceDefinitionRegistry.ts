import type {
    PieceDefinition,
  } from "./PieceDefinition";
  
  
  export interface RegisterPieceDefinitionInput {
  
    id?: string;
  
    code: string;
  
    name: string;
  
    geometryAssetId: string;
  
    classification?: string;
  
    tags?: string[];
  
  }
  
  
  export class PieceDefinitionRegistry {
  
    private readonly definitions =
      new Map<
        string,
        PieceDefinition
      >();
  
  
    // ==========================================================
    // REGISTER
    // ==========================================================
  
    register(
      input: RegisterPieceDefinitionInput,
    ): PieceDefinition {
  
      const existingByCode =
        this.findByCode(
          input.code,
        );
  
  
      if (
        existingByCode
      ) {
  
        throw new Error(
          `A piece definition with code "${input.code}" already exists.`,
        );
  
      }
  
  
      const id =
        input.id
        ?? crypto.randomUUID();
  
  
      if (
        this.definitions.has(
          id,
        )
      ) {
  
        throw new Error(
          `A piece definition with id "${id}" already exists.`,
        );
  
      }
  
  
      const definition:
        PieceDefinition = {
  
          id,
  
          code:
            input.code,
  
          name:
            input.name,
  
          geometryAssetId:
            input.geometryAssetId,
  
          classification:
            input.classification,
  
          tags:
            [
              ...(
                input.tags
                ?? []
              ),
            ],
  
        };
  
  
      this.definitions.set(
        id,
        definition,
      );
  
  
      return definition;
  
    }
  
  
    // ==========================================================
    // GET ONE
    // ==========================================================
  
    get(
      id: string,
    ):
      PieceDefinition
      | undefined {
  
      return this.definitions.get(
        id,
      );
  
    }
  
  
    // ==========================================================
    // GET ALL
    // ==========================================================
  
    getAll():
      PieceDefinition[] {
  
      return Array.from(
        this.definitions.values(),
      );
  
    }
  
  
    // ==========================================================
    // FIND BY CODE
    // ==========================================================
  
    findByCode(
      code: string,
    ):
      PieceDefinition
      | undefined {
  
      const normalizedCode =
        code
          .trim()
          .toLowerCase();
  
  
      for (
        const definition
        of this.definitions.values()
      ) {
  
        if (
          definition.code
            .trim()
            .toLowerCase()
          === normalizedCode
        ) {
  
          return definition;
  
        }
  
      }
  
  
      return undefined;
  
    }
  
  
    // ==========================================================
    // FIND BY ASSET
    // ==========================================================
  
    findByAssetId(
      geometryAssetId: string,
    ):
      PieceDefinition[] {
  
      return this
        .getAll()
        .filter(
          (
            definition,
          ) =>
            definition.geometryAssetId
            === geometryAssetId,
        );
  
    }
  
  
    // ==========================================================
    // FILTER BY CLASSIFICATION
    // ==========================================================
  
    filterByClassification(
      classification: string,
    ):
      PieceDefinition[] {
  
      const normalizedClassification =
        classification
          .trim()
          .toLowerCase();
  
  
      return this
        .getAll()
        .filter(
          (
            definition,
          ) =>
            definition.classification
              ?.trim()
              .toLowerCase()
            === normalizedClassification,
        );
  
    }
  
  
    // ==========================================================
    // FILTER BY TAG
    // ==========================================================
  
    filterByTag(
      tag: string,
    ):
      PieceDefinition[] {
  
      const normalizedTag =
        tag
          .trim()
          .toLowerCase();
  
  
      return this
        .getAll()
        .filter(
          (
            definition,
          ) =>
            definition.tags.some(
              (
                currentTag,
              ) =>
                currentTag
                  .trim()
                  .toLowerCase()
                === normalizedTag,
            ),
        );
  
    }
  
  
    // ==========================================================
    // SEARCH
    // ==========================================================
  
    search(
      text: string,
    ):
      PieceDefinition[] {
  
      const query =
        text
          .trim()
          .toLowerCase();
  
  
      if (
        query.length === 0
      ) {
  
        return this.getAll();
  
      }
  
  
      return this
        .getAll()
        .filter(
          (
            definition,
          ) => {
  
            const matchesCode =
              definition.code
                .toLowerCase()
                .includes(
                  query,
                );
  
  
            const matchesName =
              definition.name
                .toLowerCase()
                .includes(
                  query,
                );
  
  
            const matchesClassification =
              definition.classification
                ?.toLowerCase()
                .includes(
                  query,
                )
              ?? false;
  
  
            const matchesTag =
              definition.tags.some(
                (
                  tag,
                ) =>
                  tag
                    .toLowerCase()
                    .includes(
                      query,
                    ),
              );
  
  
            return (
              matchesCode
              || matchesName
              || matchesClassification
              || matchesTag
            );
  
          },
        );
  
    }
  
  
    // ==========================================================
    // REMOVE
    // ==========================================================
  
    remove(
      id: string,
    ): boolean {
  
      return this.definitions.delete(
        id,
      );
  
    }
  
  
    // ==========================================================
    // CLEAR
    // ==========================================================
  
    clear(): void {
  
      this.definitions.clear();
  
    }
  
  }