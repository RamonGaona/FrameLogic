import {
  AssemblyDefinitionRegistry,
} from "../assemblies/AssemblyDefinitionRegistry";

import type {
  AssemblyDefinition,
} from "../assemblies/AssemblyDefinition";

import {
  PieceEngineeringRegistry,
} from "./PieceEngineeringRegistry";

import type {
  PlacedStructuralAxis,
  StructuralModel,
} from "../structural/StructuralModel";

import {
  buildStructuralModel,
} from "../structural/StructuralModel";


export interface AssemblyEngineeringSummary {
  readonly assemblyDefinitionId: string;
  readonly componentCount: number;
  readonly totalMassKg?: number;
  readonly currency?: string;
  readonly totalPieceCost?: number;
  readonly assemblyCost?: number;
  readonly totalCost?: number;
}


/**
 * Dominio de ingeniería independiente del formato de intercambio.
 *
 * STEP aporta geometría precisa.
 * IFC queda como adaptador BIM de entrada/salida.
 * FrameLogic conserva metadatos, relaciones, ensamblajes y ejes.
 */
export class FrameLogicEngineeringModel {
  readonly pieces =
    new PieceEngineeringRegistry();

  readonly assemblies =
    new AssemblyDefinitionRegistry();


  buildStructuralModel(
    axes: readonly PlacedStructuralAxis[],
    nodeMergeTolerance?: number,
  ): StructuralModel {
    return buildStructuralModel(
      axes,
      nodeMergeTolerance,
    );
  }


  getAssemblySummary(
    assemblyDefinitionId: string,
  ): AssemblyEngineeringSummary | undefined {
    const assembly =
      this.assemblies.get(
        assemblyDefinitionId,
      );

    if (!assembly) {
      return undefined;
    }

    return this.summarizeAssembly(
      assembly,
    );
  }


  private summarizeAssembly(
    assembly: AssemblyDefinition,
  ): AssemblyEngineeringSummary {
    let mass = 0;
    let hasMass = false;
    let pieceCost = 0;
    let hasPieceCost = false;
    let currency:
      string | undefined =
        assembly.currency;

    for (
      const component
      of assembly.components
    ) {
      const engineering =
        this.pieces.get(
          component.pieceDefinitionId,
        );

      const componentMass =
        engineering?.physical?.massKg;

      if (
        componentMass !== undefined
      ) {
        mass += componentMass;
        hasMass = true;
      }

      const componentCost =
        engineering?.commercial?.unitCost;

      if (
        componentCost !== undefined
      ) {
        pieceCost += componentCost;
        hasPieceCost = true;
      }

      const componentCurrency =
        engineering?.commercial?.currency;

      if (
        currency === undefined
        && componentCurrency !== undefined
      ) {
        currency = componentCurrency;
      }
      else if (
        currency !== undefined
        && componentCurrency !== undefined
        && componentCurrency !== currency
      ) {
        currency = undefined;
      }
    }

    const assemblyCost =
      assembly.assemblyCost;

    const totalCost =
      hasPieceCost
        ? pieceCost + (assemblyCost ?? 0)
        : assemblyCost;

    return {
      assemblyDefinitionId:
        assembly.id,
      componentCount:
        assembly.components.length,
      totalMassKg:
        hasMass
          ? mass
          : undefined,
      currency,
      totalPieceCost:
        hasPieceCost
          ? pieceCost
          : undefined,
      assemblyCost,
      totalCost,
    };
  }
}
