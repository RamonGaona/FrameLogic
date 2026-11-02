import { installTransformPointerLifecycle } from "./TransformGizmoReliability";
import * as THREE from "three";

import {
  TransformControls,
} from "three/addons/controls/TransformControls.js";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  MoveNumericAxis,
} from "./CadNumericInputController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


interface CadPointMoveState {

  readonly x:
    number;

  readonly y:
    number;

  readonly z:
    number;

}


type CadPointMoveSnapshot =
  Map<
    string,
    CadPointMoveState
  >;


export class CadPointMoveController {
  private readonly releasePointerLifecycle: () => void;

  private readonly scene:
    THREE.Scene;


  private readonly designModel:
    DesignModel;


  private readonly pointScene:
    CadPointSceneController;


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
    CadPointMoveSnapshot
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

    pointScene:
      CadPointSceneController,

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


    this.pointScene =
      pointScene;


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
      "FrameLogicCadPointMovePivot";


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
  ): void {

    this.controls.camera =
      camera;

  }


  setNumericAxisHandler(
    handler:
      (
        axis:
          MoveNumericAxis,
      ) => void,
  ): void {

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
      this.pointSelection
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


    this.controls.detach();


    this.setCameraEnabled(
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
      this.pointSelection
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
      const pointId
      of selectedIds
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
      this.pointSelection
        .getSelectedIds();


    const center =
      new THREE.Vector3();


    let count =
      0;


    for (
      const pointId
      of selectedIds
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
    (): void => {

      if (
        !this.active
      ) {

        return;

      }


      const selectedIds =
        this.pointSelection
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
    (): void => {

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
        this.pointSelection
          .getSelectedIds(),
        delta,
      );


      this.previousPivot.copy(
        this.pivot.position,
      );

  };


  private readonly handleMoveEnd =
    (): void => {

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
        this.pointSelection
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
      const pointId
      of selectedIds
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


    this.pointScene.sync();

  }


  private capture(
    selectedIds:
      readonly string[],
  ):
    CadPointMoveSnapshot {

    const snapshot:
      CadPointMoveSnapshot =
        new Map();


    for (
      const pointId
      of selectedIds
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


      snapshot.set(
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


    return snapshot;

  }


  private recordMove(
    before:
      CadPointMoveSnapshot,

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
      "MOVE POINT",
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
      CadPointMoveSnapshot,
  ):
    void {

    for (
      const [
        pointId,
        state,
      ]
      of snapshot
    ) {

      this.designModel
        .cadPoints
        .updatePosition(
          pointId,
          state,
        );

    }


    this.pointScene.sync();


    if (
      this.active
    ) {

      this.resetPivot();

    }

  }


  private hasDifference(
    before:
      CadPointMoveSnapshot,

    after:
      CadPointMoveSnapshot,
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
        pointId,
        a,
      ]
      of before
    ) {

      const b =
        after.get(
          pointId,
        );


      if (
        !b
        || Math.abs(
          a.x - b.x,
        ) > epsilon
        || Math.abs(
          a.y - b.y,
        ) > epsilon
        || Math.abs(
          a.z - b.z,
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


    this.releasePointerLifecycle();
    this.controls.dispose();

  }

}
