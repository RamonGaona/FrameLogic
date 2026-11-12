/**
 * PDF Type 1 base fonts used by FrameLogic do not embed a Unicode font.
 * Keep technical dimension information readable instead of silently
 * deleting symbols such as Ø and × during PDF export.
 * Vector SVG/DXF outputs retain their Unicode labels.
 */
export function pdfSafeTechnicalText(text: string): string {
  return text
    .replace(/[Ø⌀]/g, "DIA ")
    .replace(/×/g, "x")
    .replace(/°/g, "deg")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}
