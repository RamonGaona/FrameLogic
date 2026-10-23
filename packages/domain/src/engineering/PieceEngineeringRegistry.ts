import type {
  PieceEngineeringData,
  PieceEngineeringFeature,
  PieceMaterialData,
  PieceCommercialData,
  PiecePhysicalData,
  StructuralAxisDefinition,
} from "./PieceEngineering";


export interface UpsertPieceEngineeringInput {
  readonly pieceDefinitionId: string;
  readonly revision?: string;
  readonly material?: PieceMaterialData;
  readonly commercial?: PieceCommercialData;
  readonly physical?: PiecePhysicalData;
  readonly structuralAxis?: StructuralAxisDefinition;
  readonly features?: readonly PieceEngineeringFeature[];
}


export class PieceEngineeringRegistry {
  private readonly data =
    new Map<string, PieceEngineeringData>();


  upsert(
    input: UpsertPieceEngineeringInput,
  ): PieceEngineeringData {
    const current =
      this.data.get(
        input.pieceDefinitionId,
      );

    const next:
      PieceEngineeringData = {
        pieceDefinitionId:
          input.pieceDefinitionId,
        revision:
          input.revision
          ?? current?.revision,
        material:
          input.material
          ?? current?.material,
        commercial:
          input.commercial
          ?? current?.commercial,
        physical:
          input.physical
          ?? current?.physical,
        structuralAxis:
          input.structuralAxis
          ?? current?.structuralAxis,
        features:
          input.features
          ? [...input.features]
          : [...(current?.features ?? [])],
      };

    this.assertValid(
      next,
    );

    this.data.set(
      input.pieceDefinitionId,
      next,
    );

    return next;
  }


  get(
    pieceDefinitionId: string,
  ): PieceEngineeringData | undefined {
    return this.data.get(
      pieceDefinitionId,
    );
  }


  getAll(): PieceEngineeringData[] {
    return Array.from(
      this.data.values(),
    );
  }


  setStructuralAxis(
    pieceDefinitionId: string,
    structuralAxis: StructuralAxisDefinition | undefined,
  ): PieceEngineeringData {
    const current =
      this.data.get(
        pieceDefinitionId,
      );

    const next:
      PieceEngineeringData = {
        pieceDefinitionId,
        revision:
          current?.revision,
        material:
          current?.material,
        commercial:
          current?.commercial,
        physical:
          current?.physical,
        structuralAxis,
        features: [
          ...(current?.features ?? []),
        ],
      };

    this.assertValid(
      next,
    );

    this.data.set(
      pieceDefinitionId,
      next,
    );

    return next;
  }


  setFeatures(
    pieceDefinitionId: string,
    features: readonly PieceEngineeringFeature[],
  ): PieceEngineeringData {
    const current =
      this.data.get(
        pieceDefinitionId,
      );

    return this.upsert({
      pieceDefinitionId,
      revision:
        current?.revision,
      material:
        current?.material,
      commercial:
        current?.commercial,
      physical:
        current?.physical,
      structuralAxis:
        current?.structuralAxis,
      features,
    });
  }


  remove(
    pieceDefinitionId: string,
  ): boolean {
    return this.data.delete(
      pieceDefinitionId,
    );
  }


  clear(): void {
    this.data.clear();
  }


  private assertValid(
    value: PieceEngineeringData,
  ): void {
    const axis =
      value.structuralAxis;

    if (axis) {
      const length =
        Math.hypot(
          axis.end.x - axis.start.x,
          axis.end.y - axis.start.y,
          axis.end.z - axis.start.z,
        );

      if (
        !Number.isFinite(length)
        || length <= 1e-12
      ) {
        throw new Error(
          "Structural axis must have two different finite endpoints.",
        );
      }
    }

    for (
      const feature
      of value.features
    ) {
      if (
        feature.kind === "HOLE"
        && (
          !Number.isFinite(feature.diameter)
          || feature.diameter <= 0
        )
      ) {
        throw new Error(
          `Hole feature "${feature.id}" must have a positive diameter.`,
        );
      }

      if (
        (
          feature.kind === "CIRCLE"
          || feature.kind === "CYLINDER"
        )
        && (
          !Number.isFinite(feature.radius)
          || feature.radius <= 0
        )
      ) {
        throw new Error(
          `Feature "${feature.id}" must have a positive radius.`,
        );
      }
    }
  }
}
