import * as THREE from "three";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


interface DimensionEntry {
  readonly group:
    THREE.Group;

  readonly label:
    HTMLDivElement;

  readonly labelPoint:
    THREE.Vector3;
}


export interface ModelSpaceDimensionControllerOptions {
  readonly container:
    HTMLElement;

  readonly domElement:
    HTMLElement;

  readonly scene:
    THREE.Scene;

  readonly cameraProvider:
    () => THREE.Camera;

  readonly snap:
    DesignSnapController;

  readonly workPlane:
    CadWorkPlaneController;

  readonly designSelection:
    DesignSelectionController;

  readonly pointSelection:
    CadPointSelectionController;

  readonly lineSelection:
    CadLineSelectionController;

  readonly beforeActivate?:
    () => void;
}


const DIMENSION_COLOR =
  0x72e6ff;


export class ModelSpaceDimensionController {
  private readonly container:
    HTMLElement;

  private readonly domElement:
    HTMLElement;

  private readonly scene:
    THREE.Scene;

  private readonly cameraProvider:
    () => THREE.Camera;

  private readonly snap:
    DesignSnapController;

  private readonly workPlane:
    CadWorkPlaneController;

  private readonly designSelection:
    DesignSelectionController;

  private readonly pointSelection:
    CadPointSelectionController;

  private readonly lineSelection:
    CadLineSelectionController;

  private readonly beforeActivate:
    (() => void)
    | null;

  private readonly lineMaterial =
    new THREE.LineBasicMaterial({
      color:
        DIMENSION_COLOR,
      depthTest:
        false,
      depthWrite:
        false,
      transparent:
        true,
      opacity:
        0.95,
    });

  private readonly pointMaterial =
    new THREE.PointsMaterial({
      color:
        DIMENSION_COLOR,
      size:
        7,
      sizeAttenuation:
        false,
      depthTest:
        false,
      depthWrite:
        false,
    });

  private readonly previewMaterial =
    new THREE.LineDashedMaterial({
      color:
        DIMENSION_COLOR,
      dashSize:
        30,
      gapSize:
        18,
      depthTest:
        false,
      depthWrite:
        false,
      transparent:
        true,
      opacity:
        0.9,
    });

  private readonly preview:
    THREE.Line;

  private readonly previewLabel:
    HTMLDivElement;

  private readonly dimensions:
    DimensionEntry[] =
      [];

  private firstPoint:
    THREE.Vector3
    | null =
      null;

  private previewPoint:
    THREE.Vector3
    | null =
      null;

  private button:
    HTMLButtonElement
    | null =
      null;

  private toolbar:
    HTMLElement
    | null =
      null;

  private toolbarObserver:
    MutationObserver
    | null =
      null;

  private documentObserver:
    MutationObserver
    | null =
      null;

  private active =
    false;

  private disposed =
    false;

  private previousSnapEnabled =
    true;

  private pointerDownX =
    0;

  private pointerDownY =
    0;

  private pointerDownActive =
    false;

  private animationFrame:
    number
    | null =
      null;


  constructor(
    options:
      ModelSpaceDimensionControllerOptions,
  ) {
    this.container =
      options.container;
    this.domElement =
      options.domElement;
    this.scene =
      options.scene;
    this.cameraProvider =
      options.cameraProvider;
    this.snap =
      options.snap;
    this.workPlane =
      options.workPlane;
    this.designSelection =
      options.designSelection;
    this.pointSelection =
      options.pointSelection;
    this.lineSelection =
      options.lineSelection;
    this.beforeActivate =
      options.beforeActivate
      ?? null;

    this.preview =
      new THREE.Line(
        new THREE.BufferGeometry(),
        this.previewMaterial,
      );
    this.preview.name =
      "FrameLogicModelDimensionPreview";
    this.preview.visible =
      false;
    this.preview.renderOrder =
      2100;
    this.scene.add(
      this.preview,
    );

    this.previewLabel =
      this.createLabel();
    this.previewLabel.style.display =
      "none";
    this.previewLabel.style.opacity =
      "0.82";

    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.domElement.addEventListener(
      "contextmenu",
      this.handleContextMenu,
      true,
    );

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    document.addEventListener(
      "click",
      this.handleDocumentClick,
      true,
    );

    this.installButton();
    this.scheduleLabelSync();
  }


  get isActive():
    boolean {
    return this.active;
  }


  activate(): void {
    if (
      this.disposed
      || this.active
    ) {
      return;
    }

    this.beforeActivate?.();

    this.active =
      true;
    this.firstPoint =
      null;
    this.previewPoint =
      null;
    this.pointerDownActive =
      false;
    this.hidePreview();

    this.previousSnapEnabled =
      this.snap.isEnabled;
    this.snap.setEnabled(
      true,
    );

    this.designSelection.setEnabled(
      false,
    );
    this.pointSelection.setEnabled(
      false,
    );
    this.lineSelection.setEnabled(
      false,
    );

    this.syncButton();
  }


  deactivate(): void {
    if (
      !this.active
    ) {
      return;
    }

    this.active =
      false;
    this.firstPoint =
      null;
    this.previewPoint =
      null;
    this.pointerDownActive =
      false;
    this.hidePreview();

    this.snap.setEnabled(
      this.previousSnapEnabled,
    );

    this.designSelection.setEnabled(
      true,
    );
    this.pointSelection.setEnabled(
      true,
    );
    this.lineSelection.setEnabled(
      true,
    );

    this.syncButton();
  }


  clear(): void {
    for (
      const dimension
      of this.dimensions
    ) {
      this.scene.remove(
        dimension.group,
      );
      this.disposeObjectGeometry(
        dimension.group,
      );
      dimension.label.remove();
    }

    this.dimensions.length =
      0;
    this.firstPoint =
      null;
    this.previewPoint =
      null;
    this.hidePreview();
    this.syncButton();
  }


  private readonly handlePointerDown = (
    event:
      PointerEvent,
  ): void => {
    if (
      !this.active
    ) {
      return;
    }

    if (
      event.button === 2
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.deactivate();
      return;
    }

    if (
      event.button !== 0
    ) {
      return;
    }

    this.pointerDownX =
      event.clientX;
    this.pointerDownY =
      event.clientY;
    this.pointerDownActive =
      true;
  };


  private readonly handlePointerUp = (
    event:
      PointerEvent,
  ): void => {
    if (
      !this.active
      || event.button !== 0
      || !this.pointerDownActive
    ) {
      return;
    }

    this.pointerDownActive =
      false;

    const movement =
      Math.hypot(
        event.clientX
          - this.pointerDownX,
        event.clientY
          - this.pointerDownY,
      );

    if (
      movement > 5
    ) {
      return;
    }

    const snap =
      this.snap.findSnap(
        event.clientX,
        event.clientY,
      );

    if (
      !snap
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const point =
      snap.point.clone();

    if (
      !this.firstPoint
    ) {
      this.firstPoint =
        point;
      this.previewPoint =
        null;
      this.hidePreview();
      this.syncButton();
      return;
    }

    if (
      this.firstPoint.distanceToSquared(
        point,
      ) <= 1e-8
    ) {
      return;
    }

    this.createDimension(
      this.firstPoint,
      point,
    );

    this.firstPoint =
      null;
    this.previewPoint =
      null;
    this.hidePreview();
    this.syncButton();
  };


  private readonly handlePointerMove = (
    event:
      PointerEvent,
  ): void => {
    if (
      !this.active
      || !this.firstPoint
    ) {
      return;
    }

    const snap =
      this.snap.findSnap(
        event.clientX,
        event.clientY,
      );

    if (
      !snap
      || this.firstPoint.distanceToSquared(
          snap.point,
        ) <= 1e-8
    ) {
      this.previewPoint =
        null;
      this.hidePreview();
      return;
    }

    this.previewPoint =
      snap.point.clone();
    this.updatePreview(
      this.firstPoint,
      this.previewPoint,
    );
  };


  private readonly handleContextMenu = (
    event:
      MouseEvent,
  ): void => {
    if (
      !this.active
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  };


  private readonly handleKeyDown = (
    event:
      KeyboardEvent,
  ): void => {
    if (
      !this.active
    ) {
      return;
    }

    if (
      event.key === "Escape"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.deactivate();
      return;
    }

    if (
      event.ctrlKey
      || event.metaKey
      || event.altKey
    ) {
      return;
    }

    const key =
      event.key.toLowerCase();

    if (
      key === "p"
      || key === "l"
      || key === "m"
      || key === "r"
      || event.key === "Delete"
    ) {
      this.deactivate();
    }
  };


  private readonly handleDocumentClick = (
    event:
      MouseEvent,
  ): void => {
    if (
      !this.active
      || !(event.target instanceof Element)
    ) {
      return;
    }

    const clickedButton =
      event.target.closest(
        "button",
      );

    if (
      clickedButton
      && clickedButton !== this.button
    ) {
      this.deactivate();
    }
  };


  private createDimension(
    start:
      THREE.Vector3,
    end:
      THREE.Vector3,
  ): void {
    const distance =
      start.distanceTo(
        end,
      );

    const direction =
      end.clone()
        .sub(
          start,
        );

    const offsetDirection =
      this.getOffsetDirection(
        direction,
      );

    const offsetDistance =
      THREE.MathUtils.clamp(
        distance * 0.08,
        25,
        250,
      );

    const offset =
      offsetDirection.multiplyScalar(
        offsetDistance,
      );

    const dimensionStart =
      start.clone()
        .add(
          offset,
        );
    const dimensionEnd =
      end.clone()
        .add(
          offset,
        );

    const group =
      new THREE.Group();
    group.name =
      "FrameLogicModelDimension";
    group.renderOrder =
      2000;

    group.add(
      this.createLine(
        start,
        dimensionStart,
      ),
      this.createLine(
        end,
        dimensionEnd,
      ),
      this.createLine(
        dimensionStart,
        dimensionEnd,
      ),
      this.createEndpointPoints(
        dimensionStart,
        dimensionEnd,
      ),
    );

    this.scene.add(
      group,
    );

    const label =
      this.createLabel();
    label.textContent =
      this.formatDistance(
        distance,
      );

    const labelPoint =
      dimensionStart.clone()
        .lerp(
          dimensionEnd,
          0.5,
        );

    this.dimensions.push({
      group,
      label,
      labelPoint,
    });

    this.syncLabel(
      label,
      labelPoint,
    );
  }


  private getOffsetDirection(
    dimensionDirection:
      THREE.Vector3,
  ): THREE.Vector3 {
    const direction =
      dimensionDirection.clone()
        .normalize();

    const workPlaneState =
      this.workPlane.getState();

    const referenceNormal =
      workPlaneState.enabled
        ? workPlaneState.normal.clone()
        : this.getCameraDirection();

    let offsetDirection =
      referenceNormal
        .cross(
          direction,
        );

    if (
      offsetDirection.lengthSq()
      <= 1e-12
    ) {
      offsetDirection =
        this.cameraProvider()
          .up
          .clone()
          .cross(
            direction,
          );
    }

    if (
      offsetDirection.lengthSq()
      <= 1e-12
    ) {
      offsetDirection =
        new THREE.Vector3(
          0,
          0,
          1,
        )
          .cross(
            direction,
          );
    }

    if (
      offsetDirection.lengthSq()
      <= 1e-12
    ) {
      offsetDirection =
        new THREE.Vector3(
          0,
          1,
          0,
        );
    }

    return offsetDirection.normalize();
  }


  private getCameraDirection():
    THREE.Vector3 {
    const direction =
      new THREE.Vector3();
    this.cameraProvider()
      .getWorldDirection(
        direction,
      );

    if (
      direction.lengthSq()
      <= 1e-12
    ) {
      direction.set(
        0,
        0,
        -1,
      );
    }

    return direction.normalize();
  }


  private createLine(
    start:
      THREE.Vector3,
    end:
      THREE.Vector3,
  ): THREE.Line {
    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints([
          start,
          end,
        ]);

    const line =
      new THREE.Line(
        geometry,
        this.lineMaterial,
      );
    line.renderOrder =
      2000;
    return line;
  }


  private createEndpointPoints(
    start:
      THREE.Vector3,
    end:
      THREE.Vector3,
  ): THREE.Points {
    const geometry =
      new THREE.BufferGeometry()
        .setFromPoints([
          start,
          end,
        ]);

    const points =
      new THREE.Points(
        geometry,
        this.pointMaterial,
      );
    points.renderOrder =
      2001;
    return points;
  }


  private updatePreview(
    start:
      THREE.Vector3,
    end:
      THREE.Vector3,
  ): void {
    this.preview.geometry.dispose();
    this.preview.geometry =
      new THREE.BufferGeometry()
        .setFromPoints([
          start,
          end,
        ]);
    this.preview.computeLineDistances();
    this.preview.visible =
      true;

    this.previewLabel.textContent =
      this.formatDistance(
        start.distanceTo(
          end,
        ),
      );
    this.previewLabel.style.display =
      "block";

    const midpoint =
      start.clone()
        .lerp(
          end,
          0.5,
        );
    this.syncLabel(
      this.previewLabel,
      midpoint,
    );
  }


  private hidePreview(): void {
    this.preview.visible =
      false;
    this.previewLabel.style.display =
      "none";
  }


  private createLabel():
    HTMLDivElement {
    const label =
      document.createElement(
        "div",
      );

    Object.assign(
      label.style,
      {
        position:
          "fixed",
        zIndex:
          "1600",
        pointerEvents:
          "none",
        transform:
          "translate(-50%, -140%)",
        padding:
          "3px 7px",
        border:
          "1px solid rgba(114, 230, 255, 0.9)",
        borderRadius:
          "3px",
        background:
          "rgba(8, 18, 24, 0.92)",
        color:
          "#dff9ff",
        font:
          "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        lineHeight:
          "1.2",
        whiteSpace:
          "nowrap",
        boxShadow:
          "0 1px 5px rgba(0,0,0,0.4)",
        userSelect:
          "none",
      },
    );

    document.body.append(
      label,
    );
    return label;
  }


  private syncLabel(
    label:
      HTMLDivElement,
    point:
      THREE.Vector3,
  ): void {
    const rect =
      this.domElement
        .getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      label.style.display =
        "none";
      return;
    }

    const projected =
      point.clone()
        .project(
          this.cameraProvider(),
        );

    if (
      !Number.isFinite(
        projected.x,
      )
      || !Number.isFinite(
        projected.y,
      )
      || projected.z < -1
      || projected.z > 1
    ) {
      label.style.display =
        "none";
      return;
    }

    label.style.left =
      `${
        rect.left
        + (
            projected.x + 1
          )
          * 0.5
          * rect.width
      }px`;
    label.style.top =
      `${
        rect.top
        + (
            1 - projected.y
          )
          * 0.5
          * rect.height
      }px`;

    if (
      label !== this.previewLabel
      || this.preview.visible
    ) {
      label.style.display =
        "block";
    }
  }


  private scheduleLabelSync(): void {
    const tick =
      (): void => {
        if (
          this.disposed
        ) {
          return;
        }

        for (
          const dimension
          of this.dimensions
        ) {
          this.syncLabel(
            dimension.label,
            dimension.labelPoint,
          );
        }

        if (
          this.preview.visible
          && this.firstPoint
          && this.previewPoint
        ) {
          const midpoint =
            this.firstPoint.clone()
              .lerp(
                this.previewPoint,
                0.5,
              );
          this.syncLabel(
            this.previewLabel,
            midpoint,
          );
        }

        this.animationFrame =
          window.requestAnimationFrame(
            tick,
          );
      };

    this.animationFrame =
      window.requestAnimationFrame(
        tick,
      );
  }


  private formatDistance(
    distance:
      number,
  ): string {
    return `${
      distance.toLocaleString(
        "es-CO",
        {
          minimumFractionDigits:
            0,
          maximumFractionDigits:
            2,
        },
      )
    } mm`;
  }


  private installButton(): void {
    const ensureButton =
      (): void => {
        if (
          this.disposed
        ) {
          return;
        }

        const toolbar =
          this.container.parentElement
            ?.querySelector<HTMLElement>(
              ".bim-toolbar",
            )
          ?? document.querySelector<HTMLElement>(
              ".bim-toolbar",
            );

        if (
          !toolbar
        ) {
          return;
        }

        if (
          this.toolbar !== toolbar
        ) {
          this.toolbarObserver?.disconnect();
          this.toolbar =
            toolbar;
          this.toolbarObserver =
            new MutationObserver(
              () => {
                this.ensureButtonInToolbar();
              },
            );
          this.toolbarObserver.observe(
            toolbar,
            {
              childList:
                true,
            },
          );
        }

        this.ensureButtonInToolbar();
      };

    ensureButton();

    this.documentObserver =
      new MutationObserver(
        ensureButton,
      );
    this.documentObserver.observe(
      document.body,
      {
        childList:
          true,
        subtree:
          true,
      },
    );
  }


  private ensureButtonInToolbar(): void {
    const toolbar =
      this.toolbar;

    if (
      !toolbar
    ) {
      return;
    }

    if (
      !this.button
    ) {
      const button =
        document.createElement(
          "button",
        );
      button.type =
        "button";
      button.dataset[
        "framelogicModelDimensionButton"
      ] =
        "true";
      button.title =
        "COTA · selecciona dos SNAPs para crear una cota lineal en Model Space";
      button.addEventListener(
        "click",
        this.handleButtonClick,
      );
      this.button =
        button;
      this.syncButton();
    }

    if (
      this.button.parentElement
      === toolbar
    ) {
      return;
    }

    const lineButton =
      Array.from(
        toolbar.querySelectorAll(
          "button",
        ),
      ).find(
        (
          candidate,
        ) =>
          candidate.textContent
            ?.trim()
          === "LINE",
      );

    if (
      lineButton
    ) {
      lineButton.insertAdjacentElement(
        "afterend",
        this.button,
      );
    }
    else {
      toolbar.append(
        this.button,
      );
    }
  }


  private readonly handleButtonClick =
    (): void => {
      if (
        this.active
      ) {
        this.deactivate();
      }
      else {
        this.activate();
      }
    };


  private syncButton(): void {
    if (
      !this.button
    ) {
      return;
    }

    this.button.textContent =
      !this.active
        ? "COTA"
        : this.firstPoint
          ? "COTA · P2"
          : "COTA · P1";

    this.button.setAttribute(
      "aria-pressed",
      this.active
        ? "true"
        : "false",
    );

    this.button.style.background =
      this.active
        ? "rgba(45, 155, 190, 0.32)"
        : "";
    this.button.style.borderColor =
      this.active
        ? "rgba(114, 230, 255, 0.92)"
        : "";
  }


  private disposeObjectGeometry(
    object:
      THREE.Object3D,
  ): void {
    object.traverse(
      (
        child,
      ) => {
        if (
          child instanceof THREE.Line
          || child instanceof THREE.Points
        ) {
          child.geometry.dispose();
        }
      },
    );
  }


  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.deactivate();
    this.disposed =
      true;

    if (
      this.animationFrame !== null
    ) {
      window.cancelAnimationFrame(
        this.animationFrame,
      );
      this.animationFrame =
        null;
    }

    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.domElement.removeEventListener(
      "contextmenu",
      this.handleContextMenu,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    document.removeEventListener(
      "click",
      this.handleDocumentClick,
      true,
    );

    this.toolbarObserver?.disconnect();
    this.documentObserver?.disconnect();
    this.toolbarObserver =
      null;
    this.documentObserver =
      null;

    this.button?.removeEventListener(
      "click",
      this.handleButtonClick,
    );
    this.button?.remove();
    this.button =
      null;

    this.clear();

    this.scene.remove(
      this.preview,
    );
    this.preview.geometry.dispose();
    this.previewLabel.remove();

    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
    this.previewMaterial.dispose();
  }
}
