export type MoveNumericAxis =
  | "X"
  | "Y"
  | "Z"
  | "XY"
  | "XZ"
  | "YZ";


export type RotateNumericAxis =
  | "X"
  | "Y"
  | "Z";


export class CadNumericInputController {

  private readonly root:
    HTMLDivElement;


  private readonly title:
    HTMLDivElement;


  private readonly fields:
    HTMLDivElement;


  private readonly applyButton:
    HTMLButtonElement;


  private mode:
    "MOVE"
    | "ROTATE"
    | "POINT"
    | null =
      null;


  private moveAxis:
    MoveNumericAxis
    | null =
      null;


  private rotateAxis:
    RotateNumericAxis
    | null =
      null;


  private onMoveApply:
    (
      axis: MoveNumericAxis,
      first: number,
      second?: number,
    ) => void =
      () => {};


  private onRotateApply:
    (
      axis: RotateNumericAxis,
      degrees: number,
    ) => void =
      () => {};


  private onPointApply:
    (
      x: number,
      y: number,
      z: number,
    ) => void =
      () => {};


  constructor(
    container:
      HTMLElement,
  ) {

    const computedPosition =
      window.getComputedStyle(
        container,
      ).position;


    if (
      computedPosition
      === "static"
    ) {

      container.style.position =
        "relative";

    }


    this.root =
      document.createElement(
        "div",
      );


    this.root.style.position =
      "absolute";


    this.root.style.left =
      "50%";


    this.root.style.bottom =
      "20px";


    this.root.style.transform =
      "translateX(-50%)";


    this.root.style.zIndex =
      "50";


    this.root.style.display =
      "none";


    this.root.style.alignItems =
      "flex-end";


    this.root.style.gap =
      "8px";


    this.root.style.padding =
      "10px 12px";


    this.root.style.borderRadius =
      "8px";


    this.root.style.background =
      "rgba(24, 24, 27, 0.94)";


    this.root.style.border =
      "1px solid rgba(255,255,255,0.18)";


    this.root.style.boxShadow =
      "0 8px 24px rgba(0,0,0,0.28)";


    this.root.style.fontFamily =
      "system-ui, sans-serif";


    this.root.style.fontSize =
      "12px";


    this.root.style.color =
      "#ffffff";


    this.title =
      document.createElement(
        "div",
      );


    this.title.style.alignSelf =
      "center";


    this.title.style.fontWeight =
      "600";


    this.title.style.whiteSpace =
      "nowrap";


    this.fields =
      document.createElement(
        "div",
      );


    this.fields.style.display =
      "flex";


    this.fields.style.gap =
      "6px";


    this.applyButton =
      document.createElement(
        "button",
      );


    this.applyButton.type =
      "button";


    this.applyButton.textContent =
      "Aplicar";


    this.applyButton.style.height =
      "30px";


    this.applyButton.addEventListener(
      "click",
      this.handleApply,
    );


    this.root.addEventListener(
      "keydown",
      this.handleKeyDown,
    );


    this.root.append(
      this.title,
      this.fields,
      this.applyButton,
    );


    container.append(
      this.root,
    );

  }


  setMoveApplyHandler(
    handler:
      (
        axis: MoveNumericAxis,
        first: number,
        second?: number,
      ) => void,
  ): void {

    this.onMoveApply =
      handler;

  }


  setRotateApplyHandler(
    handler:
      (
        axis: RotateNumericAxis,
        degrees: number,
      ) => void,
  ): void {

    this.onRotateApply =
      handler;

  }


  setPointApplyHandler(
    handler:
      (
        x: number,
        y: number,
        z: number,
      ) => void,
  ): void {

    this.onPointApply =
      handler;

  }


  showMove(
    axis:
      MoveNumericAxis,
  ): void {

    this.mode =
      "MOVE";


    this.moveAxis =
      axis;


    this.rotateAxis =
      null;


    this.title.textContent =
      `MOVE · ${axis}`;


    const labels =
      axis.length === 1
        ? [axis]
        : axis.split("");


    this.buildInputs(
      labels,
      "",
    );


    this.root.style.display =
      "flex";


    this.focusFirstInput();

  }


  showRotate(
    axis:
      RotateNumericAxis,
  ): void {

    this.mode =
      "ROTATE";


    this.moveAxis =
      null;


    this.rotateAxis =
      axis;


    this.title.textContent =
      `ROTATE · ${axis}`;


    this.buildInputs(
      [axis],
      "°",
    );


    this.root.style.display =
      "flex";


    this.focusFirstInput();

  }


  showPoint(): void {

    this.mode =
      "POINT";


    this.moveAxis =
      null;


    this.rotateAxis =
      null;


    this.title.textContent =
      "POINT · XYZ";


    this.buildInputs(
      [
        "X",
        "Y",
        "Z",
      ],
      "",
    );


    this.root.style.display =
      "flex";


    this.focusFirstInput();

  }


  hide(): void {

    this.mode =
      null;


    this.moveAxis =
      null;


    this.rotateAxis =
      null;


    this.root.style.display =
      "none";


    this.fields.replaceChildren();

  }


  private buildInputs(
    labels:
      readonly string[],

    suffix:
      string,
  ): void {

    this.fields.replaceChildren();


    for (
      const labelText
      of labels
    ) {

      const label =
        document.createElement(
          "label",
        );


      label.style.display =
        "flex";


      label.style.alignItems =
        "center";


      label.style.gap =
        "4px";


      const caption =
        document.createElement(
          "span",
        );


      caption.textContent =
        labelText;


      const input =
        document.createElement(
          "input",
        );


      input.type =
        "number";


      input.step =
        "any";


      input.value =
        "0";


      input.dataset[
        "cadNumeric"
      ] =
        "true";


      input.style.width =
        "82px";


      input.style.height =
        "28px";


      input.style.boxSizing =
        "border-box";


      input.style.padding =
        "4px 6px";


      if (
        suffix
      ) {

        const unit =
          document.createElement(
            "span",
          );


        unit.textContent =
          suffix;


        label.append(
          caption,
          input,
          unit,
        );

      }
      else {

        label.append(
          caption,
          input,
        );

      }


      this.fields.append(
        label,
      );

    }

  }


  private focusFirstInput():
    void {

    /*
     * Esperamos a que termine el pointer event del gizmo.
     *
     * Así no interferimos con TransformControls y,
     * si el usuario quiere entrada numérica, puede escribir
     * inmediatamente sin hacer clic en la casilla.
     */
    window.setTimeout(
      () => {

        const input =
          this.fields.querySelector(
            "input",
          );


        if (
          !(input instanceof HTMLInputElement)
        ) {

          return;

        }


        input.focus();


        input.select();

      },
      0,
    );

  }


  private readonly handleApply =
    (): void => {

      const inputs =
        Array.from(
          this.fields.querySelectorAll(
            "input",
          ),
        );


      if (
        inputs.length < 1
      ) {

        return;

      }


      const values =
        inputs.map(
          (
            input,
          ) =>
            Number(
              input.value,
            ),
        );


      if (
        values.some(
          Number.isNaN,
        )
      ) {

        return;

      }


      if (
        this.mode === "MOVE"
        && this.moveAxis
      ) {

        this.onMoveApply(
          this.moveAxis,
          values[0] ?? 0,
          values[1],
        );


        return;

      }


      if (
        this.mode === "ROTATE"
        && this.rotateAxis
      ) {

        this.onRotateApply(
          this.rotateAxis,
          values[0] ?? 0,
        );


        return;

      }


      if (
        this.mode === "POINT"
      ) {

        this.onPointApply(
          values[0] ?? 0,
          values[1] ?? 0,
          values[2] ?? 0,
        );

      }

    };


  private readonly handleKeyDown =
    (
      event:
        KeyboardEvent,
    ): void => {

      if (
        event.key !== "Enter"
      ) {

        return;

      }


      event.preventDefault();


      this.handleApply();

    };


  dispose(): void {

    this.applyButton.removeEventListener(
      "click",
      this.handleApply,
    );


    this.root.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );


    this.root.remove();

  }

}
