import { PointerFocusGate } from "./TransformGizmoReliability";

/** Preserve a numeric draft after panning/orbiting blurs the LINE input. */
export function nextLineDistanceDraft(value: string, key: string): string | null {
  if (key === "Backspace") return value.slice(0, -1);
  if (key === "-" || key === "Subtract")
    return value.startsWith("-") ? value.slice(1) : "-" + value;
  if (key === "." || key === "," || key === "Decimal") {
    if (value.includes(".")) return value;
    return (value === "" || value === "-") ? value + "0." : value + ".";
  }
  if (/^[0-9]$/.test(key)) {
    if (value === "0") return key;
    if (value === "-0") return "-" + key;
    return value + key;
  }
  return null;
}

/** Do not steal modifier shortcuts or other tool keystrokes. */
export function canResumeLineDistanceKey(
  mode: string | null,
  key: string,
  modifiers: { ctrlKey: boolean; metaKey: boolean; altKey: boolean },
): boolean {
  if (mode !== "LINE_DISTANCE" || modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey)
    return false;
  return key === "Enter" || nextLineDistanceDraft("0", key) !== null;
}

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


export const CAD_LINE_DISTANCE_MODE_EVENT =
  "framelogic:cad-line-distance-mode";


export const CAD_LINE_DISTANCE_END_EVENT =
  "framelogic:cad-line-distance-end";


export const CAD_LINE_DISTANCE_APPLY_EVENT =
  "framelogic:cad-line-distance-apply";


export interface CadLineDistanceModeDetail {

  readonly domElement:
    HTMLElement;

}


export interface CadLineDistanceApplyDetail {

  readonly container:
    HTMLElement;

  readonly distance:
    number;

}


export class CadNumericInputController {
  private readonly focusGate = new PointerFocusGate();
  private cameraNavigationPointer: number | null = null;

  private readonly container:
    HTMLElement;


  private readonly root:
    HTMLDivElement;


  private readonly title:
    HTMLDivElement;


  private readonly fields:
    HTMLDivElement;

  private readonly rotateAxes:
    HTMLDivElement;


  private readonly applyButton:
    HTMLButtonElement;


  private mode:
    "MOVE"
    | "ROTATE"
    | "POINT"
    | "LINE"
    | "LINE_DISTANCE"
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


  private onLineApply:
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

    this.container =
      container;


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


    this.rotateAxes = document.createElement("div");
    this.rotateAxes.dataset["framelogicRotateAxes"] = "true";
    this.rotateAxes.title = "Doble clic en el aro X, Y o Z del gizmo: giro de +90°";
    Object.assign(this.rotateAxes.style, {
      display: "none", alignItems: "center", gap: "4px",
    });
    for (const axis of ["X", "Y", "Z"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = axis;
      button.dataset["rotateAxis"] = axis;
      button.title = `Girar alrededor del eje ${axis}`;
      button.setAttribute("aria-label", `Eje de rotación ${axis}`);
      Object.assign(button.style, {
        padding: "5px 9px", borderRadius: "5px",
        border: "1px solid rgba(255,255,255,0.38)",
        background: "#324153", color: "white", cursor: "pointer",
      });
      button.addEventListener("click", () => this.showRotate(axis, true));
      this.rotateAxes.append(button);
    }

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

    // LINE remains active after middle/right-button camera navigation:
    // recover the field focus and capture the first typed digit if blurred.
    window.addEventListener("keydown", this.handleLineDistanceGlobalKeyDown, true);
    window.addEventListener("pointerdown", this.handleCameraNavigationDown, true);
    window.addEventListener("pointerup", this.handleCameraNavigationUp, true);
    window.addEventListener("pointercancel", this.handleCameraNavigationCancel, true);


    document.addEventListener(
      CAD_LINE_DISTANCE_MODE_EVENT,
      this.handleLineDistanceMode,
    );


    document.addEventListener(
      CAD_LINE_DISTANCE_END_EVENT,
      this.handleLineDistanceEnd,
    );


    this.root.append(
      this.title,
      this.rotateAxes,
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


  setLineApplyHandler(
    handler:
      (
        x: number,
        y: number,
        z: number,
      ) => void,
  ): void {

    this.onLineApply =
      handler;

  }


  showMove(
    axis:
      MoveNumericAxis,
  ): void {
    this.resetLinePosition();
    this.rotateAxes.style.display = "none";

    this.mode =
      "MOVE";


    this.moveAxis =
      axis;


    this.rotateAxis =
      null;


    const singleAxis =
      axis.length === 1;


    this.title.textContent =
      singleAxis
        ? `MOVE · ${axis} · DIST`
        : `MOVE · ${axis}`;


    const labels =
      singleAxis
        ? ["D"]
        : axis.split("");


    this.applyButton.textContent =
      "Aplicar";


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
    focus = true,
  ): void {
    this.resetLinePosition();

    this.mode =
      "ROTATE";


    this.moveAxis =
      null;


    this.rotateAxis =
      axis;


    this.title.textContent =
      `ROTATE · ${axis} · Ángulo`;

    this.rotateAxes.style.display = "flex";
    for (const button of this.rotateAxes.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = button.dataset["rotateAxis"] === axis;
      button.setAttribute("aria-pressed", String(selected));
      button.style.background = selected ? "#24668d" : "#324153";
    }

    this.applyButton.textContent = "Girar";

    this.buildInputs(["Ángulo"], "°");

    const input = this.fields.querySelector<HTMLInputElement>("input");
    if (input) {
      input.value = "90";
      input.setAttribute("aria-label", `Ángulo exacto en grados alrededor de ${axis}`);
    }

    this.root.style.display = "flex";

    if (focus) this.focusFirstInput();

  }


  showPoint(): void {
    this.resetLinePosition();
    this.rotateAxes.style.display = "none";

    this.mode =
      "POINT";


    this.moveAxis =
      null;


    this.rotateAxis =
      null;


    this.title.textContent =
      "POINT · XYZ";


    this.applyButton.textContent =
      "Aplicar";


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


  showLine(): void {
    this.resetLinePosition();
    this.rotateAxes.style.display = "none";

    this.mode =
      "LINE";


    this.moveAxis =
      null;


    this.rotateAxis =
      null;


    this.title.textContent =
      "LINE · XYZ";


    this.applyButton.textContent =
      "Aplicar";


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


  showLineDistance(): void {
    this.rotateAxes.style.display = "none";

    this.mode =
      "LINE_DISTANCE";


    this.moveAxis =
      null;


    this.rotateAxis =
      null;


    this.title.textContent = "Distancia";
    this.applyButton.textContent = "↵";
    this.applyButton.title = "Dibujar con distancia exacta (Enter)";
    this.applyButton.setAttribute("aria-label", "Confirmar longitud con Enter");

    this.buildInputs([""], "mm");


    this.root.style.display =
      "flex";

    const field = this.fields.querySelector<HTMLInputElement>("input");
    if (field) {
      field.type = "text";
      field.inputMode = "decimal";
      field.autocomplete = "off";
      field.value = "";
      field.placeholder = "0";
      field.style.width = "88px";
      field.style.height = "26px";
      field.style.background = "#0d1823";
      field.style.color = "#f1f5f9";
      field.style.border = "1px solid rgba(148, 163, 184, 0.55)";
      field.style.borderRadius = "4px";
      field.style.font = "12px ui-monospace, Consolas, monospace";
      field.setAttribute("aria-label", "Distancia exacta de LINE en milímetros");
    }

    const caption = this.fields.querySelector("span");
    if (caption) caption.style.display = "none";
    this.root.dataset["framelogicLineDistanceInput"] = "true";
    this.root.style.padding = "5px 8px";
    this.root.style.gap = "6px";
    this.root.style.alignItems = "center";
    this.root.style.borderRadius = "6px";
    this.root.style.background = "rgba(20, 27, 35, 0.94)";
    this.root.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    this.root.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.25)";
    this.root.style.fontSize = "11px";
    this.title.style.fontWeight = "500";
    this.title.style.color = "#cbd5e1";
    this.applyButton.style.height = "26px";
    this.applyButton.style.width = "28px";
    this.applyButton.style.padding = "0";
    this.applyButton.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    this.applyButton.style.borderRadius = "4px";
    this.applyButton.style.background = "#263746";
    this.applyButton.style.color = "#f1f5f9";
    this.applyButton.style.cursor = "pointer";
    // Fixed beneath Model Space; camera navigation must not relocate the input.
    this.root.style.left = "50%";
    this.root.style.top = "auto";
    this.root.style.bottom = "20px";
    this.root.style.transform = "translateX(-50%)";
    this.focusFirstInput();

  }


  hide(): void {
    this.cameraNavigationPointer = null;
    this.resetLinePosition();
    this.rotateAxes.style.display = "none";

    this.mode =
      null;


    this.moveAxis =
      null;


    this.rotateAxis =
      null;


    this.root.style.display =
      "none";


    this.fields.replaceChildren();


    this.applyButton.textContent =
      "Aplicar";

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


  private focusFirstInput(): void {
    const input = this.fields.querySelector("input");
    this.focusGate.request(() => {
      if (!(input instanceof HTMLInputElement) || !input.isConnected || this.root.style.display === "none") return;
      input.focus();
      input.select();
    });
  }


  private readonly handleLineDistanceMode =
    (
      event:
        Event,
    ): void => {

      const detail =
        (
          event as CustomEvent<
            CadLineDistanceModeDetail
          >
        ).detail;


      if (
        !detail
        || !this.container.contains(
          detail.domElement,
        )
      ) {

        return;

      }


      this.showLineDistance();

  };


  private readonly handleLineDistanceEnd =
    (
      event:
        Event,
    ): void => {

      const detail =
        (
          event as CustomEvent<
            CadLineDistanceModeDetail
          >
        ).detail;


      if (
        !detail
        || !this.container.contains(
          detail.domElement,
        )
      ) {

        return;

      }


      if (
        this.mode === "LINE"
        || this.mode
          === "LINE_DISTANCE"
      ) {

        this.hide();

      }

  };


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
              input.value.trim() === "" ? Number.NaN : input.value.trim().replace(",", "."),
            ),
        );


      if (
        values.some(
          (
            value,
          ) =>
            !Number.isFinite(
              value,
            ),
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


        return;

      }


      if (
        this.mode === "LINE"
      ) {

        this.onLineApply(
          values[0] ?? 0,
          values[1] ?? 0,
          values[2] ?? 0,
        );


        return;

      }


      if (
        this.mode === "LINE_DISTANCE"
      ) {

        document.dispatchEvent(
          new CustomEvent<
            CadLineDistanceApplyDetail
          >(
            CAD_LINE_DISTANCE_APPLY_EVENT,
            {
              detail: {
                container:
                  this.container,
                distance:
                  values[0] ?? 0,
              },
            },
          ),
        );

      }

    };


  /** Restore the shared numeric panel style for MOVE, ROTATE, POINT and LINE XYZ. */
  private resetLinePosition(): void {
    delete this.root.dataset["framelogicLineDistanceInput"];
    this.root.style.left = "50%";
    this.root.style.top = "auto";
    this.root.style.bottom = "20px";
    this.root.style.transform = "translateX(-50%)";
    this.root.style.padding = "10px 12px";
    this.root.style.gap = "8px";
    this.root.style.alignItems = "flex-end";
    this.root.style.borderRadius = "8px";
    this.root.style.background = "rgba(24, 24, 27, 0.94)";
    this.root.style.border = "1px solid rgba(255,255,255,0.18)";
    this.root.style.boxShadow = "0 8px 24px rgba(0,0,0,0.28)";
    this.root.style.fontSize = "12px";
    this.title.style.fontWeight = "600";
    this.title.style.color = "";
    this.applyButton.style.height = "30px";
    this.applyButton.style.width = "";
    this.applyButton.style.padding = "";
    this.applyButton.style.border = "";
    this.applyButton.style.borderRadius = "";
    this.applyButton.style.background = "";
    this.applyButton.style.color = "";
    this.applyButton.style.cursor = "";
    this.applyButton.title = "";
    this.applyButton.removeAttribute("aria-label");
  }

  private isExternalTextEditor(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest("input, textarea, select, [contenteditable]") !== null;
  }

  private readonly handleLineDistanceGlobalKeyDown = (event: KeyboardEvent): void => {
    if (!canResumeLineDistanceKey(this.mode, event.key, event)
      || this.root.style.display === "none" || event.isComposing
      || this.isExternalTextEditor(event.target)) return;

    const input = this.fields.querySelector<HTMLInputElement>("input");
    if (!input?.isConnected || document.activeElement === input
      || this.isExternalTextEditor(document.activeElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Enter") {
      this.handleApply();
      return;
    }
    const next = nextLineDistanceDraft(input.value, event.key);
    if (next === null) return;
    input.value = next;
    input.focus({ preventScroll: true });
    // type=text retains intermediate drafts such as "12." and "-0."
    input.setSelectionRange(next.length, next.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  private readonly handleCameraNavigationDown = (event: PointerEvent): void => {
    if (this.mode !== "LINE_DISTANCE" || (event.button !== 1 && event.button !== 2))
      return;
    if (event.target instanceof Node && this.container.contains(event.target))
      this.cameraNavigationPointer = event.pointerId;
  };

  private readonly handleCameraNavigationUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.cameraNavigationPointer) return;
    this.cameraNavigationPointer = null;
    // Do not focus while native camera controls still own the gesture.
    window.setTimeout(() => {
      if (this.mode !== "LINE_DISTANCE" || this.root.style.display === "none"
        || this.isExternalTextEditor(document.activeElement)) return;
      const input = this.fields.querySelector<HTMLInputElement>("input");
      if (!input?.isConnected) return;
      input.focus({ preventScroll: true });
      if (input.value === "0") input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  };

  private readonly handleCameraNavigationCancel = (event: PointerEvent): void => {
    if (this.cameraNavigationPointer === event.pointerId)
      this.cameraNavigationPointer = null;
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
    window.removeEventListener("keydown", this.handleLineDistanceGlobalKeyDown, true);
    window.removeEventListener("pointerdown", this.handleCameraNavigationDown, true);
    window.removeEventListener("pointerup", this.handleCameraNavigationUp, true);
    window.removeEventListener("pointercancel", this.handleCameraNavigationCancel, true);
    this.resetLinePosition();
    this.focusGate.dispose();

    this.applyButton.removeEventListener(
      "click",
      this.handleApply,
    );


    this.root.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );


    document.removeEventListener(
      CAD_LINE_DISTANCE_MODE_EVENT,
      this.handleLineDistanceMode,
    );


    document.removeEventListener(
      CAD_LINE_DISTANCE_END_EVENT,
      this.handleLineDistanceEnd,
    );


    this.root.remove();

  }

}
