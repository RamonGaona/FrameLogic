import {
  CadReferenceBlockController,
} from "./CadReferenceBlockController";

import type {
  CadReferenceBlockControllerOptions,
} from "./CadReferenceBlockController";

let activeCadReferenceBlockController:
  CadReferenceTransformController | null =
    null;

/**
 * Compatibility name kept for the existing FrameLogic drawing core.
 * The implementation now treats imported DWG/DXF files as full reference
 * blocks: multi-select, MOVE, 3D ROTATE and DELETE all operate on the block.
 */
export class CadReferenceTransformController
  extends CadReferenceBlockController {
  constructor(
    options: CadReferenceBlockControllerOptions,
  ) {
    super(options);
    activeCadReferenceBlockController = this;
  }

  override dispose(): void {
    if (activeCadReferenceBlockController === this) {
      activeCadReferenceBlockController = null;
    }
    super.dispose();
  }
}

export type CadReferenceTransformControllerOptions =
  CadReferenceBlockControllerOptions;

export function getActiveCadReferenceBlockController():
  CadReferenceBlockController | null {
  return activeCadReferenceBlockController;
}
