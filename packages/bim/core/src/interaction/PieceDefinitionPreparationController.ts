import * as THREE from "three";

import type {
  DesignModel,
  PersistentSnapType,
  PieceDefinition,
  PieceVector3Data,
  ReferenceAxisType,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";


export interface PieceDefinitionPreparationState {

  readonly active:
    boolean;

  readonly instanceId:
    string
    | null;

  readonly definitionId:
    string
    | null;

  readonly code:
    string
    | null;

  readonly name:
    string
    | null;

  readonly snapCount:
    number;

  readonly axisCount:
    number;

}


export type PieceDefinitionPreparationListener =
  (
    state:
      PieceDefinitionPreparationState,
  ) => void;


export class PieceDefinitionPreparationController {

  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly listeners =
    new Set<
      PieceDefinitionPreparationListener
    >();


  private activeInstanceId:
    string
    | null =
      null;


  private readonly editorRoot:
    HTMLDivElement;


  constructor(
    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    pointSelection:
      CadPointSelectionController,

    lineSelection:
      CadLineSelectionController,
  ) {

    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection;


    this.editorRoot =
      this.createEditorRoot();


    this.renderEditor();

  }


  get isActive():
    boolean {

    return this.activeInstanceId
      !== null;

  }


  getState():
    PieceDefinitionPreparationState {

    const context =
      this.getContext();


    if (
      !context
    ) {

      return {
        active:
          false,
        instanceId:
          null,
        definitionId:
          null,
        code:
          null,
        name:
          null,
        snapCount:
          0,
        axisCount:
          0,
      };

    }


    return {
      active:
        true,
      instanceId:
        context.instanceId,
      definitionId:
        context.definition.id,
      code:
        context.definition.code,
      name:
        context.definition.name,
      snapCount:
        context.definition
          .snapPoints
          .length,
      axisCount:
        context.definition
          .referenceGeometry
          .axisLines
          .length,
    };

  }


  start(
    instanceId:
      string,
  ):
    PieceDefinitionPreparationState {

    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );


    if (
      !instance
    ) {

      throw new Error(
        `Cannot prepare piece. PieceInstance "${instanceId}" does not exist.`,
      );

    }


    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          instance.definitionId,
        );


    if (
      !definition
    ) {

      throw new Error(
        `Cannot prepare piece. PieceDefinition "${instance.definitionId}" does not exist.`,
      );

    }


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !object
    ) {

      throw new Error(
        "Cannot prepare piece because its visual instance is not available.",
      );

    }


    this.activeInstanceId =
      instanceId;


    this.notify();


    return this.getState();

  }


  stop():
    void {

    if (
      this.activeInstanceId
      === null
    ) {

      return;

    }


    this.activeInstanceId =
      null;


    this.notify();

  }


  setOriginFromSelectedCadPoint():
    PieceDefinition {

    const pointIds =
      this.pointSelection
        .getSelectedIds();


    if (
      pointIds.length
      !== 1
    ) {

      throw new Error(
        "Select exactly one CadPoint to define the piece origin.",
      );

    }


    const cadPoint =
      this.designModel
        .cadPoints
        .get(
          pointIds[0]!,
        );


    if (
      !cadPoint
    ) {

      throw new Error(
        "The selected CadPoint no longer exists.",
      );

    }


    return this.setOriginFromWorldPoint(
      new THREE.Vector3(
        cadPoint.position.x,
        cadPoint.position.y,
        cadPoint.position.z,
      ),
    );

  }


  setOriginFromWorldPoint(
    worldPoint:
      THREE.Vector3,
  ):
    PieceDefinition {

    const context =
      this.requireContext();


    const assetPoint =
      this.worldToAsset(
        worldPoint,
        context.object,
      );


    const current =
      context.definition
        .coordinateSystem;


    const updated =
      this.designModel
        .pieceDefinitions
        .updateCoordinateSystem(
          context.definition.id,
          {
            origin:
              this.toData(
                assetPoint,
              ),
            xAxis:
              current.xAxis,
            yAxis:
              current.yAxis,
            zAxis:
              current.zAxis,
          },
          true,
        );


    if (
      !updated
    ) {

      throw new Error(
        "Could not update the piece coordinate system.",
      );

    }


    this.designModel
      .pieceDefinitions
      .removeSnapPointsByType(
        context.definition.id,
        "ORIGIN",
      );


    this.designModel
      .pieceDefinitions
      .addSnapPoint(
        context.definition.id,
        {
          name:
            "Origin",
          type:
            "ORIGIN",
          position: {
            x: 0,
            y: 0,
            z: 0,
          },
        },
      );


    const result =
      this.requireDefinition(
        context.definition.id,
      );


    this.notify();


    return result;

  }


  addSelectedCadPointsAsSnaps(
    type:
      PersistentSnapType =
        "CUSTOM",
  ):
    number {

    const context =
      this.requireContext();


    const pointIds =
      this.pointSelection
        .getSelectedIds();


    if (
      pointIds.length < 1
    ) {

      throw new Error(
        "Select one or more CadPoint objects to convert to persistent snaps.",
      );

    }


    let added =
      0;


    for (
      const pointId
      of pointIds
    ) {

      const cadPoint =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !cadPoint
      ) {

        continue;

      }


      const localPoint =
        this.worldToDefinitionLocal(
          new THREE.Vector3(
            cadPoint.position.x,
            cadPoint.position.y,
            cadPoint.position.z,
          ),
          context.object,
          context.definition,
        );


      if (
        this.hasSnapNear(
          context.definition.id,
          localPoint,
        )
      ) {

        continue;

      }


      const index =
        this.requireDefinition(
          context.definition.id,
        )
          .snapPoints
          .length
        + 1;


      this.designModel
        .pieceDefinitions
        .addSnapPoint(
          context.definition.id,
          {
            name:
              `Snap ${index}`,
            type,
            position:
              this.toData(
                localPoint,
              ),
          },
        );


      added +=
        1;

    }


    this.notify();


    return added;

  }


  addSelectedCadLinesAsAxes(
    type:
      ReferenceAxisType =
        "REFERENCE",
  ):
    number {

    const context =
      this.requireContext();


    const lineIds =
      this.lineSelection
        .getSelectedIds();


    if (
      lineIds.length < 1
    ) {

      throw new Error(
        "Select one or more CadLine objects to convert to reference axes.",
      );

    }


    let added =
      0;


    for (
      const lineId
      of lineIds
    ) {

      const cadLine =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !cadLine
      ) {

        continue;

      }


      const start =
        this.worldToDefinitionLocal(
          new THREE.Vector3(
            cadLine.start.x,
            cadLine.start.y,
            cadLine.start.z,
          ),
          context.object,
          context.definition,
        );


      const end =
        this.worldToDefinitionLocal(
          new THREE.Vector3(
            cadLine.end.x,
            cadLine.end.y,
            cadLine.end.z,
          ),
          context.object,
          context.definition,
        );


      const direction =
        end
          .clone()
          .sub(
            start,
          );


      const length =
        direction.length();


      if (
        length <= 1e-12
      ) {

        continue;

      }


      direction.multiplyScalar(
        1 / length,
      );


      const index =
        this.requireDefinition(
          context.definition.id,
        )
          .referenceGeometry
          .axisLines
          .length
        + 1;


      this.designModel
        .pieceDefinitions
        .addReferenceAxisLine(
          context.definition.id,
          {
            name:
              `Axis ${index}`,
            type,
            origin:
              this.toData(
                start,
              ),
            direction:
              this.toData(
                direction,
              ),
            length,
          },
        );


      added +=
        1;

    }


    this.notify();


    return added;

  }


  updateSnap(
    snapId:
      string,

    changes: {
      name?: string;
      type?: PersistentSnapType;
    },
  ):
    PieceDefinition {

    const context =
      this.requireContext();


    const currentSnap =
      context.definition
        .snapPoints
        .find(
          (
            snap,
          ) =>
            snap.id
            === snapId,
        );


    if (
      !currentSnap
    ) {

      throw new Error(
        `Persistent SNAP "${snapId}" does not exist.`,
      );

    }


    if (
      currentSnap.type
      === "ORIGIN"
      && changes.type !== undefined
      && changes.type !== "ORIGIN"
    ) {

      throw new Error(
        "The ORIGIN SNAP cannot change type. Use the origin tool to relocate it.",
      );

    }


    if (
      currentSnap.type
      !== "ORIGIN"
      && changes.type === "ORIGIN"
    ) {

      throw new Error(
        "ORIGIN is managed by the piece coordinate system. Use Origen ← SNAP instead.",
      );

    }


    const name =
      changes.name === undefined
        ? currentSnap.name
        : changes.name.trim();


    if (
      name.length === 0
    ) {

      throw new Error(
        "Persistent SNAP name cannot be empty.",
      );

    }


    const updated:
      PieceDefinition = {

        ...context.definition,

        snapPoints:
          context.definition
            .snapPoints
            .map(
              (
                snap,
              ) =>
                snap.id === snapId
                  ? {
                      ...snap,
                      name,
                      type:
                        changes.type
                        ?? snap.type,
                    }
                  : snap,
            ),

      };


    const result =
      this.replaceDefinition(
        updated,
      );


    this.notify();


    return result;

  }


  removeSnap(
    snapId:
      string,
  ):
    PieceDefinition {

    const context =
      this.requireContext();


    const currentSnap =
      context.definition
        .snapPoints
        .find(
          (
            snap,
          ) =>
            snap.id
            === snapId,
        );


    if (
      !currentSnap
    ) {

      throw new Error(
        `Persistent SNAP "${snapId}" does not exist.`,
      );

    }


    if (
      currentSnap.type
      === "ORIGIN"
    ) {

      throw new Error(
        "The ORIGIN SNAP cannot be deleted. Move it with Origen ← SNAP.",
      );

    }


    const updated:
      PieceDefinition = {

        ...context.definition,

        snapPoints:
          context.definition
            .snapPoints
            .filter(
              (
                snap,
              ) =>
                snap.id
                !== snapId,
            ),

      };


    const result =
      this.replaceDefinition(
        updated,
      );


    this.notify();


    return result;

  }


  updateAxis(
    axisId:
      string,

    changes: {
      name?: string;
      type?: ReferenceAxisType;
    },
  ):
    PieceDefinition {

    const context =
      this.requireContext();


    const currentAxis =
      context.definition
        .referenceGeometry
        .axisLines
        .find(
          (
            axis,
          ) =>
            axis.id
            === axisId,
        );


    if (
      !currentAxis
    ) {

      throw new Error(
        `Reference axis "${axisId}" does not exist.`,
      );

    }


    const name =
      changes.name === undefined
        ? currentAxis.name
        : changes.name.trim();


    if (
      name.length === 0
    ) {

      throw new Error(
        "Reference axis name cannot be empty.",
      );

    }


    const updated:
      PieceDefinition = {

        ...context.definition,

        referenceGeometry: {
          ...context.definition
            .referenceGeometry,

          axisLines:
            context.definition
              .referenceGeometry
              .axisLines
              .map(
                (
                  axis,
                ) =>
                  axis.id === axisId
                    ? {
                        ...axis,
                        name,
                        type:
                          changes.type
                          ?? axis.type,
                      }
                    : axis,
              ),
        },

      };


    const result =
      this.replaceDefinition(
        updated,
      );


    this.notify();


    return result;

  }


  removeAxis(
    axisId:
      string,
  ):
    PieceDefinition {

    const context =
      this.requireContext();


    if (
      !context.definition
        .referenceGeometry
        .axisLines
        .some(
          (
            axis,
          ) =>
            axis.id
            === axisId,
        )
    ) {

      throw new Error(
        `Reference axis "${axisId}" does not exist.`,
      );

    }


    const updated:
      PieceDefinition = {

        ...context.definition,

        referenceGeometry: {
          ...context.definition
            .referenceGeometry,

          axisLines:
            context.definition
              .referenceGeometry
              .axisLines
              .filter(
                (
                  axis,
                ) =>
                  axis.id
                  !== axisId,
              ),
        },

      };


    const result =
      this.replaceDefinition(
        updated,
      );


    this.notify();


    return result;

  }


  subscribe(
    listener:
      PieceDefinitionPreparationListener,
  ):
    () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.getState(),
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  private replaceDefinition(
    updated:
      PieceDefinition,
  ):
    PieceDefinition {

    const registry =
      this.designModel
        .pieceDefinitions;


    const previous =
      registry.get(
        updated.id,
      );


    if (
      !previous
    ) {

      throw new Error(
        `PieceDefinition "${updated.id}" no longer exists.`,
      );

    }


    registry.remove(
      updated.id,
    );


    try {

      return registry.register({
        id:
          updated.id,
        code:
          updated.code,
        name:
          updated.name,
        geometryAssetId:
          updated.geometryAssetId,
        classification:
          updated.classification,
        tags: [
          ...updated.tags,
        ],
        coordinateSystem:
          updated.coordinateSystem,
        snapPoints:
          updated.snapPoints,
        referenceGeometry:
          updated.referenceGeometry,
      });

    }
    catch (
      error
    ) {

      registry.register({
        id:
          previous.id,
        code:
          previous.code,
        name:
          previous.name,
        geometryAssetId:
          previous.geometryAssetId,
        classification:
          previous.classification,
        tags: [
          ...previous.tags,
        ],
        coordinateSystem:
          previous.coordinateSystem,
        snapPoints:
          previous.snapPoints,
        referenceGeometry:
          previous.referenceGeometry,
      });


      throw error;

    }

  }


  private createEditorRoot():
    HTMLDivElement {

    const root =
      document.createElement(
        "div",
      );


    root.style.position =
      "fixed";

    root.style.left =
      "392px";

    root.style.bottom =
      "16px";

    root.style.width =
      "360px";

    root.style.maxHeight =
      "62vh";

    root.style.overflow =
      "auto";

    root.style.zIndex =
      "45";

    root.style.border =
      "1px solid #4b5563";

    root.style.borderRadius =
      "8px";

    root.style.background =
      "rgba(31, 41, 51, 0.97)";

    root.style.color =
      "white";

    root.style.fontFamily =
      "Arial, sans-serif";

    root.style.fontSize =
      "12px";

    root.style.boxShadow =
      "0 8px 24px rgba(0, 0, 0, 0.25)";

    root.style.display =
      "none";


    document.body.appendChild(
      root,
    );


    return root;

  }


  private renderEditor():
    void {

    this.editorRoot.replaceChildren();


    const context =
      this.getContext();


    if (
      !context
    ) {

      this.editorRoot.style.display =
        "none";


      return;

    }


    this.editorRoot.style.display =
      "block";


    const header =
      document.createElement(
        "div",
      );


    header.style.padding =
      "11px 12px";

    header.style.borderBottom =
      "1px solid #4b5563";

    header.style.fontWeight =
      "700";

    header.textContent =
      `Preparar pieza · ${context.definition.code}`;


    this.editorRoot.appendChild(
      header,
    );


    const description =
      document.createElement(
        "div",
      );


    description.style.padding =
      "8px 12px";

    description.style.color =
      "#b8c0c8";

    description.style.lineHeight =
      "1.35";

    description.textContent =
      "Edita la información persistente de la PieceDefinition. Los cambios afectan todas sus instancias.";


    this.editorRoot.appendChild(
      description,
    );


    this.appendSectionTitle(
      `SNAPs (${context.definition.snapPoints.length})`,
    );


    if (
      context.definition
        .snapPoints
        .length === 0
    ) {

      this.appendEmptyMessage(
        "No hay SNAPs persistentes.",
      );

    }
    else {

      for (
        const snap
        of context.definition
          .snapPoints
      ) {

        const row =
          this.createRow();


        const nameButton =
          this.createNameButton(
            snap.name,
            () => {

              const nextName =
                window.prompt(
                  "Nombre del SNAP:",
                  snap.name,
                );


              if (
                nextName === null
              ) {

                return;

              }


              this.runEditorAction(
                () => {

                  this.updateSnap(
                    snap.id,
                    {
                      name:
                        nextName,
                    },
                  );

                },
              );

            },
          );


        row.appendChild(
          nameButton,
        );


        const typeSelect =
          this.createSelect(
            snap.type === "ORIGIN"
              ? [
                  "ORIGIN",
                ]
              : [
                  "CENTER",
                  "CONNECTION",
                  "REFERENCE",
                  "CUSTOM",
                ],
            snap.type,
            snap.type === "ORIGIN",
            (
              value,
            ) => {

              this.runEditorAction(
                () => {

                  this.updateSnap(
                    snap.id,
                    {
                      type:
                        value as PersistentSnapType,
                    },
                  );

                },
              );

            },
          );


        row.appendChild(
          typeSelect,
        );


        const removeButton =
          this.createRemoveButton(
            snap.type === "ORIGIN"
              ? "El origen se mueve con Origen ← SNAP"
              : "Eliminar SNAP persistente",
            snap.type === "ORIGIN",
            () => {

              if (
                !window.confirm(
                  `¿Eliminar SNAP "${snap.name}"?`,
                )
              ) {

                return;

              }


              this.runEditorAction(
                () => {

                  this.removeSnap(
                    snap.id,
                  );

                },
              );

            },
          );


        row.appendChild(
          removeButton,
        );


        this.editorRoot.appendChild(
          row,
        );

      }

    }


    this.appendSectionTitle(
      `Ejes (${context.definition.referenceGeometry.axisLines.length})`,
    );


    if (
      context.definition
        .referenceGeometry
        .axisLines
        .length === 0
    ) {

      this.appendEmptyMessage(
        "No hay ejes de referencia persistentes.",
      );

    }
    else {

      for (
        const axis
        of context.definition
          .referenceGeometry
          .axisLines
      ) {

        const row =
          this.createRow();


        const nameButton =
          this.createNameButton(
            axis.name,
            () => {

              const nextName =
                window.prompt(
                  "Nombre del eje:",
                  axis.name,
                );


              if (
                nextName === null
              ) {

                return;

              }


              this.runEditorAction(
                () => {

                  this.updateAxis(
                    axis.id,
                    {
                      name:
                        nextName,
                    },
                  );

                },
              );

            },
          );


        row.appendChild(
          nameButton,
        );


        const typeSelect =
          this.createSelect(
            [
              "MAIN",
              "HOLE",
              "CONNECTION",
              "REFERENCE",
            ],
            axis.type,
            false,
            (
              value,
            ) => {

              this.runEditorAction(
                () => {

                  this.updateAxis(
                    axis.id,
                    {
                      type:
                        value as ReferenceAxisType,
                    },
                  );

                },
              );

            },
          );


        row.appendChild(
          typeSelect,
        );


        const removeButton =
          this.createRemoveButton(
            "Eliminar eje persistente",
            false,
            () => {

              if (
                !window.confirm(
                  `¿Eliminar eje "${axis.name}"?`,
                )
              ) {

                return;

              }


              this.runEditorAction(
                () => {

                  this.removeAxis(
                    axis.id,
                  );

                },
              );

            },
          );


        row.appendChild(
          removeButton,
        );


        this.editorRoot.appendChild(
          row,
        );

      }

    }


    const footer =
      document.createElement(
        "div",
      );


    footer.style.padding =
      "9px 12px";

    footer.style.borderTop =
      "1px solid #4b5563";

    footer.style.color =
      "#9ca3af";

    footer.textContent =
      "Clic en el nombre para renombrar · selector para cambiar tipo · × para eliminar";


    this.editorRoot.appendChild(
      footer,
    );

  }


  private appendSectionTitle(
    title:
      string,
  ):
    void {

    const element =
      document.createElement(
        "div",
      );


    element.style.padding =
      "9px 12px 6px";

    element.style.fontWeight =
      "700";

    element.style.color =
      "#e5e7eb";

    element.textContent =
      title;


    this.editorRoot.appendChild(
      element,
    );

  }


  private appendEmptyMessage(
    message:
      string,
  ):
    void {

    const element =
      document.createElement(
        "div",
      );


    element.style.padding =
      "6px 12px 10px";

    element.style.color =
      "#9ca3af";

    element.textContent =
      message;


    this.editorRoot.appendChild(
      element,
    );

  }


  private createRow():
    HTMLDivElement {

    const row =
      document.createElement(
        "div",
      );


    row.style.display =
      "grid";

    row.style.gridTemplateColumns =
      "1fr 118px 30px";

    row.style.gap =
      "6px";

    row.style.alignItems =
      "center";

    row.style.padding =
      "5px 8px";

    row.style.borderTop =
      "1px solid rgba(75, 85, 99, 0.55)";


    return row;

  }


  private createNameButton(
    name:
      string,

    onClick:
      () => void,
  ):
    HTMLButtonElement {

    const button =
      document.createElement(
        "button",
      );


    button.type =
      "button";

    button.textContent =
      name;

    button.title =
      "Renombrar";

    button.style.minWidth =
      "0";

    button.style.overflow =
      "hidden";

    button.style.textOverflow =
      "ellipsis";

    button.style.whiteSpace =
      "nowrap";

    button.style.padding =
      "6px 7px";

    button.style.border =
      "none";

    button.style.borderRadius =
      "4px";

    button.style.background =
      "transparent";

    button.style.color =
      "white";

    button.style.textAlign =
      "left";

    button.style.cursor =
      "pointer";


    button.addEventListener(
      "click",
      onClick,
    );


    return button;

  }


  private createSelect(
    values:
      readonly string[],

    current:
      string,

    disabled:
      boolean,

    onChange:
      (
        value: string,
      ) => void,
  ):
    HTMLSelectElement {

    const select =
      document.createElement(
        "select",
      );


    select.disabled =
      disabled;

    select.style.width =
      "100%";

    select.style.padding =
      "5px";

    select.style.border =
      "1px solid #596875";

    select.style.borderRadius =
      "4px";

    select.style.background =
      "#111827";

    select.style.color =
      "white";

    select.style.fontSize =
      "11px";


    for (
      const value
      of values
    ) {

      const option =
        document.createElement(
          "option",
        );


      option.value =
        value;

      option.textContent =
        value;

      option.selected =
        value === current;


      select.appendChild(
        option,
      );

    }


    select.addEventListener(
      "change",
      () => {

        onChange(
          select.value,
        );

      },
    );


    return select;

  }


  private createRemoveButton(
    title:
      string,

    disabled:
      boolean,

    onClick:
      () => void,
  ):
    HTMLButtonElement {

    const button =
      document.createElement(
        "button",
      );


    button.type =
      "button";

    button.textContent =
      "×";

    button.title =
      title;

    button.disabled =
      disabled;

    button.style.width =
      "28px";

    button.style.height =
      "28px";

    button.style.border =
      "none";

    button.style.borderRadius =
      "4px";

    button.style.background =
      "transparent";

    button.style.color =
      disabled
        ? "#6b7280"
        : "#f3f4f6";

    button.style.fontSize =
      "18px";

    button.style.cursor =
      disabled
        ? "default"
        : "pointer";


    button.addEventListener(
      "click",
      onClick,
    );


    return button;

  }


  private runEditorAction(
    action:
      () => void,
  ):
    void {

    try {

      action();

    }
    catch (
      error
    ) {

      window.alert(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );


      this.renderEditor();

    }

  }


  private getContext():
    {
      instanceId: string;
      definition: PieceDefinition;
      object: THREE.Object3D;
    }
    | null {

    const instanceId =
      this.activeInstanceId;


    if (
      !instanceId
    ) {

      return null;

    }


    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );


    if (
      !instance
    ) {

      return null;

    }


    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          instance.definitionId,
        );


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !definition
      || !object
    ) {

      return null;

    }


    return {
      instanceId,
      definition,
      object,
    };

  }


  private requireContext():
    {
      instanceId: string;
      definition: PieceDefinition;
      object: THREE.Object3D;
    } {

    const context =
      this.getContext();


    if (
      !context
    ) {

      throw new Error(
        "No PieceDefinition is currently in preparation mode.",
      );

    }


    return context;

  }


  private requireDefinition(
    definitionId:
      string,
  ):
    PieceDefinition {

    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          definitionId,
        );


    if (
      !definition
    ) {

      throw new Error(
        `PieceDefinition "${definitionId}" no longer exists.`,
      );

    }


    return definition;

  }


  private worldToAsset(
    worldPoint:
      THREE.Vector3,

    instanceObject:
      THREE.Object3D,
  ):
    THREE.Vector3 {

    instanceObject
      .updateMatrixWorld(
        true,
      );


    const inverse =
      instanceObject.matrixWorld
        .clone()
        .invert();


    return worldPoint
      .clone()
      .applyMatrix4(
        inverse,
      );

  }


  private worldToDefinitionLocal(
    worldPoint:
      THREE.Vector3,

    instanceObject:
      THREE.Object3D,

    definition:
      PieceDefinition,
  ):
    THREE.Vector3 {

    const assetPoint =
      this.worldToAsset(
        worldPoint,
        instanceObject,
      );


    const origin =
      new THREE.Vector3(
        definition.coordinateSystem
          .origin.x,
        definition.coordinateSystem
          .origin.y,
        definition.coordinateSystem
          .origin.z,
      );


    const delta =
      assetPoint
        .sub(
          origin,
        );


    return new THREE.Vector3(
      delta.dot(
        this.fromData(
          definition.coordinateSystem
            .xAxis,
        ),
      ),
      delta.dot(
        this.fromData(
          definition.coordinateSystem
            .yAxis,
        ),
      ),
      delta.dot(
        this.fromData(
          definition.coordinateSystem
            .zAxis,
        ),
      ),
    );

  }


  private hasSnapNear(
    definitionId:
      string,

    point:
      THREE.Vector3,
  ):
    boolean {

    const definition =
      this.requireDefinition(
        definitionId,
      );


    return definition.snapPoints.some(
      (
        snap,
      ) =>
        point.distanceToSquared(
          this.fromData(
            snap.position,
          ),
        )
        <= 1e-12,
    );

  }


  private fromData(
    vector:
      PieceVector3Data,
  ):
    THREE.Vector3 {

    return new THREE.Vector3(
      vector.x,
      vector.y,
      vector.z,
    );

  }


  private toData(
    vector:
      THREE.Vector3,
  ):
    PieceVector3Data {

    return {
      x:
        vector.x,
      y:
        vector.y,
      z:
        vector.z,
    };

  }


  private notify():
    void {

    this.renderEditor();


    const state =
      this.getState();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        state,
      );

    }

  }


  dispose():
    void {

    this.activeInstanceId =
      null;


    this.listeners.clear();


    this.editorRoot.remove();

  }

}
