import { installTransformPointerLifecycle } from "./TransformGizmoReliability";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";
import type { CadReferenceBlockController } from "../import/CadReferenceBlockController";
import type { CadSelectionState } from "./CadUnifiedSelectionController";
import * as THREE from "three";

import {
  TransformControls,
} from "three/addons/controls/TransformControls.js";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  MoveNumericAxis,
} from "./CadNumericInputController";

import type {
  CadUnifiedSelectionController,
} from "./CadUnifiedSelectionController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


interface PieceMoveState {

  readonly position: {
    x: number;
    y: number;
    z: number;
  };

  readonly rotation: {
    x: number;
    y: number;
    z: number;
  };

}


interface PointMoveState {

  readonly x: number;
  readonly y: number;
  readonly z: number;

}


interface LineMoveState {

  readonly start: PointMoveState;

  readonly end: PointMoveState;

}


interface MixedMoveSnapshot {

  readonly pieces:
    Map<
      string,
      PieceMoveState
    >;

  readonly points:
    Map<
      string,
      PointMoveState
    >;

  readonly lines:
    Map<
      string,
      LineMoveState
    >;

}


export class CadMixedMoveController {
  private readonly releasePointerLifecycle: () => void;

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly pointScene:
    CadPointSceneController;


  private readonly lineScene:
    CadLineSceneController;


  private readonly selection:
    CadUnifiedSelectionController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly history:
    CadHistoryController;


  private readonly snap:
    DesignSnapController;


  private readonly setCameraEnabled:
    (
      enabled: boolean,
    ) => void;


  private readonly controls:
    TransformControls;


  private readonly helper:
    THREE.Object3D;


  private readonly pivot =
    new THREE.Object3D();


  private readonly previousPivot =
    new THREE.Vector3();


  private readonly dragStartPivot =
    new THREE.Vector3();


  private armedMoveAxis:
    MoveNumericAxis
    | null =
      null;


  private armedPivot =
    false;

  private armedCopy = false;
  private ctrlAtStart = false;
  private draggingCopy = false;
  private readonly handleCopyPointerDown = (event: PointerEvent): void => {
    // Window capture runs BEFORE the native Three.js gizmo listener. Read Ctrl
    // before TransformControls emits mouseDown; otherwise Ctrl+axis can move.
    const target = event.target;
    if (this.active && event.button === 0 && (
      !target || target === this.domElement
      || (target instanceof Node && this.domElement.contains(target))
    )) this.ctrlAtStart = event.ctrlKey;
  };
  private copySelectionAtOffset: ((offset: THREE.Vector3) => number) | null = null;
  private referenceController: CadReferenceBlockController | null = null;
  private referenceNames: readonly string[] = [];

  setMixedCopyHandler(handler: (delta: THREE.Vector3) => number): void {
    this.copySelectionAtOffset = handler;
  }

  private combinedState(): CadSelectionState {
    const base = this.selection.getState();
    if (!this.referenceNames.length) return base;
    const layerIds = new Set(this.designModel.layers.getAll()
      .filter(layer => this.referenceNames.some(
        name => layer.name.startsWith(`CAD ${name} · `),
      )).map(layer => layer.id));
    const lines = new Set(base.lineIds);
    const points = new Set(base.pointIds);
    for (const line of this.designModel.cadLines.getAll()) {
      if (layerIds.has(line.layerId)) lines.add(line.id);
    }
    for (const point of this.designModel.cadPoints.getAll()) {
      if (layerIds.has(point.layerId)) points.add(point.id);
    }
    return {
      ...base,
      lineIds: [...lines],
      pointIds: [...points],
      items: [
        ...base.items,
        ...[...lines].filter(id => !base.lineIds.includes(id))
          .map(id => ({ type: "LINE" as const, id })),
        ...[...points].filter(id => !base.pointIds.includes(id))
          .map(id => ({ type: "POINT" as const, id })),
      ],
      selectedTypeCount: base.selectedTypeCount + Number(this.referenceNames.length > 0),
    };
  }

  private isReferenceLayer(layerId: string): boolean {
    const layer = this.designModel.layers.get(layerId);
    return Boolean(layer && this.referenceNames.some(
      name => layer.name.startsWith(`CAD ${name} · `),
    ));
  }


  private armedPointerDownX =
    0;


  private armedPointerDownY =
    0;


  private armedPointerDownActive =
    false;


  private dragStart:
    MixedMoveSnapshot
    | null =
      null;


  private active =
    false;


  private disposed =
    false;


  private currentAxis:
    string
    | null =
      null;


  private onNumericAxis:
    (
      axis:
        MoveNumericAxis,
    ) => void =
      () => {};


  constructor(
    scene:
      THREE.Scene,

    camera:
      THREE.Camera,

    domElement:
      HTMLElement,

    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    pointScene:
      CadPointSceneController,

    lineScene:
      CadLineSceneController,

    selection:
      CadUnifiedSelectionController,

    designSelection:
      DesignSelectionController,

    history:
      CadHistoryController,

    snap:
      DesignSnapController,

    setCameraEnabled:
      (
        enabled: boolean,
      ) => void,
  ) {

    this.scene =
      scene;


    this.domElement =
      domElement;


    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.pointScene =
      pointScene;


    this.lineScene =
      lineScene;


    this.selection =
      selection;


    this.designSelection =
      designSelection;


    this.history =
      history;


    this.snap =
      snap;


    this.setCameraEnabled =
      setCameraEnabled;


    this.controls =
      new TransformControls(
        camera,
        domElement,
      );

    this.releasePointerLifecycle = installTransformPointerLifecycle(domElement, this.controls);


    this.controls.setMode(
      "translate",
    );


    this.controls.setSpace(
      "world",
    );


    this.controls.size =
      1.8;


    this.helper =
      this.controls.getHelper();


    this.scene.add(
      this.helper,
    );


    this.pivot.name =
      "FrameLogicCadMixedMovePivot";


    this.scene.add(
      this.pivot,
    );


    window.addEventListener("pointerdown", this.handleCopyPointerDown, true);
    this.controls.addEventListener(
      "mouseDown",
      this.handleMoveStart,
    );


    this.controls.addEventListener(
      "objectChange",
      this.handleMoveChange,
    );


    this.controls.addEventListener(
      "mouseUp",
      this.handleMoveEnd,
    );


    window.addEventListener(
      "pointerdown",
      this.handleArmedPointerDown,
      true,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handleArmedPointerUp,
      true,
    );


    this.controls.detach();

  }


  get isActive():
    boolean {

    return this.active;

  }


  setCamera(
    camera:
      THREE.Camera,
  ):
    void {

    this.controls.camera =
      camera;

  }


  setNumericAxisHandler(
    handler:
      (
        axis:
          MoveNumericAxis,
      ) => void,
  ):
    void {

    this.onNumericAxis =
      handler;

  }


  activate():
    boolean {

    const reference = getActiveCadReferenceBlockController();
    const names = reference?.getSelectedReferenceNames() ?? [];
    const base = this.selection.getState();
    const sources = Number(base.pieceIds.length > 0)
      + Number(base.pointIds.length > 0)
      + Number(base.lineIds.length > 0)
      + Number(names.length > 0);
    this.referenceNames = [...names];
    if (
      this.disposed
      || sources < 1
      || !this.canMoveSelection()
    ) {

      this.deactivate();

      return false;

    }


    this.active =
      true;
    this.referenceController = names.length ? reference : null;
    this.referenceController?.setInteractionEnabled(false);
    this.armedCopy = false;
    this.draggingCopy = false;

    this.armedMoveAxis =
      null;


    this.armedPivot =
      false;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();


    this.resetPivot();


    this.controls.attach(
      this.pivot,
    );


    this.selection.setEnabled(
      false,
    );


    return true;

  }


  deactivate():
    void {
    if (this.controls.dragging) {
      this.controls.reset();
      this.controls.pointerUp(null);
    }


    this.active =
      false;
    this.referenceController?.setInteractionEnabled(true);
    this.referenceController = null;
    this.referenceNames = [];
    this.armedCopy = false;
    this.draggingCopy = false;
    this.ctrlAtStart = false;

    this.dragStart =
      null;


    this.currentAxis =
      null;


    this.armedMoveAxis =
      null;


    this.armedPivot =
      false;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();


    this.controls.detach();


    this.setCameraEnabled(
      true,
    );


    this.selection.setEnabled(
      true,
    );

  }


  applyNumericMove(
    axis:
      MoveNumericAxis,

    first:
      number,

    second = 0,
  ):
    boolean {

    if (
      !this.active
    ) {

      return false;

    }


    this.clearArmedSnap();


    const before =
      this.capture();


    const delta =
      new THREE.Vector3();


    switch (
      axis
    ) {

      case "X":

        delta.set(
          first,
          0,
          0,
        );

        break;


      case "Y":

        delta.set(
          0,
          first,
          0,
        );

        break;


      case "Z":

        delta.set(
          0,
          0,
          first,
        );

        break;


      case "XY":

        delta.set(
          first,
          second,
          0,
        );

        break;


      case "XZ":

        delta.set(
          first,
          0,
          second,
        );

        break;


      case "YZ":

        delta.set(
          0,
          first,
          second,
        );

        break;

    }


    this.applyDelta(
      delta,
    );


    this.pivot.position.add(
      delta,
    );


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivot.copy(
      this.pivot.position,
    );


    this.recordMove(
      before,
    );


    return true;

  }


  private canMoveSelection():
    boolean {

    const state =
      this.combinedState();


    for (
      const instanceId
      of state.pieceIds
    ) {

      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      if (
        !instance
      ) {

        return false;

      }


      const layer =
        this.designModel
          .layers
          .get(
            instance.layerId,
          );


      if (
        layer?.visible === false
        || layer?.locked === true
      ) {

        return false;

      }

    }


    for (
      const pointId
      of state.pointIds
    ) {

      const point =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !point
      ) {

        return false;

      }


      const layer =
        this.designModel
          .layers
          .get(
            point.layerId,
          );


      if ((layer?.visible === false || layer?.locked === true)
          && !this.isReferenceLayer(point.layerId)) {

        return false;

      }

    }


    for (
      const lineId
      of state.lineIds
    ) {

      const line =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !line
      ) {

        return false;

      }


      const layer =
        this.designModel
          .layers
          .get(
            line.layerId,
          );


      if ((layer?.visible === false || layer?.locked === true)
          && !this.isReferenceLayer(line.layerId)) {

        return false;

      }

    }


    return true;

  }


  private resetPivot():
    void {

    const state =
      this.combinedState();


    const center =
      new THREE.Vector3();


    let count =
      0;


    for (
      const instanceId
      of state.pieceIds
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !object
      ) {

        continue;

      }


      center.add(
        object.position,
      );


      count +=
        1;

    }


    for (
      const pointId
      of state.pointIds
    ) {

      const point =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !point
      ) {

        continue;

      }


      center.x +=
        point.position.x;

      center.y +=
        point.position.y;

      center.z +=
        point.position.z;


      count +=
        1;

    }


    for (
      const lineId
      of state.lineIds
    ) {

      const line =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !line
      ) {

        continue;

      }


      center.x +=
        (
          line.start.x
          + line.end.x
        )
        * 0.5;

      center.y +=
        (
          line.start.y
          + line.end.y
        )
        * 0.5;

      center.z +=
        (
          line.start.z
          + line.end.z
        )
        * 0.5;


      count +=
        1;

    }


    if (
      count > 0
    ) {

      center.multiplyScalar(
        1 / count,
      );

    }


    this.pivot.position.copy(
      center,
    );


    this.pivot.rotation.set(
      0,
      0,
      0,
    );


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivot.copy(
      center,
    );

  }


  private readonly handleMoveStart =
    ():
      void => {

      if (
        !this.active
      ) {

        return;

      }


      this.dragStart =
        this.capture();


      this.previousPivot.copy(
        this.pivot.position,
      );


      this.dragStartPivot.copy(
        this.pivot.position,
      );


      this.armedMoveAxis =
        null;
      this.armedCopy = false;
      this.draggingCopy = this.ctrlAtStart
        && this.controls.axis !== "XYZ"
        && Boolean(this.copySelectionAtOffset);

      this.armedPivot =
        false;


      this.armedPointerDownActive =
        false;


      this.snap.clearExcludedInstanceIds();


      this.currentAxis =
        this.controls.axis;


      const axis =
        this.currentAxis;


      if (
        axis === "X"
        || axis === "Y"
        || axis === "Z"
        || axis === "XY"
        || axis === "XZ"
        || axis === "YZ"
      ) {

        this.onNumericAxis(
          axis,
        );

      }


      this.setCameraEnabled(
        false,
      );

  };


  private readonly handleMoveChange =
    ():
      void => {

      if (
        !this.active
      ) {

        return;

      }


      const delta =
        this.pivot.position
          .clone()
          .sub(
            this.previousPivot,
          );


      if (
        delta.lengthSq()
        <= 1e-20
      ) {

        return;

      }


      /*
       * El centro XYZ ya no desplaza libremente el pivote.
       * Se conserva la posición inicial y al soltar queda
       * armado para que el siguiente clic sobre un SNAP
       * coloque el gizmo exactamente en ese punto 3D.
       */
      if (
        this.currentAxis
        === "XYZ"
      ) {

        this.pivot.position.copy(
          this.dragStartPivot,
        );


        this.pivot.updateMatrixWorld(
          true,
        );


        this.previousPivot.copy(
          this.dragStartPivot,
        );


        return;

      }


      if (!this.draggingCopy) this.applyDelta(delta);

      this.previousPivot.copy(
        this.pivot.position,
      );

  };


  private readonly handleMoveEnd =
    ():
      void => {

      if (
        !this.active
      ) {

        return;

      }


      this.setCameraEnabled(
        true,
      );


      const before =
        this.dragStart;


      const axis =
        this.currentAxis;


      const movedDistance =
        this.pivot.position
          .distanceTo(
            this.dragStartPivot,
          );


      const clickedAxis =
        (
          axis === "X"
          || axis === "Y"
          || axis === "Z"
          || axis === "XY"
          || axis === "XZ"
          || axis === "YZ"
        )
        && movedDistance
          <= 1e-9;


      const clickedPivot =
        axis === "XYZ"
        && movedDistance
          <= 1e-9;


      this.dragStart =
        null;


      this.currentAxis =
        null;


      if (
        clickedAxis
        && axis !== null
      ) {

        this.armedMoveAxis =
          axis as MoveNumericAxis;
        this.armedCopy = this.draggingCopy;
        this.draggingCopy = false;


        this.armedPivot =
          false;


        // Sin arrastre activo, los SNAP de la selección siguen disponibles.
        this.snap.clearExcludedInstanceIds();


        return;

      }


      if (
        clickedPivot
      ) {

        this.armedMoveAxis =
          null;


        this.armedPivot =
          true;


        /*
         * Para mover solo el punto base del gizmo,
         * sí permitimos SNAP sobre la propia selección.
         */
        this.snap.clearExcludedInstanceIds();


        return;

      }


      if (before && this.draggingCopy && movedDistance > 1e-9 && axis !== "XYZ") {
        try { this.copySelectionAtOffset?.(this.pivot.position.clone().sub(this.dragStartPivot)); }
        catch (error) { console.error("COPY MIXED:", error); }
        this.pivot.position.copy(this.dragStartPivot);
        this.pivot.updateMatrixWorld(true);
        this.previousPivot.copy(this.dragStartPivot);
        this.draggingCopy = false;
        this.clearArmedSnap();
        return;
      }
      this.draggingCopy = false;
      this.clearArmedSnap();


      if (
        !before
        || axis === "XYZ"
      ) {

        return;

      }


      this.recordMove(
        before,
      );

  };


  private readonly handleArmedPointerDown =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.active
        || (
          !this.armedMoveAxis
          && !this.armedPivot
        )
        || event.button !== 0
      ) {

        return;

      }


      const target = event.target;
      if (target && target !== this.domElement
        && !(target instanceof Node && this.domElement.contains(target))) return;
      this.armedPointerDownX =
        event.clientX;


      this.armedPointerDownY =
        event.clientY;


      this.armedPointerDownActive =
        true;
      event.preventDefault();
      event.stopImmediatePropagation();

  };


  private readonly handleArmedPointerUp =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.active
        || (
          !this.armedMoveAxis
          && !this.armedPivot
        )
        || event.button !== 0
        || !this.armedPointerDownActive
      ) {

        return;

      }


      this.armedPointerDownActive =
        false;


      const movement =
        Math.hypot(
          event.clientX
          - this.armedPointerDownX,
          event.clientY
          - this.armedPointerDownY,
        );


      /*
       * Un arrastre se interpreta como navegación de cámara.
       * El eje/plano permanece armado.
       */
      if (
        movement > 5
      ) {

        return;

      }


      // El segundo clic pertenece a MOVE aunque no se encuentre SNAP.
      event.preventDefault();
      event.stopImmediatePropagation();
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

      event.stopPropagation();


      if (
        this.armedPivot
      ) {

        this.pivot.position.copy(
          snap.point,
        );


        this.pivot.updateMatrixWorld(
          true,
        );


        this.previousPivot.copy(
          this.pivot.position,
        );


        this.clearArmedSnap();


        return;

      }


      const axis =
        this.armedMoveAxis;


      if (
        !axis
      ) {

        return;

      }


      const before =
        this.capture();


      const correction =
        this.getConstrainedSnapCorrection(
          axis,
          snap.point,
        );
      if (this.armedCopy && correction.lengthSq() > 1e-18) {
        try { this.copySelectionAtOffset?.(correction); }
        catch (error) { console.error("COPY MIXED at SNAP:", error); }
        // Repeated copies retain the original selection and pivot.
        return;
      }


      if (
        correction.lengthSq()
        > 1e-18
      ) {

        this.applyDelta(
          correction,
        );


        this.pivot.position.add(
          correction,
        );


        this.pivot.updateMatrixWorld(
          true,
        );


        this.previousPivot.copy(
          this.pivot.position,
        );


        this.recordMove(
          before,
        );

      }


      this.clearArmedSnap();

  };


  private getConstrainedSnapCorrection(
    axis:
      MoveNumericAxis,

    targetPoint:
      THREE.Vector3,
  ):
    THREE.Vector3 {

    const correction =
      targetPoint
        .clone()
        .sub(
          this.pivot.position,
        );


    switch (
      axis
    ) {

      case "X":

        correction.set(
          correction.x,
          0,
          0,
        );

        break;


      case "Y":

        correction.set(
          0,
          correction.y,
          0,
        );

        break;


      case "Z":

        correction.set(
          0,
          0,
          correction.z,
        );

        break;


      case "XY":

        correction.z =
          0;

        break;


      case "XZ":

        correction.y =
          0;

        break;


      case "YZ":

        correction.x =
          0;

        break;

    }


    return correction;

  }


  private clearArmedSnap():
    void {

    this.armedMoveAxis =
      null;
    this.armedCopy = false;


    this.armedPivot =
      false;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();

  }


  private applyDelta(
    delta:
      THREE.Vector3,
  ):
    void {

    const state =
      this.combinedState();


    for (
      const instanceId
      of state.pieceIds
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      if (
        !object
        || !instance
      ) {

        continue;

      }


      object.position.add(
        delta,
      );


      object.updateMatrix();

      object.updateMatrixWorld(
        true,
      );


      this.designModel
        .pieceInstances
        .updateTransform(
          instanceId,
          {
            position: {
              x:
                object.position.x,
              y:
                object.position.y,
              z:
                object.position.z,
            },
            rotation: {
              x:
                object.rotation.x,
              y:
                object.rotation.y,
              z:
                object.rotation.z,
            },
          },
        );

    }


    for (
      const pointId
      of state.pointIds
    ) {

      const point =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !point
      ) {

        continue;

      }


      this.designModel
        .cadPoints
        .updatePosition(
          pointId,
          {
            x:
              point.position.x
              + delta.x,
            y:
              point.position.y
              + delta.y,
            z:
              point.position.z
              + delta.z,
          },
        );

    }


    for (
      const lineId
      of state.lineIds
    ) {

      const line =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !line
      ) {

        continue;

      }


      this.designModel
        .cadLines
        .updateGeometry(
          lineId,
          {
            x:
              line.start.x
              + delta.x,
            y:
              line.start.y
              + delta.y,
            z:
              line.start.z
              + delta.z,
          },
          {
            x:
              line.end.x
              + delta.x,
            y:
              line.end.y
              + delta.y,
            z:
              line.end.z
              + delta.z,
          },
        );

    }


    this.pointScene.sync();

    this.lineScene.sync();


    this.designSelection
      .refreshHelpers();

  }


  private capture():
    MixedMoveSnapshot {

    const state =
      this.combinedState();


    const pieces =
      new Map<
        string,
        PieceMoveState
      >();


    const points =
      new Map<
        string,
        PointMoveState
      >();


    const lines =
      new Map<
        string,
        LineMoveState
      >();


    for (
      const instanceId
      of state.pieceIds
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !object
      ) {

        continue;

      }


      pieces.set(
        instanceId,
        {
          position: {
            x:
              object.position.x,
            y:
              object.position.y,
            z:
              object.position.z,
          },
          rotation: {
            x:
              object.rotation.x,
            y:
              object.rotation.y,
            z:
              object.rotation.z,
          },
        },
      );

    }


    for (
      const pointId
      of state.pointIds
    ) {

      const point =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !point
      ) {

        continue;

      }


      points.set(
        pointId,
        {
          x:
            point.position.x,
          y:
            point.position.y,
          z:
            point.position.z,
        },
      );

    }


    for (
      const lineId
      of state.lineIds
    ) {

      const line =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !line
      ) {

        continue;

      }


      lines.set(
        lineId,
        {
          start: {
            x:
              line.start.x,
            y:
              line.start.y,
            z:
              line.start.z,
          },
          end: {
            x:
              line.end.x,
            y:
              line.end.y,
            z:
              line.end.z,
          },
        },
      );

    }


    return {
      pieces,
      points,
      lines,
    };

  }


  private recordMove(
    before:
      MixedMoveSnapshot,
  ):
    void {

    const after =
      this.capture();


    if (
      !this.hasDifference(
        before,
        after,
      )
    ) {

      return;

    }


    this.history.recordOperation(
      "MOVE MIXED",
      () => {

        this.applySnapshot(
          before,
        );

      },
      () => {

        this.applySnapshot(
          after,
        );

      },
    );

  }


  private applySnapshot(
    snapshot:
      MixedMoveSnapshot,
  ):
    void {

    for (
      const [
        instanceId,
        state,
      ]
      of snapshot.pieces
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !object
      ) {

        continue;

      }


      object.position.set(
        state.position.x,
        state.position.y,
        state.position.z,
      );


      object.rotation.set(
        state.rotation.x,
        state.rotation.y,
        state.rotation.z,
      );


      object.updateMatrix();

      object.updateMatrixWorld(
        true,
      );


      this.designModel
        .pieceInstances
        .updateTransform(
          instanceId,
          {
            position: {
              ...state.position,
            },
            rotation: {
              ...state.rotation,
            },
          },
        );

    }


    for (
      const [
        pointId,
        state,
      ]
      of snapshot.points
    ) {

      this.designModel
        .cadPoints
        .updatePosition(
          pointId,
          state,
        );

    }


    for (
      const [
        lineId,
        state,
      ]
      of snapshot.lines
    ) {

      this.designModel
        .cadLines
        .updateGeometry(
          lineId,
          state.start,
          state.end,
        );

    }


    this.pointScene.sync();

    this.lineScene.sync();


    this.designSelection
      .refreshHelpers();


    if (
      this.active
    ) {

      this.resetPivot();

    }

  }


  private hasDifference(
    before:
      MixedMoveSnapshot,

    after:
      MixedMoveSnapshot,
  ):
    boolean {

    const epsilon =
      1e-10;


    const vecDifferent =
      (
        a:
          PointMoveState,

        b:
          PointMoveState,
      ):
        boolean =>
          Math.abs(
            a.x - b.x,
          ) > epsilon
          || Math.abs(
            a.y - b.y,
          ) > epsilon
          || Math.abs(
            a.z - b.z,
          ) > epsilon;


    if (
      before.pieces.size
      !== after.pieces.size
      || before.points.size
        !== after.points.size
      || before.lines.size
        !== after.lines.size
    ) {

      return true;

    }


    for (
      const [
        id,
        a,
      ]
      of before.pieces
    ) {

      const b =
        after.pieces.get(
          id,
        );


      if (
        !b
        || vecDifferent(
          a.position,
          b.position,
        )
        || vecDifferent(
          a.rotation,
          b.rotation,
        )
      ) {

        return true;

      }

    }


    for (
      const [
        id,
        a,
      ]
      of before.points
    ) {

      const b =
        after.points.get(
          id,
        );


      if (
        !b
        || vecDifferent(
          a,
          b,
        )
      ) {

        return true;

      }

    }


    for (
      const [
        id,
        a,
      ]
      of before.lines
    ) {

      const b =
        after.lines.get(
          id,
        );


      if (
        !b
        || vecDifferent(
          a.start,
          b.start,
        )
        || vecDifferent(
          a.end,
          b.end,
        )
      ) {

        return true;

      }

    }


    return false;

  }


  dispose():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.controls.removeEventListener(
      "mouseDown",
      this.handleMoveStart,
    );


    this.controls.removeEventListener(
      "objectChange",
      this.handleMoveChange,
    );


    this.controls.removeEventListener(
      "mouseUp",
      this.handleMoveEnd,
    );


    window.removeEventListener(
      "pointerdown",
      this.handleArmedPointerDown,
      true,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handleArmedPointerUp,
      true,
    );


    this.deactivate();


    this.scene.remove(
      this.helper,
    );


    this.scene.remove(
      this.pivot,
    );


    this.releasePointerLifecycle();
    window.removeEventListener("pointerdown", this.handleCopyPointerDown, true);
    this.controls.dispose();

  }

}
