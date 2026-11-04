/**
 * El SNAP del objeto seleccionado solo debe excluirse mientras su geometría
 * está siendo arrastrada. Cuando MOVE espera un segundo clic de destino
 * (HASTA / eje armado), las referencias son geometría estática en el momento
 * de elegir el destino y deben permanecer disponibles, incluso en modelos
 * con una única pieza.
 */
export type MoveSnapPhase = "DRAGGING" | "PICK_DESTINATION";

interface MoveSnapExclusions {
  setExcludedInstanceIds(ids: readonly string[]): void;
  clearExcludedInstanceIds(): void;
}

export function configureMoveDestinationSnaps(
  snap: MoveSnapExclusions,
  selectedInstanceIds: readonly string[],
  phase: MoveSnapPhase,
): void {
  if (phase === "DRAGGING") {
    snap.setExcludedInstanceIds(selectedInstanceIds);
  } else {
    snap.clearExcludedInstanceIds();
  }
}
