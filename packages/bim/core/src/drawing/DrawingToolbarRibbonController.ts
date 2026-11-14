/**
 * Compact Paper Space ribbon. Commands remain in their original DOM elements:
 * their controller-owned event listeners, select state and native browser
 * gestures (download/file picker) must never be re-created or proxied.
 *
 * The View orientation panel is controlled by GeneralPdfController (not React),
 * so its own DOM node can be moved into the Vistas ribbon without rebuilding it.
 */
export const DRAWING_RIBBON_TABS = [
  ["INICIO", "Inicio"],
  ["VISTAS", "Vistas"],
  ["COTAS", "Cotas"],
  ["ANOTAR", "Anotar"],
  ["HOJA", "Hoja y PDF"],
  ["REVISION", "Revisiones"],
] as const;

export type DrawingRibbonTab = (typeof DRAWING_RIBBON_TABS)[number][0];

function plainText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

/** Classification is isolated and tested: new controls default to Inicio rather than disappear. */
export function classifyDrawingRibbonControl(
  text: string, title = "", dataKeys: readonly string[] = [],
): DrawingRibbonTab {
  const t = plainText(text);
  const hint = plainText(title);
  const keys = dataKeys.map(plainText);
  const both = t + " " + hint;
  const matches = (...terms: string[]): boolean =>
    terms.some((term) => both.includes(term));
  if (keys.some((key) => /VIEW(SELECT|ORIENTATION|SCALE|RENDER)|PROJECTVIEW|CIRCULARDETAIL/.test(key)))
    return "VISTAS";
  if (keys.some((key) => /PAPERSIZE|PAPERORIENTATION|PAPERSCALE/.test(key)))
    return "HOJA";
  if (matches("+ VISTA", "VISTAS AUTO", "PROYECTAR VIEW", "ORGANIZAR AUTO",
    "SECCIONES", "ACTUALIZAR EXACTO", "DETALLE") && !matches("COTAS · DETALLES", "COTAS · DETALLE"))
    return "VISTAS";
  if (matches("COTA", "DIMSTYLE", "ORTHO F8", "SNAP", "TIPO DE COTA",
    "ALINEAR COTAS", "DIAMETRO", "RADIO", "UNIDADES", "PRECISION") ||
    t === "MM" || /^[-+]?\d+(?:[.,]\d+)?$/.test(t) && hint.includes("DECIMAL")
    || t.startsWith("ISO E")) return "COTAS";
  if (matches("REVISION", "CONGELAR REV", "NUBE REV", "CONGELAR REV"))
    return "REVISION";
  if (matches("LABEL", "TEXTO", "BORRAR", "BLOQUEAR", "OCULTAS"))
    return "ANOTAR";
  if (matches("PDF", "CAJETIN", "HATCH", "TAMANO DE HOJA", "ORIENTACION DE HOJA",
    "ESCALA DEL PLANO", "GUARDAR TODOS", "GUARDAR PDF", "EXPORTAR HOJA", "SVG", "DXF",
    "VERTICAL", "HORIZONTAL", "ESCALA AUTO") || /^A[0-4]$/.test(t))
    return "HOJA";
  return "INICIO";
}

export class DrawingToolbarRibbonController {
  private readonly toolbar: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly originalPanelParent: HTMLElement;
  private readonly tabs: HTMLDivElement;
  private readonly observer: MutationObserver;
  private readonly buttons = new Map<DrawingRibbonTab, HTMLButtonElement>();
  private readonly originalMaxHeight: string;
  private readonly originalOverflowY: string;
  private disposed = false;
  private active: DrawingRibbonTab = "INICIO";

  constructor(overlay: HTMLElement, viewPanel: HTMLElement) {
    const toolbar = overlay.firstElementChild;
    if (!(toolbar instanceof HTMLElement)) throw new Error("Paper Space toolbar missing");
    this.toolbar = toolbar;
    this.panel = viewPanel;
    this.originalPanelParent = viewPanel.parentElement ?? overlay;
    this.originalMaxHeight = toolbar.style.maxHeight;
    this.originalOverflowY = toolbar.style.overflowY;
    toolbar.dataset["framelogicPaperRibbon"] = "true";
    toolbar.dataset["framelogicPaperRibbonActive"] = this.active;
    Object.assign(toolbar.style, {
      maxHeight: "none", overflowY: "visible", rowGap: "5px",
      padding: "6px 10px", alignItems: "center",
    });
    this.tabs = document.createElement("div");
    this.tabs.dataset["framelogicPaperRibbonTabs"] = "true";
    this.tabs.setAttribute("role", "tablist");
    this.tabs.setAttribute("aria-label", "Pestañas de Paper Space");
    this.tabs.className = "framelogic-ribbon-tabs";
    for (const [key, label] of DRAWING_RIBBON_TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = "Mostrar herramientas de " + label;
      button.dataset["framelogicRibbonTab"] = key;
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => this.select(key));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = DRAWING_RIBBON_TABS.findIndex(([tab]) => tab === key);
        const nextIndex = (index + (event.key === "ArrowRight" ? 1 : -1)
          + DRAWING_RIBBON_TABS.length) % DRAWING_RIBBON_TABS.length;
        const next = DRAWING_RIBBON_TABS[nextIndex]![0];
        this.select(next);
        this.buttons.get(next)?.focus();
      });
      this.tabs.append(button);
      this.buttons.set(key, button);
    }
    toolbar.prepend(this.tabs);
    // DOM-owned control: move the live panel, do not clone or rebind handlers.
    viewPanel.style.position = "static";
    viewPanel.style.top = "auto";
    viewPanel.style.right = "auto";
    viewPanel.style.maxWidth = "100%";
    viewPanel.style.boxShadow = "none";
    viewPanel.style.minWidth = "0";
    viewPanel.style.zIndex = "auto";
    toolbar.append(viewPanel);
    this.observer = new MutationObserver(() => this.classify());
    this.observer.observe(toolbar, { childList: true });
    this.classify();
    this.select("INICIO");
  }

  /** Preserve per-tab choices during normal updates and repeated opens. */
  select(tab: DrawingRibbonTab): void {
    if (this.disposed) return;
    this.active = tab;
    this.toolbar.dataset["framelogicPaperRibbonActive"] = tab;
    for (const [key, button] of this.buttons) {
      const selected = key === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle("is-active", selected);
    }
  }

  private classify(): void {
    if (this.disposed) return;
    for (const child of this.toolbar.children) {
      if (!(child instanceof HTMLElement) || child === this.tabs) continue;
      if (child === this.panel) {
        child.dataset["framelogicPaperRibbonCategory"] = "VISTAS";
        continue;
      }
      const keys = Object.keys(child.dataset);
      child.dataset["framelogicPaperRibbonCategory"] = classifyDrawingRibbonControl(
        child.textContent ?? "", child.title || child.getAttribute("aria-label") || "", keys,
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.tabs.remove();
    this.originalPanelParent.append(this.panel);
    for (const child of this.toolbar.children) {
      if (child instanceof HTMLElement) delete child.dataset["framelogicPaperRibbonCategory"];
    }
    delete this.toolbar.dataset["framelogicPaperRibbon"];
    delete this.toolbar.dataset["framelogicPaperRibbonActive"];
    this.toolbar.style.maxHeight = this.originalMaxHeight;
    this.toolbar.style.overflowY = this.originalOverflowY;
  }
}
