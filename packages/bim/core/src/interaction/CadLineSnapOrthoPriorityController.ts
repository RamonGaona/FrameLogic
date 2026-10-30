import * as THREE from "three";

import type {
  CadLinePlacementController,
} from "./CadLinePlacementController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


interface LinePlacementRuntime {
  readonly snap: DesignSnapController;
  lastPointerX: number;
  lastPointerY: number;
  hasPointerPosition: boolean;
  resolveCandidate: (
    candidate: THREE.Vector3,
    start: THREE.Vector3 | null,
  ) => THREE.Vector3;
}

const SNAP_MATCH_TOLERANCE_SQ = 1e-8;

/**
 * Da prioridad a un SNAP explícito sobre ORTO durante LINE.
 *
 * ORTO sigue restringiendo el movimiento libre del cursor, pero si el cursor
 * está realmente sobre un SNAP (ENDPOINT, MIDPOINT, etc.), ese punto exacto
 * gana. Esto permite cerrar o conectar geometría diagonal aun con F8 activo,
 * igual que en un flujo CAD convencional.
 */
export class CadLineSnapOrthoPriorityController {
  private readonly runtime: LinePlacementRuntime;
  private readonly originalResolveCandidate:
    LinePlacementRuntime["resolveCandidate"];
  private disposed = false;

  constructor(
    linePlacement: CadLinePlacementController,
  ) {
    this.runtime =
      linePlacement as unknown as LinePlacementRuntime;

    this.originalResolveCandidate =
      this.runtime.resolveCandidate.bind(
        this.runtime,
      );

    this.runtime.resolveCandidate =
      this.resolveCandidate;
  }

  private readonly resolveCandidate = (
    candidate: THREE.Vector3,
    start: THREE.Vector3 | null,
  ): THREE.Vector3 => {
    if (
      start
      && this.runtime.hasPointerPosition
    ) {
      const snap = this.runtime.snap.findSnap(
        this.runtime.lastPointerX,
        this.runtime.lastPointerY,
      );

      if (
        snap
        && snap.point.distanceToSquared(candidate)
          <= SNAP_MATCH_TOLERANCE_SQ
      ) {
        return snap.point.clone();
      }
    }

    return this.originalResolveCandidate(
      candidate,
      start,
    );
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.runtime.resolveCandidate =
      this.originalResolveCandidate;
  }
}
