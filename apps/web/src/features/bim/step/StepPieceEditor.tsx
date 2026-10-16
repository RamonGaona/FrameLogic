import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
} from "react";

import {
  createBimCore,
} from "@framelogic/bim-core";

import type {
  BimCoreInstance,
  CameraOrientation,
  CameraProjectionMode,
  CardinalDirection,
  LocalCoordinateSystem,
  PieceSnapPoint,
  ReferenceAxisLine,
  StandardView,
} from "@framelogic/bim-core";

import {
  ViewCube,
} from "../components/ViewCube";

import {
  convertStepToFrameLogicIfc,
} from "./stepToFrameLogicIfc";

import type {
  StepConversionResult,
} from "./stepToFrameLogicIfc";

import {
  buildPreparedFrameLogicIfc,
} from "./buildPreparedFrameLogicIfc";


export interface StepPieceEditorProps {
  initialFile: File;
  onExit: () => void;
}


type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];


interface PreparedDefinitionSnapshot {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly geometryAssetId: string;
  readonly classification?: string;
  readonly tags: readonly string[];
  readonly coordinateSystem: LocalCoordinateSystem;
  readonly snapPoints: readonly PieceSnapPoint[];
  readonly referenceGeometry: {
    readonly axisLines: readonly ReferenceAxisLine[];
  };
}


function fileBaseName(
  fileName: string,
): string {

  return fileName
    .replace(
      /\.(?:step|stp)$/i,
      "",
    )
    .trim();

}


function defaultCodeForFile(
  fileName: string,
): string {

  return fileBaseName(
    fileName,
  )
    .replace(
      /\s+/g,
      "_",
    )
    .toUpperCase();

}


function multiplyMatrix3(
  a: Matrix3,
  b: Matrix3,
): Matrix3 {

  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];

}


function createEulerRotationMatrix(
  xDegrees: number,
  yDegrees: number,
  zDegrees: number,
): Matrix3 {

  const toRadians =
    Math.PI / 180;

  const x =
    xDegrees * toRadians;
  const y =
    yDegrees * toRadians;
  const z =
    zDegrees * toRadians;

  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);

  const rotateX: Matrix3 = [
    1, 0, 0,
    0, cx, -sx,
    0, sx, cx,
  ];

  const rotateY: Matrix3 = [
    cy, 0, sy,
    0, 1, 0,
    -sy, 0, cy,
  ];

  const rotateZ: Matrix3 = [
    cz, -sz, 0,
    sz, cz, 0,
    0, 0, 1,
  ];

  return multiplyMatrix3(
    multiplyMatrix3(
      rotateZ,
      rotateY,
    ),
    rotateX,
  );

}


function installStepCameraTuning(
  core: BimCoreInstance,
): () => void {

  const controls =
    core.world.camera.controls as
      typeof core.world.camera.controls
      & {
        azimuthRotateSpeed: number;
        polarRotateSpeed: number;
        smoothTime: number;
        draggingSmoothTime: number;
      };

  controls.azimuthRotateSpeed =
    1.8;
  controls.polarRotateSpeed =
    1.8;
  controls.dollySpeed =
    1.15;
  controls.smoothTime =
    0.12;
  controls.draggingSmoothTime =
    0.07;

  const update =
    (): void => {

      const minimumTruckSpeed =
        core.getCameraProjectionMode()
        === "ORTHOGRAPHIC"
          ? 6
          : 2.5;

      controls.truckSpeed =
        Math.max(
          controls.truckSpeed,
          minimumTruckSpeed,
        );

    };

  controls.addEventListener(
    "update",
    update,
  );

  update();

  return () => {

    controls.removeEventListener(
      "update",
      update,
    );

  };

}


function cloneCoordinateSystem(
  source: LocalCoordinateSystem,
): LocalCoordinateSystem {

  return {
    origin: {
      ...source.origin,
    },
    xAxis: {
      ...source.xAxis,
    },
    yAxis: {
      ...source.yAxis,
    },
    zAxis: {
      ...source.zAxis,
    },
  };

}


function captureDefinitionSnapshot(
  core: BimCoreInstance,
  definitionId: string,
): PreparedDefinitionSnapshot | null {

  const definition =
    core.designModel
      .pieceDefinitions
      .get(
        definitionId,
      );

  if (
    !definition
  ) {

    return null;

  }

  return {
    id:
      definition.id,
    code:
      definition.code,
    name:
      definition.name,
    geometryAssetId:
      definition.geometryAssetId,
    classification:
      definition.classification,
    tags: [
      ...definition.tags,
    ],
    coordinateSystem:
      cloneCoordinateSystem(
        definition.coordinateSystem,
      ),
    snapPoints:
      definition.snapPoints.map(
        (
          snap,
        ) => ({
          ...snap,
          position: {
            ...snap.position,
          },
        }),
      ),
    referenceGeometry: {
      axisLines:
        definition.referenceGeometry
          .axisLines
          .map(
            (
              axis,
            ) => ({
              ...axis,
              origin: {
                ...axis.origin,
              },
              direction: {
                ...axis.direction,
              },
            }),
          ),
    },
  };

}


function definitionsEqual(
  first: PreparedDefinitionSnapshot,
  second: PreparedDefinitionSnapshot,
): boolean {

  return JSON.stringify(
    first,
  ) === JSON.stringify(
    second,
  );

}


function applyDefinitionWorkspaceTransform(
  core: BimCoreInstance,
  instanceId: string,
  coordinateSystem: LocalCoordinateSystem,
): void {

  const object =
    core.designScene
      .getInstanceObject(
        instanceId,
      );

  if (
    !object
  ) {

    return;

  }

  const origin =
    coordinateSystem.origin;
  const xAxis =
    coordinateSystem.xAxis;
  const yAxis =
    coordinateSystem.yAxis;
  const zAxis =
    coordinateSystem.zAxis;

  object.matrixAutoUpdate =
    false;

  object.matrix.set(
    xAxis.x,
    xAxis.y,
    xAxis.z,
    -(
      xAxis.x * origin.x
      + xAxis.y * origin.y
      + xAxis.z * origin.z
    ),

    yAxis.x,
    yAxis.y,
    yAxis.z,
    -(
      yAxis.x * origin.x
      + yAxis.y * origin.y
      + yAxis.z * origin.z
    ),

    zAxis.x,
    zAxis.y,
    zAxis.z,
    -(
      zAxis.x * origin.x
      + zAxis.y * origin.y
      + zAxis.z * origin.z
    ),

    0,
    0,
    0,
    1,
  );

  object.matrixWorldNeedsUpdate =
    true;

  object.updateMatrixWorld(
    true,
  );

  core.designSelection
    .refreshHelpers();

  core.pieceDefinitionHelpers
    .sync();

}


function restoreDefinitionSnapshot(
  core: BimCoreInstance,
  instanceId: string,
  snapshot: PreparedDefinitionSnapshot,
): void {

  const registry =
    core.designModel
      .pieceDefinitions;

  const previous =
    registry.get(
      snapshot.id,
    );

  if (
    !previous
  ) {

    return;

  }

  registry.remove(
    snapshot.id,
  );

  try {

    registry.register({
      id:
        snapshot.id,
      code:
        snapshot.code,
      name:
        snapshot.name,
      geometryAssetId:
        snapshot.geometryAssetId,
      classification:
        snapshot.classification,
      tags: [
        ...snapshot.tags,
      ],
      coordinateSystem:
        cloneCoordinateSystem(
          snapshot.coordinateSystem,
        ),
      snapPoints:
        snapshot.snapPoints,
      referenceGeometry:
        snapshot.referenceGeometry,
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

  applyDefinitionWorkspaceTransform(
    core,
    instanceId,
    snapshot.coordinateSystem,
  );

}


function recordDefinitionHistory(
  core: BimCoreInstance,
  instanceId: string,
  label: string,
  before: PreparedDefinitionSnapshot,
  after: PreparedDefinitionSnapshot,
): void {

  if (
    definitionsEqual(
      before,
      after,
    )
  ) {

    return;

  }

  core.cadHistory
    .recordOperation(
      label,
      () => {

        restoreDefinitionSnapshot(
          core,
          instanceId,
          before,
        );

      },
      () => {

        restoreDefinitionSnapshot(
          core,
          instanceId,
          after,
        );

      },
    );

}


function downloadFile(
  file: File,
): void {

  const url =
    URL.createObjectURL(
      file,
    );

  const link =
    document.createElement(
      "a",
    );

  link.href =
    url;
  link.download =
    file.name;

  document.body.appendChild(
    link,
  );

  link.click();
  link.remove();

  window.setTimeout(
    () => {

      URL.revokeObjectURL(
        url,
      );

    },
    0,
  );

}


export function StepPieceEditor({
  initialFile,
  onExit,
}: StepPieceEditorProps) {

  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );

  const replacementInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const coreRef =
    useRef<BimCoreInstance | null>(
      null,
    );

  const preparedInstanceIdRef =
    useRef<string | null>(
      null,
    );

  const preparedDefinitionIdRef =
    useRef<string | null>(
      null,
    );

  const pendingOriginBeforeRef =
    useRef<PreparedDefinitionSnapshot | null>(
      null,
    );

  const [sourceFile, setSourceFile] =
    useState<File>(
      initialFile,
    );

  const [code, setCode] =
    useState(
      defaultCodeForFile(
        initialFile.name,
      ),
    );

  const [name, setName] =
    useState(
      fileBaseName(
        initialFile.name,
      ),
    );

  const [classification, setClassification] =
    useState("");

  const [tagsText, setTagsText] =
    useState("");

  const [ready, setReady] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [exporting, setExporting] =
    useState(false);

  const [prepared, setPrepared] =
    useState(false);

  const [conversion, setConversion] =
    useState<StepConversionResult | null>(
      null,
    );

  const [message, setMessage] =
    useState(
      "Completa los datos básicos y pulsa Cargar STEP y preparar.",
    );

  const [rotationX, setRotationX] =
    useState("0");

  const [rotationY, setRotationY] =
    useState("0");

  const [rotationZ, setRotationZ] =
    useState("0");

  const [cameraOrientation, setCameraOrientation] =
    useState<CameraOrientation>({
      azimuth:
        Math.PI / 4,
      polar:
        Math.PI / 3,
    });

  const [projectionMode, setProjectionMode] =
    useState<CameraProjectionMode>(
      "PERSPECTIVE",
    );


  function finalizePendingOriginHistory(
    core: BimCoreInstance,
  ): void {

    const before =
      pendingOriginBeforeRef.current;

    if (
      !before
    ) {

      return;

    }

    pendingOriginBeforeRef.current =
      null;

    const definitionId =
      preparedDefinitionIdRef.current;

    const instanceId =
      preparedInstanceIdRef.current;

    if (
      !definitionId
      || !instanceId
    ) {

      return;

    }

    const after =
      captureDefinitionSnapshot(
        core,
        definitionId,
      );

    if (
      !after
    ) {

      return;

    }

    recordDefinitionHistory(
      core,
      instanceId,
      "PIECE ORIGIN",
      before,
      after,
    );

  }


  useEffect(
    () => {

      const container =
        containerRef.current;

    if (
      !container
    ) {

      return;

    }

    let disposed =
      false;

    let unsubscribeCamera:
      (() => void)
      | null =
        null;

    let unsubscribeOriginEdit:
      (() => void)
      | null =
        null;

    let removeStepCameraTuning:
      (() => void)
      | null =
        null;

    void createBimCore(
      container,
    )
      .then(
        (
          core,
        ) => {

          if (
            disposed
          ) {

            core.dispose();
            return;

          }

          coreRef.current =
            core;

          removeStepCameraTuning =
            installStepCameraTuning(
              core,
            );

          setProjectionMode(
            core.getCameraProjectionMode(),
          );

          unsubscribeCamera =
            core.subscribeCameraOrientation(
              (
                orientation,
              ) => {

                if (
                  disposed
                ) {

                  return;

                }

                setCameraOrientation(
                  orientation,
                );

              },
            );

          unsubscribeOriginEdit =
            core.subscribePieceDefinitionOriginEdit(
              (
                state,
              ) => {

                if (
                  disposed
                  || state.active
                ) {

                  return;

                }

                finalizePendingOriginHistory(
                  core,
                );

              },
            );

          setReady(true);

        },
      )
      .catch(
        (
          error: unknown,
        ) => {

          console.error(
            "Error initializing STEP piece editor:",
            error,
          );

          setMessage(
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
          );

        },
      );

    return () => {

      disposed =
        true;

      unsubscribeCamera
        ?.();

      unsubscribeOriginEdit
        ?.();

      removeStepCameraTuning
        ?.();

      coreRef.current
        ?.dispose();

      coreRef.current =
        null;

    };

  },
  []);


  function handleStandardView(
    view: StandardView,
  ): void {

    void coreRef.current
      ?.setStandardView(
        view,
      );

  }


  function handleCardinalDirection(
    direction: CardinalDirection,
  ): void {

    void coreRef.current
      ?.setCardinalDirection(
        direction,
      );

  }


  async function handleToggleProjection():
    Promise<void> {

    const core =
      coreRef.current;

    if (
      !core
    ) {

      return;

    }

    try {

      const mode =
        await core.toggleCameraProjection();

      setProjectionMode(
        mode,
      );

      core.world.camera.controls.truckSpeed =
        Math.max(
          core.world.camera.controls.truckSpeed,
          mode === "ORTHOGRAPHIC"
            ? 6
            : 2.5,
        );

    }
    catch (
      error
    ) {

      console.error(
        "Error changing STEP editor camera projection:",
        error,
      );

    }

  }


  function resetIdentityForFile(
    file: File,
  ): void {

    setSourceFile(file);
    setCode(
      defaultCodeForFile(
        file.name,
      ),
    );
    setName(
      fileBaseName(
        file.name,
      ),
    );
    setClassification("");
    setTagsText("");
    setConversion(null);
    setPrepared(false);
    setRotationX("0");
    setRotationY("0");
    setRotationZ("0");

    preparedInstanceIdRef.current =
      null;
    preparedDefinitionIdRef.current =
      null;
    pendingOriginBeforeRef.current =
      null;

    setMessage(
      "Completa los datos básicos y pulsa Cargar STEP y preparar.",
    );

  }


  function handleReplacementFile(
    event: ChangeEvent<HTMLInputElement>,
  ): void {

    const file =
      event.target.files?.[0];

    event.target.value =
      "";

    if (
      file
    ) {

      resetIdentityForFile(
        file,
      );

    }

  }


  async function handlePrepare():
    Promise<void> {

    const core =
      coreRef.current;

    if (
      !core
      || !ready
      || loading
      || prepared
    ) {

      return;

    }

    const normalizedCode =
      code.trim();

    const normalizedName =
      name.trim()
      || normalizedCode;

    if (
      normalizedCode.length === 0
    ) {

      window.alert(
        "El código de la pieza es obligatorio.",
      );

      return;

    }

    const tags =
      tagsText
        .split(",")
        .map(
          (
            tag,
          ) =>
            tag.trim(),
        )
        .filter(Boolean);

    try {

      setLoading(true);

      setMessage(
        "Leyendo STEP con OpenCascade y generando IFC de trabajo...",
      );

      const result =
        await convertStepToFrameLogicIfc(
          sourceFile,
          {
            code:
              normalizedCode,
            name:
              normalizedName,
            classification:
              classification.trim()
              || undefined,
            tags,
          },
        );

      setMessage(
        "Cargando la pieza en el editor FrameLogic...",
      );

      const {
        definition,
      } =
        await core.importDesignPieceIfc(
          result.ifcFile,
          {
            code:
              normalizedCode,
            name:
              normalizedName,
            classification:
              classification.trim()
              || undefined,
            tags,
          },
        );

      const instance =
        core.createDesignPieceInstance({
          definitionId:
            definition.id,
          transform: {
            position: {
              x: 0,
              y: 0,
              z: 0,
            },
            rotation: {
              x: 0,
              y: 0,
              z: 0,
            },
          },
          tags: [],
        });

      preparedInstanceIdRef.current =
        instance.id;

      preparedDefinitionIdRef.current =
        definition.id;

      core.startPieceDefinitionPreparation(
        instance.id,
      );

      await core.setStandardView(
        "ISO",
      );

      setConversion(result);
      setPrepared(true);

      setMessage(
        `STEP cargado · ${result.sourceMeshCount} mesh · ${result.vertexCount.toLocaleString()} vértices · ${result.triangleCount.toLocaleString()} triángulos.`,
      );

    }
    catch (
      error
    ) {

      console.error(
        "STEP preparation failed:",
        error,
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      setMessage(
        errorMessage,
      );

      window.alert(
        `No se pudo preparar el STEP.\n\n${errorMessage}`,
      );

    }
    finally {

      setLoading(false);

    }

  }


  function handleStartOriginEdit(): void {

    const core =
      coreRef.current;

    const definitionId =
      preparedDefinitionIdRef.current;

    if (
      !core
      || !definitionId
    ) {

      return;

    }

    pendingOriginBeforeRef.current =
      captureDefinitionSnapshot(
        core,
        definitionId,
      );

    try {

      core.startPreparedPieceOriginSnapEdit();

    }
    catch (
      error
    ) {

      pendingOriginBeforeRef.current =
        null;

      window.alert(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );

    }

  }


  function applyPieceOrientation(
    xDegrees: number,
    yDegrees: number,
    zDegrees: number,
  ): void {

    const core =
      coreRef.current;

    const instanceId =
      preparedInstanceIdRef.current;

    const definitionId =
      preparedDefinitionIdRef.current;

    if (
      !core
      || !instanceId
      || !definitionId
    ) {

      return;

    }

    if (
      !Number.isFinite(xDegrees)
      || !Number.isFinite(yDegrees)
      || !Number.isFinite(zDegrees)
    ) {

      window.alert(
        "Los ángulos Rx, Ry y Rz deben ser números válidos.",
      );

      return;

    }

    const before =
      captureDefinitionSnapshot(
        core,
        definitionId,
      );

    const currentDefinition =
      core.designModel
        .pieceDefinitions
        .get(
          definitionId,
        );

    if (
      !before
      || !currentDefinition
    ) {

      window.alert(
        "La PieceDefinition ya no está disponible.",
      );

      return;

    }

    const rotation =
      createEulerRotationMatrix(
        xDegrees,
        yDegrees,
        zDegrees,
      );

    const updated =
      core.designModel
        .pieceDefinitions
        .updateCoordinateSystem(
          definitionId,
          {
            origin:
              currentDefinition.coordinateSystem.origin,
            xAxis: {
              x: rotation[0],
              y: rotation[1],
              z: rotation[2],
            },
            yAxis: {
              x: rotation[3],
              y: rotation[4],
              z: rotation[5],
            },
            zAxis: {
              x: rotation[6],
              y: rotation[7],
              z: rotation[8],
            },
          },
          true,
        );

    if (
      !updated
    ) {

      window.alert(
        "No se pudo actualizar la orientación local de la pieza.",
      );

      return;

    }

    applyDefinitionWorkspaceTransform(
      core,
      instanceId,
      updated.coordinateSystem,
    );

    const after =
      captureDefinitionSnapshot(
        core,
        definitionId,
      );

    if (
      after
    ) {

      recordDefinitionHistory(
        core,
        instanceId,
        "PIECE ORIENTATION",
        before,
        after,
      );

    }

    setMessage(
      `Orientación local aplicada · Rx ${xDegrees}° · Ry ${yDegrees}° · Rz ${zDegrees}°. Ctrl+Z la restaura.`,
    );

  }


  function setOrientationPreset(
    xDegrees: number,
    yDegrees: number,
    zDegrees: number,
  ): void {

    setRotationX(
      String(
        xDegrees,
      ),
    );
    setRotationY(
      String(
        yDegrees,
      ),
    );
    setRotationZ(
      String(
        zDegrees,
      ),
    );

    applyPieceOrientation(
      xDegrees,
      yDegrees,
      zDegrees,
    );

  }


  function handleApplyManualOrientation(): void {

    applyPieceOrientation(
      Number(
        rotationX,
      ),
      Number(
        rotationY,
      ),
      Number(
        rotationZ,
      ),
    );

  }


  async function handleDownloadPreparedIfc():
    Promise<void> {

    const core =
      coreRef.current;

    const definitionId =
      preparedDefinitionIdRef.current;

    if (
      !core
      || !definitionId
      || !conversion
      || exporting
    ) {

      return;

    }

    const definition =
      core.designModel
        .pieceDefinitions
        .get(
          definitionId,
        );

    if (
      !definition
    ) {

      window.alert(
        "La PieceDefinition ya no está disponible.",
      );

      return;

    }

    try {

      setExporting(true);

      setMessage(
        "Generando IFC FrameLogic con el origen, orientación, SNAPs y ejes actuales...",
      );

      const finalIfc =
        await buildPreparedFrameLogicIfc({
          baseIfcFile:
            conversion.ifcFile,
          sourceStepFileName:
            sourceFile.name,
          code:
            definition.code,
          name:
            definition.name,
          classification:
            definition.classification,
          tags:
            definition.tags,
          coordinateSystem:
            definition.coordinateSystem,
          snapPoints:
            definition.snapPoints,
          axisLines:
            definition.referenceGeometry
              .axisLines,
        });

      downloadFile(
        finalIfc,
      );

      setMessage(
        "IFC FrameLogic generado. La geometría ya quedó horneada en el sistema local preparado: el origen definido es (0,0,0) y la orientación elegida pasa a ser la orientación base del IFC.",
      );

    }
    catch (
      error
    ) {

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      console.error(
        "Prepared IFC export failed:",
        error,
      );

      setMessage(
        errorMessage,
      );

      window.alert(
        `No se pudo generar el IFC FrameLogic.\n\n${errorMessage}`,
      );

    }
    finally {

      setExporting(false);

    }

  }


  const controlStyle = {
    padding:
      "7px 10px",
    border:
      "1px solid #596875",
    borderRadius:
      "5px",
    background:
      "#111827",
    color:
      "white",
    fontSize:
      "12px",
  } as const;

  const buttonStyle = {
    padding:
      "8px 11px",
    border:
      "1px solid #596875",
    borderRadius:
      "5px",
    background:
      "#1f2933",
    color:
      "white",
    cursor:
      "pointer",
    fontSize:
      "12px",
  } as const;

  const compactButtonStyle = {
    ...buttonStyle,
    padding:
      "6px 8px",
    fontSize:
      "11px",
  } as const;

  const angleInputStyle = {
    ...controlStyle,
    width:
      "64px",
    boxSizing:
      "border-box",
  } as const;

  const standardViews:
    readonly {
      readonly label: string;
      readonly view: StandardView;
    }[] = [
      {
        label: "TOP",
        view: "TOP",
      },
      {
        label: "FRONT",
        view: "FRONT",
      },
      {
        label: "RIGHT",
        view: "RIGHT",
      },
      {
        label: "LEFT",
        view: "LEFT",
      },
      {
        label: "BACK",
        view: "BACK",
      },
      {
        label: "BOTTOM",
        view: "BOTTOM",
      },
      {
        label: "ISO",
        view: "ISO",
      },
    ];


  return (
    <div
      style={{
        position:
          "relative",
        width:
          "100vw",
        height:
          "100vh",
        overflow:
          "hidden",
        background:
          "#1f2933",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position:
            "absolute",
          inset:
            0,
        }}
      />

      <ViewCube
        orientation={cameraOrientation}
        projectionMode={projectionMode}
        onViewChange={handleStandardView}
        onCardinalChange={handleCardinalDirection}
        onToggleProjection={
          () => {

            void handleToggleProjection();

          }
        }
      />

      <div
        style={{
          position:
            "absolute",
          top:
            "16px",
          left:
            "16px",
          zIndex:
            80,
          width:
            "390px",
          maxHeight:
            "calc(100vh - 32px)",
          overflowY:
            "auto",
          padding:
            "14px",
          border:
            "1px solid #4b5563",
          borderRadius:
            "8px",
          background:
            "rgba(31, 41, 51, 0.97)",
          color:
            "white",
          fontFamily:
            "Arial, sans-serif",
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap:
              "8px",
            marginBottom:
              "12px",
          }}
        >
          <strong>
            Editor STEP → FrameLogic
          </strong>

          <button
            type="button"
            style={buttonStyle}
            onClick={onExit}
          >
            Salir
          </button>
        </div>

        <div
          style={{
            marginBottom:
              "12px",
            padding:
              "9px",
            borderRadius:
              "5px",
            background:
              "rgba(17,24,39,0.75)",
            fontSize:
              "12px",
            lineHeight:
              1.4,
          }}
        >
          <div>
            <strong>STEP:</strong> {sourceFile.name}
          </div>
          <div>
            Workspace independiente · una sola pieza · origen local (0,0,0).
          </div>
        </div>

        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "9px",
            fontSize:
              "12px",
          }}
        >
          Código *
          <input
            value={code}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setCode(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>

        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "9px",
            fontSize:
              "12px",
          }}
        >
          Nombre *
          <input
            value={name}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setName(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>

        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "9px",
            fontSize:
              "12px",
          }}
        >
          Clasificación
          <input
            value={classification}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setClassification(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>

        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "12px",
            fontSize:
              "12px",
          }}
        >
          Tags separados por coma
          <input
            value={tagsText}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setTagsText(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>

        {
          !prepared
          && (
            <div
              style={{
                display:
                  "flex",
                gap:
                  "8px",
                flexWrap:
                  "wrap",
              }}
            >
              <button
                type="button"
                style={buttonStyle}
                disabled={!ready || loading}
                onClick={
                  () => {

                    void handlePrepare();

                  }
                }
              >
                {
                  loading
                    ? "Procesando STEP..."
                    : "Cargar STEP y preparar"
                }
              </button>

              <button
                type="button"
                style={buttonStyle}
                disabled={loading}
                onClick={
                  () => {

                    replacementInputRef.current
                      ?.click();

                  }
                }
              >
                Elegir otro STEP
              </button>
            </div>
          )
        }

        {
          prepared
          && (
            <>
              <hr
                style={{
                  border:
                    0,
                  borderTop:
                    "1px solid #4b5563",
                  margin:
                    "13px 0",
                }}
              />

              <div
                style={{
                  marginBottom:
                    "8px",
                  fontWeight:
                    700,
                  fontSize:
                    "12px",
                }}
              >
                Vistas
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "5px",
                  flexWrap:
                    "wrap",
                  marginBottom:
                    "12px",
                }}
              >
                {
                  standardViews.map(
                    (
                      item,
                    ) => (
                      <button
                        key={item.view}
                        type="button"
                        style={compactButtonStyle}
                        onClick={
                          () => {

                            handleStandardView(
                              item.view,
                            );

                          }
                        }
                      >
                        {item.label}
                      </button>
                    ),
                  )
                }

                <button
                  type="button"
                  style={compactButtonStyle}
                  onClick={
                    () => {

                      void handleToggleProjection();

                    }
                  }
                >
                  {
                    projectionMode === "PERSPECTIVE"
                      ? "ORTO"
                      : "PERS"
                  }
                </button>
              </div>

              <div
                style={{
                  marginBottom:
                    "8px",
                  fontWeight:
                    700,
                  fontSize:
                    "12px",
                }}
              >
                Orientación de la pieza
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "5px",
                  flexWrap:
                    "wrap",
                  marginBottom:
                    "8px",
                }}
              >
                <button
                  type="button"
                  style={compactButtonStyle}
                  onClick={
                    () => {

                      setOrientationPreset(
                        0,
                        90,
                        0,
                      );

                    }
                  }
                >
                  Z STEP → X
                </button>

                <button
                  type="button"
                  style={compactButtonStyle}
                  onClick={
                    () => {

                      setOrientationPreset(
                        -90,
                        0,
                        0,
                      );

                    }
                  }
                >
                  Z STEP → Y
                </button>

                <button
                  type="button"
                  style={compactButtonStyle}
                  onClick={
                    () => {

                      setOrientationPreset(
                        0,
                        0,
                        0,
                      );

                    }
                  }
                >
                  Z STEP → Z
                </button>
              </div>

              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "end",
                  gap:
                    "6px",
                  flexWrap:
                    "wrap",
                  marginBottom:
                    "12px",
                }}
              >
                <label
                  style={{
                    display:
                      "grid",
                    gap:
                      "3px",
                    fontSize:
                      "11px",
                  }}
                >
                  Rx °
                  <input
                    type="number"
                    step="1"
                    value={rotationX}
                    onChange={
                      (
                        event,
                      ) => {

                        setRotationX(
                          event.target.value,
                        );

                      }
                    }
                    style={angleInputStyle}
                  />
                </label>

                <label
                  style={{
                    display:
                      "grid",
                    gap:
                      "3px",
                    fontSize:
                      "11px",
                  }}
                >
                  Ry °
                  <input
                    type="number"
                    step="1"
                    value={rotationY}
                    onChange={
                      (
                        event,
                      ) => {

                        setRotationY(
                          event.target.value,
                        );

                      }
                    }
                    style={angleInputStyle}
                  />
                </label>

                <label
                  style={{
                    display:
                      "grid",
                    gap:
                      "3px",
                    fontSize:
                      "11px",
                  }}
                >
                  Rz °
                  <input
                    type="number"
                    step="1"
                    value={rotationZ}
                    onChange={
                      (
                        event,
                      ) => {

                        setRotationZ(
                          event.target.value,
                        );

                      }
                    }
                    style={angleInputStyle}
                  />
                </label>

                <button
                  type="button"
                  style={compactButtonStyle}
                  onClick={handleApplyManualOrientation}
                >
                  Aplicar giro
                </button>
              </div>

              <div
                style={{
                  marginTop:
                    "-5px",
                  marginBottom:
                    "12px",
                  fontSize:
                    "10px",
                  color:
                    "#9ca3af",
                  lineHeight:
                    1.35,
                }}
              >
                El origen y los cambios de orientación se incorporan al mismo historial de Ctrl+Z/Ctrl+Y que POINT y LINE.
              </div>

              <div
                style={{
                  marginBottom:
                    "8px",
                  fontWeight:
                    700,
                  fontSize:
                    "12px",
                }}
              >
                Preparación 3D
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "6px",
                  flexWrap:
                    "wrap",
                }}
              >
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={handleStartOriginEdit}
                >
                  Origen ← SNAP
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      coreRef.current
                        ?.startPointCommand();

                    }
                  }
                >
                  POINT
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      coreRef.current
                        ?.startLineCommand();

                    }
                  }
                >
                  LINE
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      try {

                        coreRef.current
                          ?.addPreparedPieceSnapsFromSelection();

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

                      }

                    }
                  }
                >
                  Punto → SNAP
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      try {

                        coreRef.current
                          ?.addPreparedPieceAxesFromSelection();

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

                      }

                    }
                  }
                >
                  Línea → eje
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      handleStandardView(
                        "ISO",
                      );

                    }
                  }
                >
                  ISO / Fit
                </button>
              </div>

              <div
                style={{
                  marginTop:
                    "10px",
                  fontSize:
                    "11px",
                  color:
                    "#b8c0c8",
                  lineHeight:
                    1.4,
                }}
              >
                Define el origen, la orientación, los SNAPs y los ejes antes de exportar. El IFC final se genera desde el estado actual de la PieceDefinition.
              </div>

              <button
                type="button"
                style={{
                  ...buttonStyle,
                  marginTop:
                    "12px",
                }}
                disabled={exporting}
                onClick={
                  () => {

                    void handleDownloadPreparedIfc();

                  }
                }
              >
                {
                  exporting
                    ? "Generando IFC..."
                    : "Descargar IFC FrameLogic"
                }
              </button>

              <div
                style={{
                  marginTop:
                    "6px",
                  fontSize:
                    "10px",
                  color:
                    "#9ca3af",
                  lineHeight:
                    1.35,
                }}
              >
                La geometría se exporta ya transformada al sistema local preparado. Al volver a importar este IFC, el origen definido queda en (0,0,0) y la orientación preparada se convierte en la orientación base de la pieza. Los SNAPs y ejes también se escriben como datos FrameLogic dentro del IFC.
              </div>
            </>
          )
        }

        <div
          style={{
            marginTop:
              "12px",
            paddingTop:
              "10px",
            borderTop:
              "1px solid #4b5563",
            fontSize:
              "11px",
            color:
              loading || exporting
                ? "#fcd34d"
                : "#d1d5db",
            lineHeight:
              1.4,
          }}
        >
          {message}
        </div>
      </div>

      <input
        ref={replacementInputRef}
        type="file"
        accept=".step,.stp"
        hidden
        onChange={handleReplacementFile}
      />
    </div>
  );

}
