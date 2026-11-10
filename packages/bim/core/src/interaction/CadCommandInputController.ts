export interface CadCommandInputControllerOptions {
  readonly domElement: HTMLElement;
  readonly hasActiveCommand: () => boolean;
  readonly startLine: () => boolean;
}

interface FrameLogicCommandWindow extends Window {
  __frameLogicExternalCadCommandActive?:
    () => boolean;
  __frameLogicStartParallelLineCommand?:
    () => boolean;
  __frameLogicStartRectangleCommand?:
    () => boolean;
  __frameLogicCanStartRectangleTextCommand?:
    () => boolean;
  __frameLogicStartCopyBaseCommand?: () => boolean;
  __frameLogicCopyBaseCommandActive?: () => boolean;
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

function commandRuntime(): FrameLogicCommandWindow {
  return window as FrameLogicCommandWindow;
}

function hasExternalCadCommand(): boolean {
  try {
    return Boolean(
      commandRuntime().__frameLogicExternalCadCommandActive?.()
      || commandRuntime().__frameLogicCopyBaseCommandActive?.()
    );
  }
  catch {
    return false;
  }
}

function canStartRectangleTextCommand(): boolean {
  try {
    return commandRuntime()
      .__frameLogicCanStartRectangleTextCommand
      ?.()
      ?? false;
  }
  catch {
    return false;
  }
}

function normalizeCommand(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .replace(
      /\s+/g,
      "",
    )
    .toUpperCase();
}

/**
 * Entrada textual CAD junto al cursor.
 *
 * - C / COPY / COPIAR + Enter: copia 3D o CAD por punto base y destino.
 * - L / LINE + Enter: línea.
 * - LL / LINEA PARALELA + Enter: línea paralela.
 * - REC / RECTANGULO + Enter: rectángulo.
 *
 * R sólo abre el buffer de RECTÁNGULO cuando el runtime indica que no existe
 * una selección susceptible de ROTATE. Con selección se conserva el atajo R
 * histórico de FrameLogic sin interceptarlo.
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
      minWidth: "190px",
      maxWidth: "330px",
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
      const key =
        event.key.toLowerCase();
      const startsLineFamily =
        key === "l";
      const startsCopy = key === "c";
      const startsRectangle =
        key === "r"
        && canStartRectangleTextCommand();

      if (
        (!startsLineFamily && !startsRectangle && !startsCopy)
        || this.hasActiveCommand()
        || hasExternalCadCommand()
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.command =
        startsRectangle ? "R" : startsCopy ? "C" : "L";
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
      const value = normalizeCommand(this.command);
      this.command = value.startsWith("R")
        ? "RECTANGULO"
        : value.startsWith("C") ? "COPY" : "LINE";
      this.render();
      return;
    }

    if (
      event.key === " "
      && this.command.length > 0
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.command.length < 28) {
        this.command += " ";
      }
      this.render();
      return;
    }

    if (
      event.key.length === 1
      && /^[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]$/.test(
        event.key,
      )
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (this.command.length < 28) {
        this.command += event.key.toUpperCase();
      }
      this.render();
    }
  };

  private execute(): void {
    const command =
      normalizeCommand(
        this.command,
      );

    if (command === "C" || command === "COPY"
      || command === "COPIAR" || command === "CP") {
      const started = commandRuntime().__frameLogicStartCopyBaseCommand?.();
      this.hide();
      if (!started) {
        window.alert("No se pudo iniciar COPY. Cierra la herramienta activa y vuelve a intentarlo.");
      }
      return;
    }

    if (
      command === "L"
      || command === "LINE"
    ) {
      this.hide();
      this.startLine();
      return;
    }

    if (
      command === "LL"
      || command === "LINEAPARALELA"
    ) {
      const startParallel =
        commandRuntime()
          .__frameLogicStartParallelLineCommand;
      this.hide();
      if (!startParallel?.()) {
        window.alert(
          "No se pudo iniciar LÍNEA PARALELA. Revisa el layer activo.",
        );
      }
      return;
    }

    if (
      command === "REC"
      || command === "RECTANGULO"
      || command === "RECTANGLE"
    ) {
      const startRectangle =
        commandRuntime()
          .__frameLogicStartRectangleCommand;
      this.hide();
      if (!startRectangle?.()) {
        window.alert(
          "No se pudo iniciar RECTÁNGULO. Revisa el layer activo.",
        );
      }
      return;
    }

    this.valueElement.textContent = `${this.command}  ?`;
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

    const normalized =
      normalizeCommand(
        this.command,
      );

    if (normalized === "C"
      || "COPY".startsWith(normalized)
      || "COPIAR".startsWith(normalized)) {
      this.suggestionElement.textContent =
        "COPY / COPIAR · selecciona piezas o ensambles, punto base y destino";
      return;
    }

    if (normalized === "L") {
      this.suggestionElement.textContent =
        "L (LINE) · LL (LÍNEA PARALELA) · Enter para confirmar";
      return;
    }

    if (
      normalized !== "L"
      && "LINE".startsWith(
        normalized,
      )
    ) {
      this.suggestionElement.textContent =
        "L / LINE · Enter para ejecutar";
      return;
    }

    if (
      normalized === "LL"
      || normalized.startsWith("LINEA")
      || "LINEAPARALELA".startsWith(
        normalized,
      )
    ) {
      this.suggestionElement.textContent =
        "LL / LÍNEA PARALELA · Enter para ejecutar";
      return;
    }

    if (
      "RECTANGULO".startsWith(
        normalized,
      )
      || "RECTANGLE".startsWith(
        normalized,
      )
      || "REC".startsWith(
        normalized,
      )
    ) {
      this.suggestionElement.textContent =
        "REC / RECTÁNGULO · Enter para ejecutar";
      return;
    }

    this.suggestionElement.textContent =
      "Comando no reconocido";
  }

  private position(): void {
    const margin = 12;
    const width = 300;
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
