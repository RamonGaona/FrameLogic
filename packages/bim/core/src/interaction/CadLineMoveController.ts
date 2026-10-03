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

  private readonly scene:
    THREE.Scene;


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

    setCameraEnabled:
      (
        enabled: boolean,
      ) => void,
  ) {

    this.scene =
      scene;


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


    this.setCameraEnabled =
      setCameraEnabled;


    this.controls =
      new TransformControls(
        camera,
        domElement,
      );


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

    this.active =
      false;


    this.dragStart =
      null;


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


      const axis =
        this.controls.axis;


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


      this.dragStart =
        null;


      if (
        !before
      ) {

        return;

      }


      this.recordMove(
        before,
        this.lineSelection
          .getSelectedIds(),
      );

  };


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


    this.deactivate();


    this.scene.remove(
      this.helper,
    );


    this.scene.remove(
      this.pivot,
    );


    this.controls.dispose();

  }

}
