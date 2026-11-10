import { installTransformPointerLifecycle } from "./TransformGizmoReliability";
import * as THREE from "three";

import { configureMoveDestinationSnaps } from "./MoveSnapDestinationPolicy";
import { PieceMoveCopySession } from "./PieceMoveCopySession";

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
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  MoveNumericAxis,
} from "./CadNumericInputController";

import type {
  CadHistoryController,
  CadTransformSnapshot,
} from "./CadHistoryController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


export type DesignTransformMode =
  | "translate"
  | "rotate";


export class DesignTransformController {
  private readonly releasePointerLifecycle: () => void;

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly selection:
    DesignSelectionController;


  private readonly setCameraEnabled:
    (
      enabled: boolean,
    ) => void;


  private readonly history:
    CadHistoryController;


  private readonly snap:
    DesignSnapController;


  private readonly controls:
    TransformControls;


  private readonly helper:
    THREE.Object3D;


  private readonly pivot =
    new THREE.Object3D();


  private readonly transformedObjects =
    new Map<
      string,
      THREE.Object3D
    >();


  private previousPivotPosition =
    new THREE.Vector3();


  private previousPivotQuaternion =
    new THREE.Quaternion();


  private dragMode:
    | "NONE"
    | "MOVE_OBJECTS"
    | "MOVE_PIVOT"
    | "ROTATE_OBJECTS" =
      "NONE";


  private active =
    false;


  private disposed =
    false;


  private unsubscribeSelection:
    (() => void) | null =
      null;


  private onNumericAxis:
    (
      axis: MoveNumericAxis,
    ) => void =
      () => {};


  private dragHistoryStart:
    CadTransformSnapshot
    | null =
      null;


  private activeMoveAxis:
    MoveNumericAxis
    | "XYZ"
    | null =
      null;


  private armedMoveAxis:
    MoveNumericAxis
    | null =
      null;


  private armedPivot =
    false;

  // Single pieces default to their authored axes; groups use global axes.
  private requestedTransformSpace: "world" | "local" = "local";

  private ctrlCopyGesture = false;
  private armedCopyMove = false;
  private copySession: PieceMoveCopySession | null = null;
  private copyAssemblyIds: () => readonly string[] = () => [];
  private selectCopiedAssemblies: (ids: readonly string[]) => void = () => {};
  private cancelingCtrlGesture = false;


  private readonly dragStartPivotPosition =
    new THREE.Vector3();


  private armedPointerDownX =
    0;


  private armedPointerDownY =
    0;


  private armedPointerDownActive =
    false;


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

    selection:
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


    this.selection =
      selection;


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

    this.releasePointerLifecycle = installTransformPointerLifecycle(
      domElement, this.controls, window,
      () => {
        if (this.ctrlCopyGesture || this.copySession) {
          this.cancelingCtrlGesture = true;
        }
      },
    );


    this.controls.setMode(
      "translate",
    );


    this.controls.setSpace(
      this.requestedTransformSpace,
    );


    this.controls.size =
      0.8;


    this.helper =
      this.controls.getHelper();


    this.scene.add(
      this.helper,
    );


    this.pivot.name =
      "FrameLogicTransformPivot";


    this.scene.add(
      this.pivot,
    );


    this.unsubscribeSelection =
      this.selection.subscribe(
        (
          selectedIds,
        ) => {

          this.handleSelectionChanged(
            selectedIds,
          );

        },
      );


    this.controls.addEventListener(
      "mouseDown",
      this.handleTransformStart,
    );


    this.controls.addEventListener(
      "objectChange",
      this.handleTransformChange,
    );


    this.controls.addEventListener(
      "mouseUp",
      this.handleTransformEnd,
    );


    this.domElement.addEventListener(
      "pointerdown", this.handleCtrlCopyPointerDown, true,
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

    window.addEventListener("keydown", this.handleRepeatCopyKeyDown, true);

    this.controls.detach();

  }


  // ==========================================================
  // ACTIVATE
  // ==========================================================

  activate(
    mode:
      DesignTransformMode =
        "translate",
  ): boolean {

    if (
      this.disposed
    ) {

      return false;

    }


    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {

      this.deactivate();

      return false;

    }


    if (
      !this.syncSelectedObjects(
        selectedIds,
      )
    ) {

      this.deactivate();

      return false;

    }


    this.controls.setMode(
      mode,
    );


    this.active =
      true;


    /*
     * Cada comando empieza desde el punto base
     * de la selección actual.
     */
    this.resetPivotToSelectionBase();


    this.controls.attach(
      this.pivot,
    );


    this.dragMode =
      "NONE";


    return true;

  }


  // ==========================================================
  // DEACTIVATE
  // ==========================================================

  deactivate(): void {
    if (this.controls.dragging && (this.ctrlCopyGesture || this.copySession)) {
      this.cancelingCtrlGesture = true;
    }
    if (this.controls.dragging) {
      this.controls.reset();
      this.controls.pointerUp(null);
    }


    /*
     * Cualquier cancelación devuelve el pivot
     * al punto base antes de ocultar el gizmo.
     */
    this.resetPivotToSelectionBase();


    this.active =
      false;


    this.cancelCopySession();
    this.ctrlCopyGesture = false;
    this.armedCopyMove = false;
    this.cancelingCtrlGesture = false;
    this.transformedObjects.clear();


    this.dragMode =
      "NONE";


    this.dragHistoryStart =
      null;


    this.activeMoveAxis =
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


  get isActive():
    boolean {

    return this.active;

  }


  // ==========================================================
  // CAMERA
  // ==========================================================

  setCamera(
    camera:
      THREE.Camera,
  ): void {

    /*
     * OrthoPerspectiveCamera puede reemplazar la instancia
     * THREE.Camera al alternar perspectiva/ortográfica.
     *
     * TransformControls debe usar siempre la cámara activa
     * también para su raycast interno.
     */
    this.controls.camera =
      camera;

  }


  setNumericAxisHandler(
    handler:
      (
        axis: MoveNumericAxis,
      ) => void,
  ): void {

    this.onNumericAxis =
      handler;

  }


  applyNumericMove(
    axis:
      MoveNumericAxis,

    first:
      number,

    second = 0,
  ): boolean {

    if (
      !this.active
      || this.transformedObjects.size
        < 1
    ) {

      return false;

    }


    const before =
      this.history.capture(
        this.selection
          .getSelectedIds(),
      );


    const delta =
      new THREE.Vector3();


    switch (
      axis
    ) {

      case "X":

        delta.x =
          first;

        break;


      case "Y":

        delta.y =
          first;

        break;


      case "Z":

        delta.z =
          first;

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


    // Numeric distances follow the same rotated axes as the gizmo.
    if (this.controls.space === "local") {
      delta.applyQuaternion(this.pivot.quaternion);
    }

    for (
      const object
      of this.transformedObjects.values()
    ) {

      object.position.add(
        delta,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.pivot.position.add(
      delta,
    );


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.commitTransforms();


    this.history.recordTransform(
      "MOVE",
      before,
      this.selection
        .getSelectedIds(),
    );


    return true;

  }


  // ==========================================================
  // SELECTED OBJECTS
  // ==========================================================

  private syncSelectedObjects(
    selectedIds:
      readonly string[],
  ): boolean {

    this.transformedObjects.clear();


    for (
      const instanceId
      of selectedIds
    ) {

      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      const layer =
        instance
          ? this.designModel
              .layers
              .get(
                instance.layerId,
              )
          : undefined;


      if (
        !instance
        || layer?.visible === false
        || layer?.locked === true
        || this.designModel.isPieceLocked?.(instanceId) === true
      ) {

        this.transformedObjects.clear();

        return false;

      }


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


      this.transformedObjects.set(
        instanceId,
        object,
      );

    }


    return (
      this.transformedObjects.size
      > 0
    );

  }


  // ==========================================================
  // SELECTION BASE
  // ==========================================================

  private resetPivotToSelectionBase():
    void {

    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {


      return;

    }


    const position =
      new THREE.Vector3();


    const worldPosition =
      new THREE.Vector3();


    let count =
      0;


    for (
      const instanceId
      of selectedIds
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


      // Use the definition's authored origin instead of STEP's.
      const instance = this.designModel.pieceInstances.get(instanceId);
      const definition = instance
        ? this.designModel.pieceDefinitions?.get(instance.definitionId)
        : undefined;
      if (definition) {
        const origin = definition.coordinateSystem.origin;
        object.updateMatrixWorld(true);
        worldPosition.set(origin.x, origin.y, origin.z);
        object.localToWorld(worldPosition);
      } else {
        object.getWorldPosition(worldPosition);
      }


      position.add(
        worldPosition,
      );


      count +=
        1;

    }


    if (
      count < 1
    ) {


      return;

    }


    position.multiplyScalar(
      1 / count,
    );


    this.pivot.position.copy(
      position,
    );

    // Compose instance rotation (including ALIGN) and the locally defined
    // FrameLogic coordinate axes. Selecting a piece never changes its mesh.
    this.pivot.quaternion.identity();
    if (selectedIds.length === 1) {
      const id = selectedIds[0];
      const object = id ? this.designScene.getInstanceObject(id) : null;
      const instance = id ? this.designModel.pieceInstances.get(id) : null;
      const definition = instance
        ? this.designModel.pieceDefinitions?.get(instance.definitionId) : undefined;
      if (object) {
        object.getWorldQuaternion(this.pivot.quaternion);
        const frame = definition?.coordinateSystem;
        if (frame) {
          const x = new THREE.Vector3(frame.xAxis.x, frame.xAxis.y, frame.xAxis.z).normalize();
          const y = new THREE.Vector3(frame.yAxis.x, frame.yAxis.y, frame.yAxis.z).normalize();
          const z = new THREE.Vector3(frame.zAxis.x, frame.zAxis.y, frame.zAxis.z).normalize();
          if (
            Math.abs(x.dot(y)) < 1e-5
            && Math.abs(x.dot(z)) < 1e-5
            && Math.abs(y.dot(z)) < 1e-5
            && x.clone().cross(y).dot(z) > 0.999
          ) {
            this.pivot.quaternion.multiply(
              new THREE.Quaternion().setFromRotationMatrix(
                new THREE.Matrix4().makeBasis(x, y, z),
              ),
            ).normalize();
          }
        }
      }
    }
    this.controls.setSpace(
      selectedIds.length === 1 ? this.requestedTransformSpace : "world",
    );

    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.previousPivotQuaternion.copy(
      this.pivot.quaternion,
    );

  }


  // ==========================================================
  // SELECTION CHANGED
  // ==========================================================

  private handleSelectionChanged(
    selectedIds:
      readonly string[],
  ): void {

    /*
     * Seleccionar normalmente no muestra gizmo.
     */
    if (
      !this.active
    ) {

      this.controls.detach();

      return;

    }


    /*
     * Una selección nueva NO cancela el comando.
     * MOVE/ROTATE continúa sobre las nuevas piezas.
     */
    if (
      selectedIds.length < 1
      || !this.syncSelectedObjects(
        selectedIds,
      )
    ) {

      this.deactivate();

      return;

    }


    /*
     * Al cambiar las piezas seleccionadas,
     * el pivot temporal anterior deja de aplicar.
     */
    this.resetPivotToSelectionBase();


    this.controls.attach(
      this.pivot,
    );


    this.dragMode =
      "NONE";
    this.cancelCopySession();
    this.ctrlCopyGesture = false;
    this.armedCopyMove = false;

    this.activeMoveAxis =
      null;


    this.armedMoveAxis =
      null;


    this.armedPivot =
      false;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();

  }


  private readonly handleCtrlCopyPointerDown = (event: PointerEvent): void => {
    if (this.active && event.button === 0 && this.controls.getMode() === "translate") {
      this.ctrlCopyGesture = event.ctrlKey;
    }
  };

  /**
   * The INSTANCIAS tree owns assembly identity, while the viewport selection
   * owns individual piece IDs. Pass both to an independent copy transaction.
   */
  setAssemblyCopySelection(
    getSelectedAssemblyIds: () => readonly string[],
    onSelectAssemblies: (ids: readonly string[]) => void,
  ): void {
    this.copyAssemblyIds = getSelectedAssemblyIds;
    this.selectCopiedAssemblies = onSelectAssemblies;
  }

  private beginCopySession(): boolean {
    if (this.copySession) return true;
    try {
      const session = new PieceMoveCopySession(
        this.designModel, this.designScene, this.selection, this.history,
        this.selection.getSelectedIds(),
        this.copyAssemblyIds(),
        this.selectCopiedAssemblies,
      );
      this.copySession = session;
      this.transformedObjects.clear();
      for (const [id, object] of session.objects) this.transformedObjects.set(id, object);
      this.dragHistoryStart = null;
      configureMoveDestinationSnaps(this.snap, session.ids, "DRAGGING");
      return true;
    } catch (error) {
      console.error("No se pudo copiar la pieza con Ctrl + eje", error);
      return false;
    }
  }

  private cancelCopySession(): void {
    const session = this.copySession;
    this.copySession = null;
    if (!session) return;
    session.cancel();
    this.syncSelectedObjects(this.selection.getSelectedIds());
  }

  private finishCopySession(keepOriginalSelection = false): void {
    const session = this.copySession;
    this.copySession = null;
    session?.finish(keepOriginalSelection);
  }

  /**
   * First Esc exits repeated SNAP placement without closing the MOVE gizmo.
   * A second Esc follows the existing command cancellation behaviour.
   */
  private readonly handleRepeatCopyKeyDown = (event: KeyboardEvent): void => {
    if (
      !this.active
      || !this.armedCopyMove
      || !this.armedMoveAxis
      || event.key !== "Escape"
    ) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.armedCopyMove = false;
    this.armedMoveAxis = null;
    this.armedPointerDownActive = false;
    this.ctrlCopyGesture = false;
    this.snap.clearExcludedInstanceIds();
    this.syncSelectedObjects(this.selection.getSelectedIds());
    this.selection.setEnabled(true);
    this.setCameraEnabled(true);
  };

  // ==========================================================
  // TRANSFORM START
  // ==========================================================

  private readonly handleTransformStart =
    (): void => {

      if (
        !this.active
      ) {

        return;

      }


      this.previousPivotPosition.copy(
        this.pivot.position,
      );


      this.dragStartPivotPosition.copy(
        this.pivot.position,
      );


      this.armedMoveAxis =
        null;


      this.armedPivot =
        false;


      this.armedPointerDownActive =
        false;


      this.previousPivotQuaternion.copy(
        this.pivot.quaternion,
      );


      if (
        this.controls.getMode()
        === "rotate"
      ) {

        this.dragMode =
          "ROTATE_OBJECTS";

      }
      else {

        const axis =
          this.controls.axis;


        this.activeMoveAxis =
          (
            axis === "X"
            || axis === "Y"
            || axis === "Z"
            || axis === "XY"
            || axis === "XZ"
            || axis === "YZ"
            || axis === "XYZ"
          )
            ? axis
            : null;


        this.dragMode =
          axis === "XYZ"
            ? "MOVE_PIVOT"
            : "MOVE_OBJECTS";


        if (
          this.dragMode
          === "MOVE_OBJECTS"
        ) {

          // Mientras la pieza se arrastra, evitar que su geometría
          // móvil se convierta en un destino SNAP involuntario.
          configureMoveDestinationSnaps(
            this.snap,
            this.selection.getSelectedIds(),
            "DRAGGING",
          );

        }
        else {

          this.snap.clearExcludedInstanceIds();

        }


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

      }


      this.dragHistoryStart =
        this.dragMode
          === "MOVE_OBJECTS"
          ? this.history.capture(
              this.selection
                .getSelectedIds(),
            )
          : null;


      this.setCameraEnabled(
        false,
      );


      this.selection.setEnabled(
        false,
      );

    };


  // ==========================================================
  // TRANSFORM CHANGE
  // ==========================================================

  private readonly handleTransformChange =
    (): void => {

      if (
        !this.active
        || this.transformedObjects.size
          < 1
      ) {

        return;

      }


      if (
        this.controls.getMode()
        === "translate"
      ) {

        this.handleTranslateChange();

        return;

      }


      this.handleRotateChange();

    };


  private handleTranslateChange():
    void {

    const delta =
      new THREE.Vector3()
        .subVectors(
          this.pivot.position,
          this.previousPivotPosition,
        );


    // --------------------------------------------------------
    // CENTRO DEL GIZMO = MOVER SOLO PIVOT
    // --------------------------------------------------------

    if (
      this.dragMode
      === "MOVE_PIVOT"
    ) {

      /*
       * El centro XYZ ya no permite colocar el pivote
       * por arrastre aproximado.
       *
       * Cualquier movimiento del puntero se descarta y
       * el pivote permanece en su posición inicial.
       * Al soltar, el centro queda armado y el siguiente
       * clic sobre un SNAP define la posición exacta 3D.
       */
      this.pivot.position.copy(
        this.dragStartPivotPosition,
      );


      this.pivot.updateMatrixWorld(
        true,
      );


      this.previousPivotPosition.copy(
        this.dragStartPivotPosition,
      );


      return;

    }


    // --------------------------------------------------------
    // EJES / PLANOS = MOVER TODA LA SELECCIÓN
    // --------------------------------------------------------
    if (this.ctrlCopyGesture && !this.copySession && delta.lengthSq() > 1e-18) {
      if (!this.beginCopySession()) {
        this.cancelingCtrlGesture = true;
        this.pivot.position.copy(this.previousPivotPosition);
        this.pivot.updateMatrixWorld(true);
        return;
      }
    }

    if (this.copySession) {
      // Absolute from the original copy base: never accumulate the drag
      // delta on a stale original selection or on a previous copy.
      this.copySession.placeCopiesAtOffset(
        this.pivot.position.clone().sub(this.dragStartPivotPosition),
      );
    } else {
      for (const object of this.transformedObjects.values()) {
        object.position.add(delta);
        object.updateMatrix();
        object.updateMatrixWorld(true);
      }
    }


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.selection.refreshHelpers();

  }


  private handleRotateChange():
    void {

    if (
      this.dragMode
      !== "ROTATE_OBJECTS"
    ) {

      return;

    }


    const inversePrevious =
      this.previousPivotQuaternion
        .clone()
        .invert();


    const deltaQuaternion =
      this.pivot.quaternion
        .clone()
        .multiply(
          inversePrevious,
        );


    for (
      const object
      of this.transformedObjects.values()
    ) {

      const offset =
        object.position
          .clone()
          .sub(
            this.pivot.position,
          );


      offset.applyQuaternion(
        deltaQuaternion,
      );


      object.position.copy(
        this.pivot.position
          .clone()
          .add(
            offset,
          ),
      );


      object.quaternion.premultiply(
        deltaQuaternion,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.previousPivotQuaternion.copy(
      this.pivot.quaternion,
    );


    this.selection.refreshHelpers();

  }


  // ==========================================================
  // TRANSFORM END
  // ==========================================================

  private readonly handleTransformEnd =
    (): void => {

      if (
        !this.active
      ) {

        return;

      }


      if (this.cancelingCtrlGesture) {
        this.cancelCopySession();
        this.ctrlCopyGesture = false;
        this.armedCopyMove = false;
        this.cancelingCtrlGesture = false;
        this.armedMoveAxis = null;
        this.armedPivot = false;
        this.dragMode = "NONE";
        this.dragHistoryStart = null;
        this.snap.clearExcludedInstanceIds();
        this.resetPivotToSelectionBase();
        this.selection.setEnabled(true);
        this.setCameraEnabled(true);
        return;
      }

      const movedDistance =
        this.pivot.position
          .distanceTo(
            this.dragStartPivotPosition,
          );


      const clickedAxis =
        this.controls.getMode()
          === "translate"
        && this.dragMode
          === "MOVE_OBJECTS"
        && this.activeMoveAxis
          !== null
        && this.activeMoveAxis
          !== "XYZ"
        && movedDistance
          <= 1e-9;


      const clickedPivot =
        this.controls.getMode()
          === "translate"
        && this.dragMode
          === "MOVE_PIVOT"
        && this.activeMoveAxis
          === "XYZ"
        && movedDistance
          <= 1e-9;


      if (
        this.controls.getMode()
        === "translate"
        && !clickedAxis
        && !clickedPivot
      ) {

        this.applySnapAtTransformEnd();

      }


      if (
        this.dragMode
        === "MOVE_OBJECTS"
        || this.dragMode
          === "ROTATE_OBJECTS"
      ) {

        if (clickedAxis && this.copySession) {
          this.cancelCopySession();
        } else if (!this.ctrlCopyGesture || this.copySession) {
          // A Ctrl gesture may only commit the new instance IDs.
          // If duplicate creation failed, never move the source instead.
          this.commitTransforms();
          if (this.copySession) this.finishCopySession();
        }

        if (
          this.dragHistoryStart
          && !this.ctrlCopyGesture
        ) {

          this.history.recordTransform(
            "MOVE",
            this.dragHistoryStart,
            this.selection
              .getSelectedIds(),
          );

        }

      }


      this.dragHistoryStart =
        null;


      if (
        clickedAxis
      ) {

        const armedAxis =
          this.activeMoveAxis;


        if (
          armedAxis === null
          || armedAxis === "XYZ"
        ) {

          return;

        }


        this.armedMoveAxis =
          armedAxis;
        this.armedCopyMove = this.ctrlCopyGesture;


        this.armedPivot =
          false;


        /*
         * Mientras esperamos el segundo clic, la selección
         * queda bloqueada para que el destino SNAP no cambie
         * las piezas que se están moviendo.
         */
        this.selection.setEnabled(
          false,
        );


        // Tras un clic corto el eje queda armado: la pieza ya no
        // se arrastra, así que sus SNAPs y los externos pueden
        // servir de destino para el segundo clic exacto.
        configureMoveDestinationSnaps(
          this.snap,
          this.selection.getSelectedIds(),
          "PICK_DESTINATION",
        );

      }
      else if (
        clickedPivot
      ) {
        this.armedCopyMove = false;

        /*
         * Clic corto en el centro:
         * el siguiente clic SNAP reposiciona solamente el pivote.
         */
        this.armedMoveAxis =
          null;


        this.armedPivot =
          true;


        this.selection.setEnabled(
          false,
        );


        /*
         * Para mover el pivote sí permitimos SNAP sobre
         * la propia selección.
         */
        this.snap.clearExcludedInstanceIds();

      }
      else {
        this.armedCopyMove = false;

        this.armedMoveAxis =
          null;


        this.armedPivot =
          false;


        this.snap.clearExcludedInstanceIds();

      }


      this.activeMoveAxis =
        null;
      this.ctrlCopyGesture = false;


      this.dragMode =
        "NONE";


      this.setCameraEnabled(
        true,
      );


      if (
        !clickedAxis
        && !clickedPivot
      ) {

        window.setTimeout(
          () => {

            if (
              this.disposed
            ) {

              return;

            }


            this.selection.setEnabled(
              true,
            );

          },
          0,
        );

      }

    };


  private readonly handleArmedPointerDown =
    (
      event:
        PointerEvent,
    ): void => {

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
    ): void => {

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


      if (
        !this.armedPointerDownActive
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
       * Si hubo arrastre, asumimos navegación de cámara.
       * El eje sigue armado para intentar de nuevo.
       */
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


      const repeatingCopy = this.armedCopyMove && this.armedMoveAxis !== null;
      const sourcePivot = repeatingCopy ? this.pivot.position.clone() : null;

      const before =
        this.history.capture(
          this.selection
            .getSelectedIds(),
        );


      if (
        this.armedPivot
      ) {

        this.pivot.position.copy(
          snap.point,
        );


        this.pivot.updateMatrixWorld(
          true,
        );


        this.previousPivotPosition.copy(
          this.pivot.position,
        );


        /*
         * Reubicar el pivote no modifica las piezas,
         * por lo tanto no crea una entrada de Undo/Redo.
         */
        this.selection.refreshHelpers();

      }
      else if (
        this.armedMoveAxis
      ) {

        const correction =
          this.getConstrainedSnapCorrection(
            this.armedMoveAxis,
            snap.point,
          );


        if (
          correction.lengthSq()
          > 1e-18
        ) {

          if (this.armedCopyMove && !this.beginCopySession()) return;

          if (this.copySession) {
            this.copySession.placeCopiesAtOffset(correction);
          } else {
            for (const object of this.transformedObjects.values()) {
              object.position.add(correction);
              object.updateMatrix();
              object.updateMatrixWorld(true);
            }
          }


          this.pivot.position.add(
            correction,
          );


          this.pivot.updateMatrixWorld(
            true,
          );


          this.previousPivotPosition.copy(
            this.pivot.position,
          );


          this.commitTransforms();
          if (this.copySession) {
            this.finishCopySession(repeatingCopy);
            if (repeatingCopy && sourcePivot) {
              // Every click starts from the same original pieces and the
              // same gizmo base. Do not accumulate displacements from the
              // previous copy or switch selection to the new instance.
              this.syncSelectedObjects(this.selection.getSelectedIds());
              this.pivot.position.copy(sourcePivot);
              this.pivot.updateMatrixWorld(true);
              this.previousPivotPosition.copy(sourcePivot);
              this.selection.refreshHelpers();
            }
          } else {
            this.history.recordTransform(
              "MOVE", before, this.selection.getSelectedIds(),
            );
          }

        }

      }

      if (repeatingCopy) {
        // Keep the axis armed and leave selection locked so the next
        // normal click on any eligible SNAP places another independent copy.
        // Zero-distance/invalid targets must not end the repeated mode.
        configureMoveDestinationSnaps(
          this.snap, this.selection.getSelectedIds(), "PICK_DESTINATION",
        );
        this.selection.setEnabled(false);
        return;
      }

      this.armedMoveAxis =
        null;


      this.armedCopyMove = false;


      this.armedPivot =
        false;


      this.snap.clearExcludedInstanceIds();


      this.selection.setEnabled(
        true,
      );

    };


  private getConstrainedSnapCorrection(
    axis:
      MoveNumericAxis,

    targetPoint:
      THREE.Vector3,
  ):
    THREE.Vector3 {

    const correction = targetPoint.clone().sub(this.pivot.position);
    const local = this.controls.space === "local";
    if (local) correction.applyQuaternion(this.pivot.quaternion.clone().invert());

    // Constrain in gizmo coordinates, not world coordinates, after ALIGN.
    switch (axis) {
      case "X": correction.y = 0; correction.z = 0; break;
      case "Y": correction.x = 0; correction.z = 0; break;
      case "Z": correction.x = 0; correction.y = 0; break;
      case "XY": correction.z = 0; break;
      case "XZ": correction.y = 0; break;
      case "YZ": correction.x = 0; break;
    }
    if (local) correction.applyQuaternion(this.pivot.quaternion);
    return correction;

  }


  private applySnapAtTransformEnd():
    void {

    const snap =
      this.snap
        .getSnapAtCurrentPointer();


    if (
      !snap
      || !this.activeMoveAxis
    ) {

      return;

    }


    const correction =
      this.activeMoveAxis
        === "XYZ"
        ? snap.point
            .clone()
            .sub(
              this.pivot.position,
            )
        : this.getConstrainedSnapCorrection(
            this.activeMoveAxis,
            snap.point,
          );


    if (
      correction.lengthSq()
      <= 1e-18
    ) {

      return;

    }


    if (
      this.dragMode
      === "MOVE_OBJECTS"
      && !this.copySession
    ) {

      for (
        const object
        of this.transformedObjects.values()
      ) {

        object.position.add(
          correction,
        );


        object.updateMatrix();


        object.updateMatrixWorld(
          true,
        );

      }

    }


    this.pivot.position.add(
      correction,
    );


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivotPosition.copy(
      this.pivot.position,
    );

    // Snap correction must land on duplicates, not on source instances.
    if (this.copySession && this.dragMode === "MOVE_OBJECTS") {
      this.copySession.placeCopiesAtOffset(
        this.pivot.position.clone().sub(this.dragStartPivotPosition),
      );
    }

    this.selection.refreshHelpers();

  }


  // ==========================================================
  // COMMIT TRANSFORMS
  // ==========================================================

  private commitTransforms():
    void {

    for (
      const [
        instanceId,
        object,
      ]
      of (this.copySession ? this.copySession.objects : this.transformedObjects)
    ) {

      // Only cloned occurrence IDs may be persisted during Ctrl+COPY.
      if (this.copySession && !this.copySession.ids.includes(instanceId)) {
        throw new Error("COPY intentó modificar una pieza original.");
      }

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


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.selection.refreshHelpers();

  }


  // ==========================================================
  // MODE
  // ==========================================================

  setMode(
    mode:
      DesignTransformMode,
  ): void {

    this.controls.setMode(
      mode,
    );

  }


  getMode():
    DesignTransformMode {

    return (
      this.controls.getMode()
      === "rotate"
    )
      ? "rotate"
      : "translate";

  }


  // ==========================================================
  // SPACE
  // ==========================================================

  setSpace(
    space:
      "world"
      | "local",
  ): void {

    this.requestedTransformSpace = space;
    this.controls.setSpace(
      this.selection.getSelectedIds().length === 1 ? space : "world",
    );

  }


  // ==========================================================
  // DISPOSE
  // ==========================================================

  dispose(): void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.unsubscribeSelection
      ?.();


    this.unsubscribeSelection =
      null;


    this.controls.removeEventListener(
      "mouseDown",
      this.handleTransformStart,
    );


    this.controls.removeEventListener(
      "objectChange",
      this.handleTransformChange,
    );


    this.controls.removeEventListener(
      "mouseUp",
      this.handleTransformEnd,
    );


    this.domElement.removeEventListener(
      "pointerdown", this.handleCtrlCopyPointerDown, true,
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

    window.removeEventListener("keydown", this.handleRepeatCopyKeyDown, true);

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
