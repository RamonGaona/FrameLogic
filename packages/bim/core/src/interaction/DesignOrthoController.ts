import * as THREE from "three";


export type DesignOrthoAxis =
  | "X"
  | "Y"
  | "Z";


export interface DesignOrthoBasis {

  readonly xAxis:
    THREE.Vector3;

  readonly yAxis:
    THREE.Vector3;

  readonly zAxis:
    THREE.Vector3;

}


export interface DesignOrthoConstraintOptions {

  readonly axes?:
    readonly DesignOrthoAxis[];

  readonly basis?:
    DesignOrthoBasis;

}


export type DesignOrthoListener =
  (
    enabled:
      boolean,
  ) => void;


const WORLD_BASIS:
  DesignOrthoBasis = {
    xAxis:
      new THREE.Vector3(
        1,
        0,
        0,
      ),
    yAxis:
      new THREE.Vector3(
        0,
        1,
        0,
      ),
    zAxis:
      new THREE.Vector3(
        0,
        0,
        1,
      ),
  };


function isEditableKeyboardTarget(
  target:
    EventTarget | null,
): boolean {

  if (
    !(target instanceof HTMLElement)
  ) {

    return false;

  }


  return (
    target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  );

}


function normalizedAxis(
  axis:
    THREE.Vector3,
): THREE.Vector3 {

  const normalized =
    axis.clone();


  if (
    normalized.lengthSq()
    <= 1e-20
  ) {

    return normalized.set(
      0,
      0,
      0,
    );

  }


  return normalized.normalize();

}


export class DesignOrthoController {

  private readonly domElement:
    HTMLElement;


  private readonly listeners =
    new Set<
      DesignOrthoListener
    >();


  private readonly indicator:
    HTMLDivElement;


  private enabled =
    false;


  private pointerInside =
    false;


  private disposed =
    false;


  constructor(
    domElement:
      HTMLElement,
  ) {

    this.domElement =
      domElement;


    this.indicator =
      document.createElement(
        "div",
      );


    this.indicator.dataset
      .framelogicOrthoIndicator =
        "true";


    this.indicator.style.position =
      "fixed";

    this.indicator.style.zIndex =
      "1100";

    this.indicator.style.pointerEvents =
      "none";

    this.indicator.style.padding =
      "4px 7px";

    this.indicator.style.border =
      "1px solid rgba(255, 255, 255, 0.28)";

    this.indicator.style.borderRadius =
      "4px";

    this.indicator.style.background =
      "rgba(18, 18, 22, 0.82)";

    this.indicator.style.color =
      "#ffffff";

    this.indicator.style.fontFamily =
      "system-ui, sans-serif";

    this.indicator.style.fontSize =
      "11px";

    this.indicator.style.fontWeight =
      "700";

    this.indicator.style.letterSpacing =
      "0.03em";


    document.body.append(
      this.indicator,
    );


    this.updateIndicator();

    this.updateIndicatorPosition();


    this.domElement.addEventListener(
      "pointerenter",
      this.handlePointerEnter,
    );

    this.domElement.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );


    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    window.addEventListener(
      "resize",
      this.updateIndicatorPosition,
    );

    window.addEventListener(
      "scroll",
      this.updateIndicatorPosition,
      true,
    );

  }


  get isEnabled():
    boolean {

    return this.enabled;

  }


  setEnabled(
    enabled:
      boolean,
  ): void {

    if (
      this.disposed
      || this.enabled
        === enabled
    ) {

      return;

    }


    this.enabled =
      enabled;


    this.updateIndicator();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        this.enabled,
      );

    }

  }


  toggle():
    boolean {

    this.setEnabled(
      !this.enabled,
    );


    return this.enabled;

  }


  subscribe(
    listener:
      DesignOrthoListener,
  ):
    () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.enabled,
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  getDominantAxis(
    start:
      THREE.Vector3,

    candidate:
      THREE.Vector3,

    options:
      DesignOrthoConstraintOptions = {},
  ):
    DesignOrthoAxis {

    const axes =
      options.axes
      ?? [
        "X",
        "Y",
        "Z",
      ];


    const basis =
      options.basis
      ?? WORLD_BASIS;


    const delta =
      candidate
        .clone()
        .sub(
          start,
        );


    let bestAxis:
      DesignOrthoAxis =
        axes[0]
        ?? "X";

    let bestMagnitude =
      -1;


    for (
      const axis
      of axes
    ) {

      const direction =
        this.getBasisAxis(
          axis,
          basis,
        );


      const magnitude =
        Math.abs(
          delta.dot(
            direction,
          ),
        );


      if (
        magnitude
        > bestMagnitude
      ) {

        bestMagnitude =
          magnitude;

        bestAxis =
          axis;

      }

    }


    return bestAxis;

  }


  constrainPoint(
    start:
      THREE.Vector3,

    candidate:
      THREE.Vector3,

    options:
      DesignOrthoConstraintOptions = {},
  ):
    THREE.Vector3 {

    if (
      !this.enabled
    ) {

      return candidate.clone();

    }


    const basis =
      options.basis
      ?? WORLD_BASIS;


    const axis =
      this.getDominantAxis(
        start,
        candidate,
        options,
      );


    const direction =
      this.getBasisAxis(
        axis,
        basis,
      );


    const delta =
      candidate
        .clone()
        .sub(
          start,
        );


    const distance =
      delta.dot(
        direction,
      );


    return start
      .clone()
      .addScaledVector(
        direction,
        distance,
      );

  }


  constrainDelta(
    delta:
      THREE.Vector3,

    options:
      DesignOrthoConstraintOptions = {},
  ):
    THREE.Vector3 {

    return this.constrainPoint(
      new THREE.Vector3(),
      delta,
      options,
    );

  }


  private getBasisAxis(
    axis:
      DesignOrthoAxis,

    basis:
      DesignOrthoBasis,
  ):
    THREE.Vector3 {

    switch (
      axis
    ) {

      case "X":

        return normalizedAxis(
          basis.xAxis,
        );


      case "Y":

        return normalizedAxis(
          basis.yAxis,
        );


      case "Z":

        return normalizedAxis(
          basis.zAxis,
        );

    }

  }


  private readonly handlePointerEnter =
    (): void => {

      this.pointerInside =
        true;


      this.updateIndicatorPosition();

  };


  private readonly handlePointerLeave =
    (): void => {

      this.pointerInside =
        false;

  };


  private readonly handleKeyDown =
    (
      event:
        KeyboardEvent,
    ): void => {

      if (
        this.disposed
        || !this.pointerInside
        || event.key !== "F8"
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isEditableKeyboardTarget(
          event.target,
        )
      ) {

        return;

      }


      event.preventDefault();


      this.toggle();

  };


  private updateIndicator():
    void {

    this.indicator.textContent =
      this.enabled
        ? "ORTO F8 · ON"
        : "ORTO F8 · OFF";


    this.indicator.style.opacity =
      this.enabled
        ? "1"
        : "0.68";

  }


  private readonly updateIndicatorPosition =
    (): void => {

      if (
        this.disposed
      ) {

        return;

      }


      const rect =
        this.domElement
          .getBoundingClientRect();


      const visible =
        rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth;


      this.indicator.style.display =
        visible
          ? "block"
          : "none";


      if (
        !visible
      ) {

        return;

      }


      this.indicator.style.left =
        `${Math.max(
          8,
          rect.left + 12,
        )}px`;


      this.indicator.style.top =
        `${Math.max(
          8,
          rect.bottom - 34,
        )}px`;

  };


  dispose():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.listeners.clear();


    this.domElement.removeEventListener(
      "pointerenter",
      this.handlePointerEnter,
    );

    this.domElement.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );


    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    window.removeEventListener(
      "resize",
      this.updateIndicatorPosition,
    );

    window.removeEventListener(
      "scroll",
      this.updateIndicatorPosition,
      true,
    );


    this.indicator.remove();

  }

}


const controllerByElement =
  new WeakMap<
    HTMLElement,
    DesignOrthoController
  >();


export function getDesignOrthoController(
  domElement:
    HTMLElement,
): DesignOrthoController {

  const existing =
    controllerByElement.get(
      domElement,
    );


  if (
    existing
  ) {

    return existing;

  }


  const controller =
    new DesignOrthoController(
      domElement,
    );


  controllerByElement.set(
    domElement,
    controller,
  );


  return controller;

}


export function disposeDesignOrthoController(
  domElement:
    HTMLElement,
): void {

  const controller =
    controllerByElement.get(
      domElement,
    );


  if (
    !controller
  ) {

    return;

  }


  controllerByElement.delete(
    domElement,
  );


  controller.dispose();

}
