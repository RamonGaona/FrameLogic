import { installTransformPointerLifecycle } from "./TransformGizmoReliability";
import * as THREE from "three";

import {
  TransformControls,
} from "three/addons/controls/TransformControls.js";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  MoveNumericAxis,
} from "./CadNumericInputController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


interface CadLineMoveState {

  readonly start: {
    x: number;
    y: number;
    z: number;
  };

  readonly end: {
    x: number;
    y: number;
    z: number;
  };

}


type CadLineMoveSnapshot =
  Map<
    string,
    CadLineMoveState
  >;


export class CadLineMoveController {
  private readonly releasePointerLifecycle: () => void;

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly designModel:
    DesignModel;


  private readonly lineScene:
    CadLineSceneController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


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


  private currentAxis:
    string
    | null =
      null;


  private armedMoveAxis:
    MoveNumericAxis
    | null =
      null;


  private armedPivot =
    false;


  private armedPointerDownX =
    0;


  private armedPointerDownY =
    0;


  private armedPointerDownActive =
    false;


  private dragStart:
    CadLineMoveSnapshot
    | null =
      null;


  private active =
    false;


  private disposed =
    false;


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

    lineScene:
      CadLineSceneController,

    lineSelection:
      CadLineSelectionController,

    pointSelection:
      CadPointSelectionController,

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


    this.lineScene =
      lineScene;


    this.lineSelection =
      lineSelection;


    this.pointSelection =
      pointSelection;


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
      0.8;


    this.helper =
      this.controls.getHelper();


    this.scene.add(
      this.helper,
    );


    this.pivot.name =
      "FrameLogicCadLineMovePivot";


    this.scene.add(
      this.pivot,
    );


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


    this.domElement.addEventListener(
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

    if (
      this.disposed
    ) {

      return false;

    }


    this.clearArmedSnap();


    const selectedIds =
      this.lineSelection
        .getSelectedIds();


    if (
      selectedIds.length < 1
      || !this.canMove(
        selectedIds,
      )
    ) {

      this.deactivate();

      return false;

    }


    this.active =
      true;


    this.clearArmedSnap();


    this.resetPivot();


    this.controls.attach(
      this.pivot,
    );


    this.lineSelection
      .setEnabled(
        false,
      );


    this.pointSelection
      .setEnabled(
        false,
      );


    this.designSelection
      .setEnabled(
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


    this.dragStart =
      null;


    this.currentAxis =
      null;


    this.clearArmedSnap();


    this.controls.detach();


    this.setCameraEnabled(
      true,
    );


    this.lineSelection
      .setEnabled(
        true,
      );


    this.pointSelection
      .setEnabled(
        true,
      );


    this.designSelection
      .setEnabled(
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


    const selectedIds =
      this.lineSelection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {

      return false;

    }


    const before =
      this.capture(
        selectedIds,
      );


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
      selectedIds,
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
      selectedIds,
    );


    return true;

  }


  private canMove(
    selectedIds:
      readonly string[],
  ):
    boolean {

    for (
      const lineId
      of selectedIds
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


      if (
        layer?.visible === false
        || layer?.locked === true
      ) {

        return false;

      }

    }


    return true;

  }


  private resetPivot():
    void {

    const selectedIds =
      this.lineSelection
        .getSelectedIds();


    const center =
      new THREE.Vector3();


    let count =
      0;


    for (
      const lineId
      of selectedIds
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


      const selectedIds =
        this.lineSelection
          .getSelectedIds();


      this.dragStart =
        this.capture(
          selectedIds,
        );


      this.previousPivot.copy(
        this.pivot.position,
      );


      this.dragStartPivot.copy(
        this.pivot.position,
      );


      this.clearArmedSnap();


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


      this.applyDelta(
        this.lineSelection
          .getSelectedIds(),
        delta,
      );


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


        this.armedPivot =
          false;


        this.snap.setExcludedInstanceIds(
          this.lineSelection
            .getSelectedIds(),
        );


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
         * Para reposicionar el pivote sí se permite SNAP
         * sobre las propias líneas seleccionadas.
         */
        this.snap.clearExcludedInstanceIds();


        return;

      }


      this.clearArmedSnap();


      if (
        !before
        || axis === "XYZ"
      ) {

        return;

      }


      this.recordMove(
        before,
        this.lineSelection
          .getSelectedIds(),
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


      this.armedPointerDownX =
        event.clientX;


      this.armedPointerDownY =
        event.clientY;


      this.armedPointerDownActive =
        true;

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


      const selectedIds =
        this.lineSelection
          .getSelectedIds();


      const before =
        this.capture(
          selectedIds,
        );


      const correction =
        this.getConstrainedSnapCorrection(
          axis,
          snap.point,
        );


      if (
        correction.lengthSq()
        > 1e-18
      ) {

        this.applyDelta(
          selectedIds,
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
          selectedIds,
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


    this.armedPivot =
      false;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();

  }


  private applyDelta(
    selectedIds:
      readonly string[],

    delta:
      THREE.Vector3,
  ):
    void {

    for (
      const lineId
      of selectedIds
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


    this.lineScene.sync();

  }


  private capture(
    selectedIds:
      readonly string[],
  ):
    CadLineMoveSnapshot {

    const snapshot:
      CadLineMoveSnapshot =
        new Map();


    for (
      const lineId
      of selectedIds
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


      snapshot.set(
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


    return snapshot;

  }


  private recordMove(
    before:
      CadLineMoveSnapshot,

    selectedIds:
      readonly string[],
  ):
    void {

    const after =
      this.capture(
        selectedIds,
      );


    if (
      !this.hasDifference(
        before,
        after,
      )
    ) {

      return;

    }


    this.history.recordOperation(
      "MOVE LINE",
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
      CadLineMoveSnapshot,
  ):
    void {

    for (
      const [
        lineId,
        state,
      ]
      of snapshot
    ) {

      this.designModel
        .cadLines
        .updateGeometry(
          lineId,
          state.start,
          state.end,
        );

    }


    this.lineScene.sync();


    if (
      this.active
    ) {

      this.resetPivot();

    }

  }


  private hasDifference(
    before:
      CadLineMoveSnapshot,

    after:
      CadLineMoveSnapshot,
  ):
    boolean {

    if (
      before.size
      !== after.size
    ) {

      return true;

    }


    const epsilon =
      1e-10;


    for (
      const [
        lineId,
        a,
      ]
      of before
    ) {

      const b =
        after.get(
          lineId,
        );


      if (
        !b
        || Math.abs(
          a.start.x - b.start.x,
        ) > epsilon
        || Math.abs(
          a.start.y - b.start.y,
        ) > epsilon
        || Math.abs(
          a.start.z - b.start.z,
        ) > epsilon
        || Math.abs(
          a.end.x - b.end.x,
        ) > epsilon
        || Math.abs(
          a.end.y - b.end.y,
        ) > epsilon
        || Math.abs(
          a.end.z - b.end.z,
        ) > epsilon
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


    this.domElement.removeEventListener(
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
    this.controls.dispose();

  }

}
