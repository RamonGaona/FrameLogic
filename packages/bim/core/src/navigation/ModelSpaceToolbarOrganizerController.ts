export interface ModelSpaceToolbarOrganizerOptions {
  readonly viewportContainer: HTMLElement;
  readonly startCircle: () => boolean;
  readonly startRectangle?: () => boolean;
  readonly startParallelLine?: () => boolean;
}


type ToolbarCategory =
  | "FILE"
  | "DRAW"
  | "EDIT"
  | "WORKPLANE"
  | "PIECE";


const CATEGORY_SEQUENCE:
  readonly ToolbarCategory[] = [
    "FILE",
    "DRAW",
    "EDIT",
    "WORKPLANE",
    "PIECE",
  ];


const CATEGORY_ORDER:
  Record<ToolbarCategory, number> = {
    FILE: 10,
    DRAW: 100,
    EDIT: 200,
    WORKPLANE: 300,
    PIECE: 400,
  };


const CATEGORY_LABEL:
  Record<ToolbarCategory, string> = {
    FILE: "Archivo",
    DRAW: "Dibujo CAD",
    EDIT: "Editar",
    WORKPLANE: "Plano de trabajo",
    PIECE: "Piezas",
  };


export class ModelSpaceToolbarOrganizerController {
  private readonly options:
    ModelSpaceToolbarOrganizerOptions;

  private readonly observer:
    MutationObserver;

  private circleButton:
    HTMLButtonElement | null = null;

  private rectangleButton:
    HTMLButtonElement | null = null;

  private parallelButton:
    HTMLButtonElement | null = null;

  private disposed = false;
  private applying = false;

  constructor(
    options: ModelSpaceToolbarOrganizerOptions,
  ) {
    this.options = options;
    this.observer =
      new MutationObserver(
        () => this.apply(),
      );

    const root =
      options.viewportContainer.parentElement
      ?? document.body;

    this.observer.observe(
      root,
      {
        childList: true,
        subtree: true,
      },
    );

    this.apply();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.circleButton?.remove();
    this.rectangleButton?.remove();
    this.parallelButton?.remove();
    this.circleButton = null;
    this.rectangleButton = null;
    this.parallelButton = null;

    const toolbar =
      this.findToolbar();
    toolbar
      ?.querySelectorAll(
        '[data-framelogic-toolbar-category-label="true"]',
      )
      .forEach(
        (element) => element.remove(),
      );
  }

  private apply(): void {
    if (
      this.disposed
      || this.applying
    ) {
      return;
    }

    const toolbar =
      this.findToolbar();

    if (!toolbar) return;

    this.applying = true;

    try {
      this.ensureCircleButton(toolbar);
      this.ensureRectangleButton(toolbar);
      this.ensureParallelButton(toolbar);
      this.styleToolbar(toolbar);
      this.ensureCategoryLabels(toolbar);
      this.organizeChildren(toolbar);
    }
    finally {
      this.applying = false;
    }
  }

  private findToolbar(): HTMLElement | null {
    const root =
      this.options.viewportContainer.parentElement;

    return root?.querySelector<HTMLElement>(
      ".bim-toolbar",
    )
      ?? document.querySelector<HTMLElement>(
        ".bim-toolbar",
      );
  }

  private findButton(
    toolbar: HTMLElement,
    labels: readonly string[],
  ): HTMLButtonElement | null {
    const normalized =
      new Set(
        labels.map(
          (label) => label.toUpperCase(),
        ),
      );

    return Array.from(
      toolbar.querySelectorAll<HTMLButtonElement>(
        "button",
      ),
    ).find(
      (button) =>
        normalized.has(
          button.textContent
            ?.trim()
            .toUpperCase()
          ?? "",
        ),
    )
      ?? null;
  }

  private ensureCircleButton(
    toolbar: HTMLElement,
  ): void {
    const existing =
      this.findButton(
        toolbar,
        ["CÍRCULO", "CIRCULO", "CIRCLE"],
      );

    if (existing) {
      this.circleButton = existing;
      return;
    }

    const button =
      document.createElement("button");
    button.type = "button";
    button.textContent = "CÍRCULO";
    button.title =
      "CÍRCULO · escriba C o CIRCULO y Enter · centro + radio/diámetro";
    button.dataset["framelogicCircleButton"] =
      "true";
    button.addEventListener(
      "click",
      () => {
        const started =
          this.options.startCircle();
        if (!started) {
          window.alert(
            "No se pudo iniciar CÍRCULO. Revisa que el layer activo no esté bloqueado.",
          );
        }
      },
    );

    const line =
      this.findButton(
        toolbar,
        ["LINE"],
      );

    if (line?.parentElement === toolbar) {
      line.insertAdjacentElement(
        "afterend",
        button,
      );
    }
    else {
      toolbar.append(button);
    }

    this.circleButton = button;
  }

  private ensureRectangleButton(
    toolbar: HTMLElement,
  ): void {
    if (!this.options.startRectangle) return;

    const existing =
      this.findButton(
        toolbar,
        ["RECTÁNGULO", "RECTANGULO", "RECTANGLE"],
      );
    if (existing) {
      this.rectangleButton = existing;
      return;
    }

    const button =
      document.createElement("button");
    button.type = "button";
    button.textContent = "RECTÁNGULO";
    button.title =
      "RECTÁNGULO · escriba REC o RECTANGULO y Enter · dos esquinas";
    button.dataset["framelogicRectangleButton"] =
      "true";
    button.addEventListener(
      "click",
      () => {
        const started =
          this.options.startRectangle?.()
          ?? false;
        if (!started) {
          window.alert(
            "No se pudo iniciar RECTÁNGULO. Revisa que el layer activo no esté bloqueado.",
          );
        }
      },
    );

    const circle =
      this.circleButton
      ?? this.findButton(
        toolbar,
        ["CÍRCULO", "CIRCULO", "CIRCLE"],
      );

    if (circle?.parentElement === toolbar) {
      circle.insertAdjacentElement(
        "afterend",
        button,
      );
    }
    else {
      toolbar.append(button);
    }

    this.rectangleButton = button;
  }

  private ensureParallelButton(
    toolbar: HTMLElement,
  ): void {
    if (!this.options.startParallelLine) return;

    const existing =
      this.findButton(
        toolbar,
        ["PARALELA", "LÍNEA PARALELA", "LINEA PARALELA"],
      );
    if (existing) {
      this.parallelButton = existing;
      return;
    }

    const button =
      document.createElement("button");
    button.type = "button";
    button.textContent = "PARALELA";
    button.title =
      "LÍNEA PARALELA · escriba LL o LINEA PARALELA y Enter · selección + distancia + lado";
    button.dataset["framelogicParallelButton"] =
      "true";
    button.addEventListener(
      "click",
      () => {
        const started =
          this.options.startParallelLine?.()
          ?? false;
        if (!started) {
          window.alert(
            "No se pudo iniciar LÍNEA PARALELA. Revisa que el layer activo no esté bloqueado.",
          );
        }
      },
    );

    const trim =
      this.findButton(
        toolbar,
        ["TRIM"],
      );

    if (trim?.parentElement === toolbar) {
      trim.insertAdjacentElement(
        "afterend",
        button,
      );
    }
    else {
      toolbar.append(button);
    }

    this.parallelButton = button;
  }

  private styleToolbar(
    toolbar: HTMLElement,
  ): void {
    Object.assign(
      toolbar.style,
      {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "5px",
        maxWidth: "min(1180px, calc(100vw - 390px))",
        padding: "7px",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "8px",
        background: "rgba(17,24,31,0.88)",
        boxShadow: "0 5px 18px rgba(0,0,0,0.24)",
        backdropFilter: "blur(7px)",
      },
    );
  }

  private ensureCategoryLabels(
    toolbar: HTMLElement,
  ): void {
    for (const category of CATEGORY_SEQUENCE) {
      const selector =
        `[data-framelogic-toolbar-category-label="true"][data-toolbar-category="${category}"]`;
      let label =
        toolbar.querySelector<HTMLSpanElement>(
          selector,
        );

      if (!label) {
        label =
          document.createElement("span");
        label.dataset["framelogicToolbarCategoryLabel"] =
          "true";
        label.dataset["toolbarCategory"] =
          category;
        label.textContent =
          CATEGORY_LABEL[category];
        toolbar.append(label);
      }

      label.style.order =
        String(
          CATEGORY_ORDER[category],
        );

      Object.assign(
        label.style,
        {
          display: "inline-flex",
          alignItems: "center",
          minHeight: "24px",
          marginLeft:
            category === "FILE"
              ? "0"
              : "8px",
          padding: "2px 5px",
          borderLeft:
            category === "FILE"
              ? "none"
              : "1px solid rgba(148,163,184,0.42)",
          color: "#9fb6c4",
          font: "700 9px system-ui, sans-serif",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          userSelect: "none",
          pointerEvents: "none",
        },
      );
    }
  }

  private organizeChildren(
    toolbar: HTMLElement,
  ): void {
    const children =
      Array.from(
        toolbar.children,
      ).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement
          && element.dataset[
            "framelogicToolbarCategoryLabel"
          ] !== "true",
      );

    const counters:
      Record<ToolbarCategory, number> = {
        FILE: 0,
        DRAW: 0,
        EDIT: 0,
        WORKPLANE: 0,
        PIECE: 0,
      };

    for (const child of children) {
      // React-owned file commands are now represented in the standalone
      // ARCHIVO menu. Do not leave a second, empty Archivo category label.
      if (
        child instanceof HTMLButtonElement
        && (
          child.dataset["framelogicFileCommand"] !== undefined
          || child.textContent?.trim().toUpperCase() === "ABRIR IFC REFERENCIA"
        )
      ) {
        continue;
      }
      const category =
        this.getCategory(child);
      const index =
        counters[category]++;
      child.style.order =
        String(
          CATEGORY_ORDER[category]
          + 1
          + index,
        );

      child.style.marginLeft = "0";

      if (child instanceof HTMLButtonElement) {
        child.dataset["toolbarCategory"] =
          category;

        const originalTitle =
          child.dataset["toolbarOriginalTitle"]
          ?? child.title;
        child.dataset["toolbarOriginalTitle"] =
          originalTitle;
        child.title =
          `${CATEGORY_LABEL[category]} · ${
            originalTitle
            || child.textContent?.trim()
            || "Comando"
          }`;

        Object.assign(
          child.style,
          {
            padding: "7px 10px",
            minHeight: "32px",
            fontSize: "12px",
            whiteSpace: "nowrap",
          },
        );
      }
    }

    for (const category of CATEGORY_SEQUENCE) {
      const label =
        toolbar.querySelector<HTMLElement>(
          `[data-framelogic-toolbar-category-label="true"][data-toolbar-category="${category}"]`,
        );
      if (label) {
        label.style.display =
          counters[category] > 0
            ? "inline-flex"
            : "none";
      }
    }
  }

  private getCategory(
    element: HTMLElement,
  ): ToolbarCategory {
    const text =
      (
        element.textContent
        ?? ""
      )
        .trim()
        .toUpperCase();
    const originalTitle =
      element instanceof HTMLButtonElement
        ? element.dataset["toolbarOriginalTitle"]
          ?? element.title
        : element.getAttribute("title")
          ?? "";
    const combined =
      `${text} ${originalTitle.toUpperCase()}`;

    if (
      combined.includes("IFC REFERENCIA")
      || combined.includes("IMPORTAR PIEZA")
      || combined.includes("ABRIR PIEZA FRAMELOGIC")
      || combined.includes("CARGANDO REFERENCIA")
      || combined.includes("IMPORTANDO PIEZA")
      || combined.includes("ABRIENDO PIEZA")
    ) {
      return "FILE";
    }

    if (
      text === "POINT"
      || text === "LINE"
      || text === "CÍRCULO"
      || text === "CIRCULO"
      || text === "CIRCLE"
      || text === "RECTÁNGULO"
      || text === "RECTANGULO"
      || text === "RECTANGLE"
    ) {
      return "DRAW";
    }

    if (
      text === "TRIM"
      || text === "PARALELA"
      || text === "LÍNEA PARALELA"
      || text === "LINEA PARALELA"
      || combined.includes("RECORT")
      || combined.includes("EXTEND")
    ) {
      return "EDIT";
    }

    if (
      combined.includes("WORKPLANE")
      || text.startsWith("WP ")
      || element.classList.contains(
        "workplane-edit-status",
      )
    ) {
      return "WORKPLANE";
    }

    return "PIECE";
  }
}
