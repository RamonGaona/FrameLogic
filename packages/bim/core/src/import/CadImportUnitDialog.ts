import type { CadDxfPoint3, ParsedCadReference } from "./CadDxfGeometryParser";

/** An explicit choice is the sole source of the coordinate conversion factor. */
export type CadSourceUnit = "mm" | "cm" | "m" | "in" | "ft";

export interface CadImportUnitChoice {
  readonly unit: CadSourceUnit;
  readonly factor: number;
}

const FACTORS: Record<CadSourceUnit, number> = {
  mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8,
};

export function explicitCadImportUnits(value: string): CadImportUnitChoice {
  if (!Object.prototype.hasOwnProperty.call(FACTORS, value)) {
    throw new Error("Unidad de origen inválida: selecciona mm, cm, m, in o ft.");
  }
  const unit = value as CadSourceUnit;
  return { unit, factor: FACTORS[unit] };
}

/** Extents are in original DWG coordinates, before any conversion to mm. */
export function rawCadExtent(
  parsed: Pick<ParsedCadReference, "segments" | "points">,
): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const add = (p: CadDxfPoint3): void => {
    if (![p.x, p.y, p.z].every(Number.isFinite)) return;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
  };
  for (const segment of parsed.segments) { add(segment.start); add(segment.end); }
  for (const point of parsed.points) add(point.point);
  if (!Number.isFinite(minX)) return 0;
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}

export function cadImportUnitPreview(
  parsed: Pick<ParsedCadReference, "segments" | "points">,
  value: string,
): CadImportUnitChoice & { readonly rawExtent: number; readonly extentMm: number } {
  const choice = explicitCadImportUnits(value);
  const rawExtent = rawCadExtent(parsed);
  return { ...choice, rawExtent, extentMm: rawExtent * choice.factor };
}

/**
 * No `auto` option in DWG: the converted DXF header may report metres while
 * the original AutoCAD coordinates are actually millimetres.
 * The user sees the exact factor and physical extent before anything is saved.
 */
export function chooseCadImportUnits(
  parsed: Pick<ParsedCadReference, "segments" | "points" | "insUnits">,
  fileName: string,
): Promise<CadImportUnitChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.dataset["framelogicCadUnitDialog"] = "true";
    overlay.setAttribute("role", "presentation");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "2147483400",
      background: "rgba(0,0,0,.74)", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "16px",
    });
    const panel = document.createElement("form");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Confirmar unidades DWG");
    Object.assign(panel.style, {
      boxSizing: "border-box", width: "min(510px, 100%)",
      padding: "20px", background: "#19252e", color: "#f1f5f9",
      font: "14px/1.5 system-ui, sans-serif",
      border: "1px solid #64748b", borderRadius: "10px",
      boxShadow: "0 12px 50px rgba(0,0,0,.55)",
    });
    const heading = document.createElement("h2");
    heading.textContent = "Confirmar unidades de origen";
    Object.assign(heading.style, { margin: "0 0 8px", fontSize: "17px" });
    const description = document.createElement("p");
    description.textContent = "Archivo: " + fileName + ". Elige la unidad REAL de las coordenadas dibujadas en AutoCAD, no la unidad indicada por el conversor.";
    const detected = document.createElement("p");
    detected.textContent = "Código de unidades detectado en el archivo convertido (INSUNITS): "
      + parsed.insUnits + ". Este dato NO modifica tu selección.";
    Object.assign(detected.style, { color: "#fbbf24", fontSize: "12px" });
    const label = document.createElement("label");
    label.textContent = "Unidades de las coordenadas";
    label.htmlFor = "framelogic-dwg-unit-choice";
    Object.assign(label.style, { display: "block", fontWeight: "600", marginBottom: "5px" });
    const select = document.createElement("select");
    select.id = "framelogic-dwg-unit-choice";
    select.dataset["framelogicCadUnitSelect"] = "true";
    for (const [unit, name] of [
      ["mm", "Milímetros (mm) — ×1"],
      ["cm", "Centímetros (cm) — ×10"],
      ["m", "Metros (m) — ×1.000"],
      ["in", "Pulgadas (in) — ×25,4"],
      ["ft", "Pies (ft) — ×304,8"],
    ] as const) {
      const option = document.createElement("option");
      option.value = unit;
      option.textContent = name;
      select.append(option);
    }
    select.value = "mm";
    Object.assign(select.style, {
      width: "100%", padding: "9px", background: "#f8fafc", color: "#111827",
      borderRadius: "5px", fontSize: "14px",
    });
    const preview = document.createElement("p");
    preview.dataset["framelogicCadUnitPreview"] = "true";
    Object.assign(preview.style, {
      margin: "12px 0 6px", fontWeight: "600",
      whiteSpace: "pre-line", fontVariantNumeric: "tabular-nums",
    });
    const warning = document.createElement("p");
    Object.assign(warning.style, { color: "#fbbf24", minHeight: "36px", fontSize: "12px" });
    const format = (x: number): string =>
      x.toLocaleString("es-CO", { maximumFractionDigits: 2 });
    const updatePreview = (): void => {
      const p = cadImportUnitPreview(parsed, select.value);
      preview.textContent =
        "Factor que se aplicará: ×" + p.factor + "\n"
        + "Extensión original: " + format(p.rawExtent) + " unidades\n"
        + "Extensión resultante: " + format(p.extentMm) + " mm";
      warning.textContent = p.factor >= 1000 && p.rawExtent >= 5000
        ? "ATENCIÓN: esta elección genera un dibujo de dimensiones enormes. Comprueba que tu DWG realmente esté en metros."
        : p.unit === "mm" && parsed.insUnits === 6
          ? "INSUNITS indica metros, pero al seleccionar mm NO se multiplicarán las coordenadas por 1.000."
          : "";
    };
    select.addEventListener("change", updatePreview);
    updatePreview();
    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px",
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Importar con estas unidades";
    for (const button of [cancel, submit]) {
      Object.assign(button.style, {
        padding: "9px 12px", border: "1px solid #94a3b8",
        borderRadius: "6px", cursor: "pointer",
      });
    }
    submit.style.background = "#bbf7d0";
    cancel.style.background = "#e2e8f0";
    actions.append(cancel, submit);
    panel.append(heading, description, detected, label, select, preview, warning, actions);
    overlay.append(panel);
    document.body.append(overlay);

    let settled = false;
    const finish = (choice: CadImportUnitChoice | null): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener("keydown", onEscape, true);
      overlay.remove();
      resolve(choice);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    };
    window.addEventListener("keydown", onEscape, true);
    cancel.addEventListener("click", () => finish(null));
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(explicitCadImportUnits(select.value));
    });
    select.focus();
  });
}
