export interface ModelSpaceToolbarOrganizerOptions {
  readonly viewportContainer: HTMLElement;
  readonly startCircle: () => boolean;
}


type ToolbarCategory =
  | "FILE"
  | "DRAW"
  | "WORKPLANE"
  | "PIECE";


const CATEGORY_ORDER:
  Record<ToolbarCategory, number> = {
    FILE: 10,
    DRAW: 20,
    WORKPLANE: 30,
    PIECE: 40,
  };


const CATEGORY_LABEL:
  Record<ToolbarCategory, string> = {
    FILE: "Archivo",
    DRAW: "Dibujo CAD",
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
    this.circleButton = null;
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
      this.styleToolbar(toolbar);
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

  private ensureCircleButton(
    toolbar: HTMLElement,
  ): void {
    const existing =
      Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      ).find(
        (button) => {
          const text =
            button.textContent
              ?.trim()
              .toUpperCase();
          return text === "CÍRCULO"
            || text === "CIRCULO"
            || text === "CIRCLE";
        },
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

    const buttons =
      Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      );
    const trim =
      buttons.find(
        (item) =>
          item.textContent
            ?.trim()
            .toUpperCase()
          === "TRIM",
      );
    const line =
      buttons.find(
        (item) =>
          item.textContent
            ?.trim()
            .toUpperCase()
          === "LINE",
      );
    const anchor =
      trim
      ?? line;

    if (anchor?.parentElement === toolbar) {
      anchor.insertAdjacentElement(
        "afterend",
        button,
      );
    }
    else {
      toolbar.append(button);
    }

    this.circleButton = button;
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
        gap: "6px",
        maxWidth: "min(980px, calc(100vw - 390px))",
        padding: "7px",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "8px",
        background: "rgba(17,24,31,0.88)",
        boxShadow: "0 5px 18px rgba(0,0,0,0.24)",
        backdropFilter: "blur(7px)",
      },
    );
  }

  private organizeChildren(
    toolbar: HTMLElement,
  ): void {
    const children =
      Array.from(
        toolbar.children,
      ).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement,
      );

    const seenFirst =
      new Set<ToolbarCategory>();
    const counters:
      Record<ToolbarCategory, number> = {
        FILE: 0,
        DRAW: 0,
        WORKPLANE: 0,
        PIECE: 0,
      };

    for (const child of children) {
      const category =
        this.getCategory(child);
      const index =
        counters[category]++;
      child.style.order =
        String(
          CATEGORY_ORDER[category]
          + index,
        );

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

      if (!seenFirst.has(category)) {
        seenFirst.add(category);
        if (category !== "FILE") {
          child.style.marginLeft =
            "10px";
          child.style.boxShadow =
            "-6px 0 0 -5px rgba(148,163,184,0.45)";
        }
      }
      else {
        child.style.marginLeft = "0";
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
    const title =
      (
        element.getAttribute("title")
        ?? ""
      )
        .toUpperCase();
    const combined =
      `${text} ${title}`;

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
      || text === "TRIM"
      || text === "CÍRCULO"
      || text === "CIRCULO"
      || text === "CIRCLE"
    ) {
      return "DRAW";
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
