/**
 * Convierte LINE en una selección CAD válida antes de crear un eje. LINE
 * bloquea la selección mientras se dibuja; cancelarlo termina el comando
 * (endGroup) sin eliminar las líneas ya registradas.
 */
export function finishActiveLineForAxisConversion(
  commandManager: { readonly activeCommandId: string | null; cancelActive(): void },
  linePlacement: { readonly lastCompletedLineId: string | null },
  lineSelection: { selectSingle(id: string): void },
  lineExists: (id: string) => boolean,
): void {
  if (commandManager.activeCommandId !== "LINE") return;
  const completedLineId = linePlacement.lastCompletedLineId;
  commandManager.cancelActive();
  // Una previsualización sin dos puntos todavía no es una línea CAD.
  // No seleccionar una línea vieja ni eliminar geometría por accidente.
  if (completedLineId && lineExists(completedLineId)) {
    lineSelection.selectSingle(completedLineId);
  }
}
