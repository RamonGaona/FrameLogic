interface MouseButtonsConfig {
  left: number;
  middle: number;
  right: number;
  wheel: number;
}

interface CameraControlsLike {
  readonly mouseButtons: MouseButtonsConfig;
}

interface Options {
  readonly canvas: HTMLElement;
  readonly controls: CameraControlsLike;
}

interface PendingContextMenu {
  readonly target: EventTarget | null;
  readonly clientX: number;
  readonly clientY: number;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

const CAMERA_ACTION_NONE = 0;
const CAMERA_ACTION_ROTATE = 1;
const CAMERA_ACTION_TRUCK = 2;
const RIGHT_BUTTON_MASK = 2;
const RIGHT_DRAG_THRESHOLD_PX = 4;

/**
 * ProjectionManager de That Open sobrescribe `mouseButtons.middle` cada vez
 * que cambia ORTHOGRAPHIC/PERSPECTIVE (ZOOM/DOLLY). Restablecer esta politica
 * conserva la orbita CAD con la rueda presionada en ambas proyecciones.
 * No tocar `wheel`: la rueda girada debe conservar el zoom propio del modo.
 */
export function restoreCadMouseNavigationBindings(
  controls: CameraControlsLike,
): void {
  controls.mouseButtons.left = CAMERA_ACTION_NONE;
  controls.mouseButtons.middle = CAMERA_ACTION_ROTATE;
  controls.mouseButtons.right = CAMERA_ACTION_TRUCK;
}

/**
 * Navegación CAD del Model Space.
 *
 * - izquierdo: reservado para selección / comandos CAD;
 * - rueda presionada: orbitar;
 * - derecho presionado + arrastre: pan/truck;
 * - rueda girada: conserva el zoom configurado por CameraControls.
 *
 * Un clic derecho corto sigue llegando a los menús contextuales. Cuando el
 * botón derecho se arrastra, el `contextmenu` nativo se suprime para evitar
 * que aparezca un menú al terminar el paneo.
 */
export class CadMouseNavigationController {
  private readonly canvas: HTMLElement;
  private readonly controls: CameraControlsLike;
  private readonly previousButtons: MouseButtonsConfig;

  private rightPointerId: number | null = null;
  private rightStartX = 0;
  private rightStartY = 0;
  private rightDragged = false;
  private suppressNextContextMenu = false;
  private pendingContextMenu: PendingContextMenu | null = null;
  private replayingContextMenu = false;
  private disposed = false;

  constructor(options: Options) {
    this.canvas = options.canvas;
    this.controls = options.controls;
    this.previousButtons = {
      left: options.controls.mouseButtons.left,
      middle: options.controls.mouseButtons.middle,
      right: options.controls.mouseButtons.right,
      wheel: options.controls.mouseButtons.wheel,
    };

    restoreCadMouseNavigationBindings(options.controls);

    this.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.canvas.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.canvas.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.canvas.addEventListener(
      "pointercancel",
      this.handlePointerCancel,
      true,
    );
    this.canvas.addEventListener(
      "contextmenu",
      this.handleContextMenu,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.controls.mouseButtons.left = this.previousButtons.left;
    this.controls.mouseButtons.middle = this.previousButtons.middle;
    this.controls.mouseButtons.right = this.previousButtons.right;
    this.controls.mouseButtons.wheel = this.previousButtons.wheel;

    this.canvas.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.canvas.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.canvas.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.canvas.removeEventListener(
      "pointercancel",
      this.handlePointerCancel,
      true,
    );
    this.canvas.removeEventListener(
      "contextmenu",
      this.handleContextMenu,
      true,
    );
  }

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (event.button !== 2) return;

    this.rightPointerId = event.pointerId;
    this.rightStartX = event.clientX;
    this.rightStartY = event.clientY;
    this.rightDragged = false;
    this.suppressNextContextMenu = false;
    this.pendingContextMenu = null;
  };

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    if (
      this.rightPointerId !== event.pointerId
      || (event.buttons & RIGHT_BUTTON_MASK) === 0
      || this.rightDragged
    ) {
      return;
    }

    const dx = event.clientX - this.rightStartX;
    const dy = event.clientY - this.rightStartY;

    if (
      (dx * dx) + (dy * dy)
      >= RIGHT_DRAG_THRESHOLD_PX * RIGHT_DRAG_THRESHOLD_PX
    ) {
      this.rightDragged = true;
      this.pendingContextMenu = null;
    }
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      event.button !== 2
      || this.rightPointerId !== event.pointerId
    ) {
      return;
    }

    if (this.rightDragged) {
      this.suppressNextContextMenu = true;
      window.setTimeout(
        () => {
          this.suppressNextContextMenu = false;
        },
        300,
      );
    }
    else if (this.pendingContextMenu) {
      this.replayContextMenu(this.pendingContextMenu);
    }

    this.rightPointerId = null;
    this.pendingContextMenu = null;
    this.rightDragged = false;
  };

  private readonly handlePointerCancel = (
    event: PointerEvent,
  ): void => {
    if (this.rightPointerId !== event.pointerId) return;

    this.rightPointerId = null;
    this.pendingContextMenu = null;
    this.rightDragged = false;
    this.suppressNextContextMenu = false;
  };

  private readonly handleContextMenu = (
    event: MouseEvent,
  ): void => {
    if (this.replayingContextMenu) {
      return;
    }

    if (this.rightPointerId !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (!this.rightDragged) {
        this.pendingContextMenu = {
          target: event.target,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        };
      }
      return;
    }

    if (this.suppressNextContextMenu) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressNextContextMenu = false;
    }
  };

  private replayContextMenu(
    pending: PendingContextMenu,
  ): void {
    const target = pending.target;
    if (!(target instanceof Element)) return;

    this.replayingContextMenu = true;
    try {
      target.dispatchEvent(
        new MouseEvent(
          "contextmenu",
          {
            bubbles: true,
            cancelable: true,
            clientX: pending.clientX,
            clientY: pending.clientY,
            button: 2,
            buttons: 0,
            ctrlKey: pending.ctrlKey,
            shiftKey: pending.shiftKey,
            altKey: pending.altKey,
            metaKey: pending.metaKey,
          },
        ),
      );
    }
    finally {
      this.replayingContextMenu = false;
    }
  }
}
