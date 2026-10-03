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

  private readonly scene:
    THREE.Scene;


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


    this.designScene =
      designScene;


    this.pointScene =
      pointScene;


    this.lineScene =
      lineScene;


    this.selection =
      selection;


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
      "FrameLogicCadMixedMovePivot";


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
      || !this.selection.hasSelection
      || !this.selection.isMixed
      || !this.canMoveSelection()
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


    this.selection.setEnabled(
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


    this.currentAxis =
      null;


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
      this.selection
        .getState();


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


      if (
        layer?.visible === false
        || layer?.locked === true
      ) {

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

    const state =
      this.selection
        .getState();


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
       * Igual que MOVE de piezas:
       * el centro XYZ mueve solo el punto base del gizmo.
       */
      if (
        this.currentAxis
        !== "XYZ"
      ) {

        this.applyDelta(
          delta,
        );

      }


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


      this.dragStart =
        null;


      this.currentAxis =
        null;


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


  private applyDelta(
    delta:
      THREE.Vector3,
  ):
    void {

    const state =
      this.selection
        .getState();


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


    this.designScene.sync();

  }


  private capture():
    MixedMoveSnapshot {

    const state =
      this.selection
        .getState();


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


    this.designScene.sync();

    this.pointScene.sync();

    this.lineScene.sync();


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
