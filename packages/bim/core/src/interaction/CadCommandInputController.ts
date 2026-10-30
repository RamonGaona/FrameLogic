export interface CadCommandInputControllerOptions {
  readonly domElement: HTMLElement;
  readonly hasActiveCommand: () => boolean;
  readonly startLine: () => boolean;
}

interface FrameLogicCommandWindow extends Window {
  __frameLogicExternalCadCommandActive?:
    () => boolean;
}

function isEditableTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

function hasExternalCadCommand(): boolean {
  const runtime =
    window as FrameLogicCommandWindow;

  try {
    return runtime
      .__frameLogicExternalCadCommandActive
      ?.()
      ?? false;
  }
  catch {
    return false;
  }
}

/**
 * Entrada mínima de comandos tipo CAD para Model Space.
 *
 * En esta primera etapa sólo LINE usa confirmación textual:
 * L o LINE + Enter. El resto de atajos existentes no se modifica.
 */
export class CadCommandInputController {
  private readonly domElement: HTMLElement;
  private readonly hasActiveCommand: () => boolean;
  private readonly startLine: () => boolean;

  private readonly root: HTMLDivElement;
  private readonly valueElement: HTMLDivElement;
  private readonly suggestionElement: HTMLDivElement;

  private command = "";
  private visible = false;
  private disposed = false;
  private pointerX = 180;
  private pointerY = 160;

  constructor(
    options: CadCommandInputControllerOptions,
  ) {
    this.domElement = options.domElement;
    this.hasActiveCommand = options.hasActiveCommand;
    this.startLine = options.startLine;

    this.root = document.createElement("div");
    this.root.dataset["framelogicCommandInput"] = "true";
    Object.assign(this.root.style, {
      position: "fixed",
      zIndex: "2147482500",
      minWidth: "170px",
      maxWidth: "260px",
      border: "1px solid rgba(180,205,220,0.55)",
      borderRadius: "2px",
      background: "rgba(24,34,44,0.97)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      color: "#eef6fa",
      font: "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      pointerEvents: "none",
      userSelect: "none",
      display: "none",
    });

    this.valueElement = document.createElement("div");
    Object.assign(this.valueElement.style, {
      minHeight: "18px",
      padding: "4px 7px",
      background: "rgba(245,248,250,0.96)",
      color: "#101820",
      fontWeight: "700",
      whiteSpace: "nowrap",
    });

    this.suggestionElement = document.createElement("div");
    Object.assign(this.suggestionElement.style, {
      padding: "4px 7px",
      borderTop: "1px solid rgba(180,205,220,0.24)",
      color: "#d6e8f1",
      whiteSpace: "nowrap",
    });

    this.root.append(
      this.valueElement,
      this.suggestionElement,
    );
    document.body.append(this.root);

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
  }

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    if (this.visible) {
      this.position();
    }
  };

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      this.visible
      && event.button === 0
    ) {
      this.hide();
    }
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.disposed
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || isEditableTarget(event.target)
    ) {
      return;
    }

    if (!this.visible) {
      if (
        event.key.toLowerCase() !== "l"
        || this.hasActiveCommand()
        || hasExternalCadCommand()
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.command = "L";
      this.show();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.hide();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.execute();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.command = this.command.slice(0, -1);
      if (this.command.length === 0) {
        this.hide();
      }
      else {
        this.render();
      }
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.command = "LINE";
      this.render();
      return;
    }

    if (
      event.key.length === 1
      && /^[a-zA-Z]$/.test(event.key)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (this.command.length < 16) {
        this.command += event.key.toUpperCase();
      }
      this.render();
    }
  };

  private execute(): void {
    const command = this.command.trim().toUpperCase();

    if (
      command === "L"
      || command === "LINE"
    ) {
      this.hide();
      this.startLine();
      return;
    }

    this.valueElement.textContent = `${command}  ?`;
    this.suggestionElement.textContent =
      "Comando no reconocido · Esc para cancelar";
  }

  private show(): void {
    this.visible = true;
    this.root.style.display = "block";
    this.position();
    this.render();
  }

  private hide(): void {
    this.visible = false;
    this.command = "";
    this.root.style.display = "none";
  }

  private render(): void {
    this.valueElement.textContent = `${this.command}▌`;

    const normalized = this.command.toUpperCase();
    this.suggestionElement.textContent =
      "LINE".startsWith(normalized)
        || normalized === "L"
        ? "L (LINE) · Enter para ejecutar"
        : "Comando no reconocido";
  }

  private position(): void {
    const margin = 12;
    const width = 190;
    const height = 54;
    const left = Math.min(
      this.pointerX + 16,
      window.innerWidth - width - margin,
    );
    const top = Math.min(
      this.pointerY + 18,
      window.innerHeight - height - margin,
    );

    this.root.style.left = `${Math.max(margin, left)}px`;
    this.root.style.top = `${Math.max(margin, top)}px`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );

    this.root.remove();
  }
}
