/**
 * Compact ARCHIVO menu for the Model Space toolbar.
 *
 * Existing commands live in two different owners: the project/DWG controllers
 * create DOM buttons in the project bar; React owns the STEP/FrameLogic piece
 * buttons in .bim-toolbar. We deliberately leave those buttons mounted and
 * invoke their native click handlers on user activation. Moving React-managed
 * nodes to another parent would break its reconciliation and handler updates.
 */

export const FILE_MENU_ACTIONS = [
  { id: "save-project", label: "Guardar proyecto" },
  { id: "open-project", label: "Abrir proyecto" },
  { id: "open-cad", label: "Abrir DWG/DXF" },
  { id: "recover-cad", label: "Recuperar DWG" },
  { id: "import-piece", label: "Importar pieza" },
  { id: "open-piece", label: "Abrir pieza FrameLogic" },
] as const;

type FileActionId = (typeof FILE_MENU_ACTIONS)[number]["id"];

export function findFileCommand(
  root: Pick<Document, "querySelector">,
  id: FileActionId,
): HTMLButtonElement | null {
  const element = root.querySelector(
    `button[data-framelogic-file-command="${id}"]`,
  );
  return element instanceof HTMLButtonElement ? element : null;
}

export class FileMenuController {
  private readonly wrapper: HTMLDivElement;
  private readonly trigger: HTMLButtonElement;
  private readonly list: HTMLDivElement;
  private readonly entries = new Map<FileActionId, HTMLButtonElement>();
  private readonly timer: number;
  private readonly container: HTMLElement;
  private disposed = false;
  private opened = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.wrapper = document.createElement("div");
    this.wrapper.dataset["framelogicFileMenu"] = "true";
    Object.assign(this.wrapper.style, {
      position: "relative",
      display: "flex",
      alignItems: "center",
      flex: "0 0 auto",
    });

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.dataset["framelogicFileMenuTrigger"] = "true";
    this.trigger.textContent = "ARCHIVO ▾";
    this.trigger.title = "Guardar, abrir o importar archivos";
    this.trigger.setAttribute("aria-haspopup", "menu");
    this.trigger.setAttribute("aria-expanded", "false");
    Object.assign(this.trigger.style, {
      padding: "5px 10px",
      minHeight: "29px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
      font: "600 12px system-ui, sans-serif",
      whiteSpace: "nowrap",
    });
    this.trigger.addEventListener("click", this.toggle);

    this.list = document.createElement("div");
    this.list.dataset["framelogicFileMenuList"] = "true";
    this.list.setAttribute("role", "menu");
    Object.assign(this.list.style, {
      display: "none",
      position: "absolute",
      left: "0",
      top: "calc(100% + 6px)",
      zIndex: "15000",
      width: "230px",
      maxWidth: "calc(100vw - 32px)",
      padding: "5px",
      border: "1px solid rgba(190,212,225,0.26)",
      borderRadius: "6px",
      background: "rgba(20,30,38,0.99)",
      boxShadow: "0 9px 24px rgba(0,0,0,0.42)",
    });

    for (const action of FILE_MENU_ACTIONS) {
      const item = document.createElement("button");
      item.type = "button";
      item.dataset["framelogicFileMenuAction"] = action.id;
      item.setAttribute("role", "menuitem");
      item.textContent = action.label;
      Object.assign(item.style, {
        display: "block",
        width: "100%",
        padding: "8px 10px",
        textAlign: "left",
        font: "12px system-ui, sans-serif",
        color: "#edf5f9",
        border: "0",
        borderRadius: "4px",
        background: "transparent",
        cursor: "pointer",
      });
      item.addEventListener("pointerenter", () => {
        item.style.background = "rgba(90,170,212,0.18)";
      });
      item.addEventListener("pointerleave", () => {
        item.style.background = "transparent";
      });
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        const source = findFileCommand(document, action.id);
        if (!source || source.disabled) return;
        // Click is synchronous and still within the real user gesture, so
        // hidden file inputs and browser download handlers continue to work.
        source.click();
      });
      this.list.append(item);
      this.entries.set(action.id, item);
    }

    this.wrapper.append(this.trigger, this.list);
    document.addEventListener("pointerdown", this.handleOutsidePointer, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    this.sync();
    this.timer = window.setInterval(() => this.sync(), 350);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    document.removeEventListener("pointerdown", this.handleOutsidePointer, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    this.trigger.removeEventListener("click", this.toggle);
    this.wrapper.remove();
    delete document.documentElement.dataset["framelogicFileMenuReady"];
  }

  private findProjectBar(): HTMLElement | null {
    return this.container.querySelector<HTMLElement>(
      '[data-framelogic-project-toolbar="true"]',
    ) ?? document.querySelector<HTMLElement>(
      '[data-framelogic-project-toolbar="true"]',
    );
  }

  private sync(): void {
    if (this.disposed) return;
    const bar = this.findProjectBar();
    if (!bar) return;

    if (this.wrapper.parentElement !== bar) {
      bar.prepend(this.wrapper);
    }
    // Original buttons remain owned by their controllers and hidden by CSS
    // only while this menu is mounted and functional.
    document.documentElement.dataset["framelogicFileMenuReady"] = "true";

    for (const action of FILE_MENU_ACTIONS) {
      const item = this.entries.get(action.id);
      if (!item) continue;
      const source = findFileCommand(document, action.id);
      item.disabled = !source || source.disabled;
      item.textContent = source?.textContent?.trim() || action.label;
      item.title = source?.title || action.label;
      item.style.opacity = item.disabled ? "0.45" : "1";
      item.style.cursor = item.disabled ? "default" : "pointer";
    }
  }

  private readonly toggle = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (this.opened) this.close();
    else this.open();
  };

  private open(): void {
    this.sync();
    this.opened = true;
    this.list.style.display = "block";
    this.trigger.setAttribute("aria-expanded", "true");
    this.trigger.textContent = "ARCHIVO ▴";
  }

  private close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.list.style.display = "none";
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.textContent = "ARCHIVO ▾";
  }

  private readonly handleOutsidePointer = (event: PointerEvent): void => {
    if (!this.opened || this.wrapper.contains(event.target as Node)) return;
    this.close();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.opened || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
    this.trigger.focus();
  };
}
