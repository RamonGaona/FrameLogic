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
  CameraOrientation,
  CameraProjectionMode,
  CardinalDirection,
  LocalCoordinateSystem,
  PrecisionBimCoreInstance,
  StandardView,
} from "@framelogic/bim-core";

import {
  ViewCube,
} from "../components/ViewCube";

import {
  buildPreparedFrameLogicIfc,
} from "./buildPreparedFrameLogicIfc";

import {
  convertStepToFrameLogicIfc,
} from "./stepToFrameLogicIfc";

import {
  OcctStepGeometryAdapter,
} from "./OcctStepGeometryAdapter";


export interface StepPieceEditorDirectProps {
  initialFile: File;
  onExit: () => void;
}


type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];


type LocalRotationAxis =
  | "X"
  | "Y"
  | "Z";


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


function coordinateSystemMatrix(
  coordinateSystem: LocalCoordinateSystem,
): Matrix3 {
  return [
    coordinateSystem.xAxis.x,
    coordinateSystem.xAxis.y,
    coordinateSystem.xAxis.z,
    coordinateSystem.yAxis.x,
    coordinateSystem.yAxis.y,
    coordinateSystem.yAxis.z,
    coordinateSystem.zAxis.x,
    coordinateSystem.zAxis.y,
    coordinateSystem.zAxis.z,
  ];
}


function createLocalAxisRotationMatrix(
  axis: LocalRotationAxis,
  degrees: number,
): Matrix3 {
  switch (
    axis
  ) {
    case "X":
      return createEulerRotationMatrix(
        degrees,
        0,
        0,
      );

    case "Y":
      return createEulerRotationMatrix(
        0,
        degrees,
        0,
      );

    case "Z":
      return createEulerRotationMatrix(
        0,
        0,
        degrees,
      );
  }
}


function installStepCameraTuning(
  core: PrecisionBimCoreInstance,
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


function applyDefinitionWorkspaceTransform(
  core: PrecisionBimCoreInstance,
  instanceId: string,
  coordinateSystem: LocalCoordinateSystem,
): void {
  const object =
    core.designScene.getInstanceObject(
      instanceId,
    );

  if (!object) {
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

  core.designSelection.refreshHelpers();
  core.pieceDefinitionHelpers.sync();
  core.geometryQuery.clearCache();
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


function downloadJson(
  fileName: string,
  data: unknown,
): void {
  const file =
    new File(
      [
        JSON.stringify(
          data,
          null,
          2,
        ),
      ],
      fileName,
      {
        type:
          "application/json",
      },
    );

  downloadFile(
    file,
  );
}


export function StepPieceEditorDirect({
  initialFile,
  onExit,
}: StepPieceEditorDirectProps) {
  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );
  const replacementInputRef =
    useRef<HTMLInputElement>(
      null,
    );
  const coreRef =
    useRef<PrecisionBimCoreInstance | null>(
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
  const [prepared, setPrepared] =
    useState(false);
  const [exporting, setExporting] =
    useState(false);
  const [message, setMessage] =
    useState(
      "STEP será la fuente geométrica principal. Pulsa Cargar STEP directo y preparar.",
    );

  const [rotationX, setRotationX] =
    useState("0");
  const [rotationY, setRotationY] =
    useState("0");
  const [rotationZ, setRotationZ] =
    useState("0");
  const [localRotationAxis, setLocalRotationAxis] =
    useState<LocalRotationAxis>(
      "X",
    );
  const [localRotationDegrees, setLocalRotationDegrees] =
    useState("90");

  const [cameraOrientation, setCameraOrientation] =
    useState<CameraOrientation>({
      azimuth:
        Math.PI / 4,
      polar:
        Math.PI / 3,
    });
  const [projectionMode, setProjectionMode] =
    useState<CameraProjectionMode>(
      "ORTHOGRAPHIC",
    );


  useEffect(
    () => {
      const container =
        containerRef.current;

      if (!container) {
        return;
      }

      let disposed =
        false;
      let unsubscribeCamera:
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
            if (disposed) {
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
                  if (!disposed) {
                    setCameraOrientation(
                      orientation,
                    );
                  }
                },
              );

            setReady(true);
          },
        )
        .catch(
          (
            error: unknown,
          ) => {
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
        unsubscribeCamera?.();
        removeStepCameraTuning?.();
        coreRef.current?.dispose();
        coreRef.current =
          null;
      };
    },
    [],
  );


  function resetForFile(
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
    setPrepared(false);
    setRotationX("0");
    setRotationY("0");
    setRotationZ("0");
    preparedDefinitionIdRef.current =
      null;
    preparedInstanceIdRef.current =
      null;
    setMessage(
      "STEP seleccionado. Se abrirá directamente con OCCT; no se creará IFC de trabajo.",
    );
  }


  function handleReplacementFile(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file =
      event.target.files?.[0];
    event.target.value =
      "";

    if (file) {
      resetForFile(
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
    const normalizedClassification =
      classification.trim()
      || undefined;
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

    if (
      normalizedCode.length === 0
    ) {
      window.alert(
        "El código de la pieza es obligatorio.",
      );
      return;
    }

    try {
      setLoading(true);
      setMessage(
        "Leyendo STEP directamente con OpenCascade...",
      );

      const adapter =
        new OcctStepGeometryAdapter();
      const document =
        await adapter.load(
          new Uint8Array(
            await sourceFile.arrayBuffer(),
          ),
          {
            sourceFileName:
              sourceFile.name,
            targetUnit:
              "meter",
            includeExactFeatures:
              true,
          },
        );

      const {
        definition,
      } =
        core.importStepPiece(
          document,
          {
            code:
              normalizedCode,
            name:
              normalizedName,
            classification:
              normalizedClassification,
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

      preparedDefinitionIdRef.current =
        definition.id;
      preparedInstanceIdRef.current =
        instance.id;

      core.startPieceDefinitionPreparation(
        instance.id,
      );
      await core.setStandardView(
        "ISO",
      );

      const vertexCount =
        document.meshes.reduce(
          (
            total,
            mesh,
          ) =>
            total
            + mesh.positions.length / 3,
          0,
        );
      const triangleCount =
        document.meshes.reduce(
          (
            total,
            mesh,
          ) =>
            total
            + mesh.indices.length / 3,
          0,
        );

      setPrepared(true);
      setMessage(
        `STEP directo cargado · ${document.meshes.length} mesh · ${Math.round(vertexCount).toLocaleString()} vértices · ${Math.round(triangleCount).toLocaleString()} triángulos · ${document.features.length} features de ingeniería. IFC no participa en el workspace.`,
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
        "Direct STEP preparation failed:",
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


  function handleStandardView(
    view: StandardView,
  ): void {
    void coreRef.current?.setStandardView(
      view,
    );
  }


  function handleCardinalDirection(
    direction: CardinalDirection,
  ): void {
    void coreRef.current?.setCardinalDirection(
      direction,
    );
  }


  async function handleToggleProjection():
    Promise<void> {
    const core =
      coreRef.current;

    if (!core) {
      return;
    }

    const mode =
      await core.toggleCameraProjection();
    setProjectionMode(
      mode,
    );
  }


  function updatePieceCoordinateMatrix(
    matrix: Matrix3,
    messageText: string,
  ): void {
    const core =
      coreRef.current;
    const definitionId =
      preparedDefinitionIdRef.current;
    const instanceId =
      preparedInstanceIdRef.current;

    if (
      !core
      || !definitionId
      || !instanceId
    ) {
      return;
    }

    const currentDefinition =
      core.designModel.pieceDefinitions.get(
        definitionId,
      );

    if (!currentDefinition) {
      return;
    }

    const updated =
      core.designModel.pieceDefinitions.updateCoordinateSystem(
        definitionId,
        {
          origin:
            currentDefinition.coordinateSystem.origin,
          xAxis: {
            x: matrix[0],
            y: matrix[1],
            z: matrix[2],
          },
          yAxis: {
            x: matrix[3],
            y: matrix[4],
            z: matrix[5],
          },
          zAxis: {
            x: matrix[6],
            y: matrix[7],
            z: matrix[8],
          },
        },
        true,
      );

    if (!updated) {
      return;
    }

    applyDefinitionWorkspaceTransform(
      core,
      instanceId,
      updated.coordinateSystem,
    );
    setMessage(
      messageText,
    );
  }


  function handleApplyManualOrientation(): void {
    const x =
      Number(
        rotationX,
      );
    const y =
      Number(
        rotationY,
      );
    const z =
      Number(
        rotationZ,
      );

    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || !Number.isFinite(z)
    ) {
      window.alert(
        "Los ángulos deben ser números válidos.",
      );
      return;
    }

    updatePieceCoordinateMatrix(
      createEulerRotationMatrix(
        x,
        y,
        z,
      ),
      `Orientación local aplicada · Rx ${x}° · Ry ${y}° · Rz ${z}°.`,
    );
  }


  function handleApplyLocalRotation(
    degreesOverride?: number,
  ): void {
    const core =
      coreRef.current;
    const definitionId =
      preparedDefinitionIdRef.current;
    const degrees =
      degreesOverride
      ?? Number(
        localRotationDegrees,
      );

    if (
      !core
      || !definitionId
      || !Number.isFinite(degrees)
    ) {
      return;
    }

    const definition =
      core.designModel.pieceDefinitions.get(
        definitionId,
      );

    if (!definition) {
      return;
    }

    const composed =
      multiplyMatrix3(
        createLocalAxisRotationMatrix(
          localRotationAxis,
          degrees,
        ),
        coordinateSystemMatrix(
          definition.coordinateSystem,
        ),
      );

    updatePieceCoordinateMatrix(
      composed,
      `Giro ${degrees}° alrededor de ${localRotationAxis} local aplicado.`,
    );
  }


  function handleCreateStructuralAxis(): void {
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

    try {
      const before =
        core.designModel.pieceDefinitions.get(
          definitionId,
        )?.referenceGeometry.axisLines.length
        ?? 0;

      core.addPreparedPieceAxesFromSelection();

      const definition =
        core.designModel.pieceDefinitions.get(
          definitionId,
        );
      const axes =
        definition?.referenceGeometry.axisLines
        ?? [];
      const axis =
        axes.length > before
          ? axes[axes.length - 1]
          : undefined;

      if (
        !axis
        || axis.length === undefined
        || axis.length <= 0
      ) {
        window.alert(
          "Selecciona una línea finita y vuelve a usar Línea → eje estructural.",
        );
        return;
      }

      core.engineeringModel.pieces.setStructuralAxis(
        definitionId,
        {
          id:
            `structural:${axis.id}`,
          name:
            axis.name
            || "Eje estructural",
          start: {
            ...axis.origin,
          },
          end: {
            x:
              axis.origin.x
              + axis.direction.x * axis.length,
            y:
              axis.origin.y
              + axis.direction.y * axis.length,
            z:
              axis.origin.z
              + axis.direction.z * axis.length,
          },
          source:
            "MANUAL",
          confirmed:
            true,
        },
      );

      core.geometryQuery.clearCache();
      setMessage(
        `Eje estructural confirmado desde la línea seleccionada · longitud ${axis.length.toFixed(3)} m.`,
      );
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


  async function handleDownloadPreparedIfc():
    Promise<void> {
    const core =
      coreRef.current;
    const definitionId =
      preparedDefinitionIdRef.current;

    if (
      !core
      || !definitionId
      || exporting
    ) {
      return;
    }

    const definition =
      core.designModel.pieceDefinitions.get(
        definitionId,
      );

    if (!definition) {
      return;
    }

    try {
      setExporting(true);
      setMessage(
        "Generando IFC de entrega. La conversión STEP → IFC ocurre solo ahora, no durante el trabajo.",
      );

      const base =
        await convertStepToFrameLogicIfc(
          sourceFile,
          {
            code:
              definition.code,
            name:
              definition.name,
            classification:
              definition.classification,
            tags:
              definition.tags,
          },
        );

      const finalIfc =
        await buildPreparedFrameLogicIfc({
          baseIfcFile:
            base.ifcFile,
          baseGeometrySpace:
            "STEP_GENERATED_IFC",
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
            definition.referenceGeometry.axisLines,
        });

      downloadFile(
        finalIfc,
      );
      setMessage(
        "IFC de entrega generado desde el STEP maestro. El workspace continuó siendo STEP-first.",
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
      setMessage(
        errorMessage,
      );
      window.alert(
        `No se pudo generar el IFC.\n\n${errorMessage}`,
      );
    }
    finally {
      setExporting(false);
    }
  }


  function handleDownloadEngineeringSnapshot(): void {
    const core =
      coreRef.current;

    if (!core) {
      return;
    }

    downloadJson(
      `${fileBaseName(sourceFile.name)}.framelogic-engineering.json`,
      core.createEngineeringSnapshot(),
    );

    setMessage(
      "Datos de ingeniería FrameLogic exportados: metadatos, features, ensambles y eje estructural quedan independientes del IFC.",
    );
  }


  const controlStyle = {
    padding:
      "7px 9px",
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
      "7px 10px",
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
      "11px",
  } as const;

  const standardViews:
    readonly {
      readonly label: string;
      readonly view: StandardView;
    }[] = [
      { label: "TOP", view: "TOP" },
      { label: "FRONT", view: "FRONT" },
      { label: "RIGHT", view: "RIGHT" },
      { label: "LEFT", view: "LEFT" },
      { label: "BACK", view: "BACK" },
      { label: "BOTTOM", view: "BOTTOM" },
      { label: "ISO", view: "ISO" },
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
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            gap:
              "8px",
            marginBottom:
              "10px",
          }}
        >
          <strong>
            Editor STEP · FrameLogic
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
            padding:
              "9px",
            marginBottom:
              "10px",
            borderRadius:
              "5px",
            background:
              "rgba(17,24,39,0.75)",
            fontSize:
              "11px",
            lineHeight:
              1.4,
          }}
        >
          <strong>STEP maestro:</strong> {sourceFile.name}
          <br />
          Geometría de trabajo: STEP/OCCT → Three.js. IFC solo se genera si lo exportas.
        </div>

        {
          !prepared
          && (
            <>
              <label style={{ display: "grid", gap: "4px", marginBottom: "8px", fontSize: "11px" }}>
                Código *
                <input value={code} onChange={(event) => setCode(event.target.value)} style={controlStyle} />
              </label>
              <label style={{ display: "grid", gap: "4px", marginBottom: "8px", fontSize: "11px" }}>
                Nombre *
                <input value={name} onChange={(event) => setName(event.target.value)} style={controlStyle} />
              </label>
              <label style={{ display: "grid", gap: "4px", marginBottom: "8px", fontSize: "11px" }}>
                Clasificación
                <input value={classification} onChange={(event) => setClassification(event.target.value)} style={controlStyle} />
              </label>
              <label style={{ display: "grid", gap: "4px", marginBottom: "10px", fontSize: "11px" }}>
                Tags separados por coma
                <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} style={controlStyle} />
              </label>

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={!ready || loading}
                  onClick={() => { void handlePrepare(); }}
                >
                  {loading ? "Leyendo STEP..." : "Cargar STEP directo y preparar"}
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={loading}
                  onClick={() => replacementInputRef.current?.click()}
                >
                  Elegir otro STEP
                </button>
              </div>
            </>
          )
        }

        {
          prepared
          && (
            <>
              <hr style={{ border: 0, borderTop: "1px solid #4b5563", margin: "12px 0" }} />

              <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>
                Vistas
              </div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
                {standardViews.map((item) => (
                  <button key={item.view} type="button" style={buttonStyle} onClick={() => handleStandardView(item.view)}>
                    {item.label}
                  </button>
                ))}
                {/* O/P toggle omitted while perspective 3D mode is disabled. */}
              </div>

              <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>
                Orientación local
              </div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "end", marginBottom: "8px" }}>
                <label style={{ display: "grid", gap: "3px", fontSize: "10px" }}>
                  Rx°
                  <input type="number" value={rotationX} onChange={(event) => setRotationX(event.target.value)} style={{ ...controlStyle, width: "58px" }} />
                </label>
                <label style={{ display: "grid", gap: "3px", fontSize: "10px" }}>
                  Ry°
                  <input type="number" value={rotationY} onChange={(event) => setRotationY(event.target.value)} style={{ ...controlStyle, width: "58px" }} />
                </label>
                <label style={{ display: "grid", gap: "3px", fontSize: "10px" }}>
                  Rz°
                  <input type="number" value={rotationZ} onChange={(event) => setRotationZ(event.target.value)} style={{ ...controlStyle, width: "58px" }} />
                </label>
                <button type="button" style={buttonStyle} onClick={handleApplyManualOrientation}>
                  Aplicar
                </button>
              </div>

              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "end", marginBottom: "12px" }}>
                <label style={{ display: "grid", gap: "3px", fontSize: "10px" }}>
                  Eje local
                  <select value={localRotationAxis} onChange={(event) => setLocalRotationAxis(event.target.value as LocalRotationAxis)} style={controlStyle}>
                    <option value="X">X</option>
                    <option value="Y">Y</option>
                    <option value="Z">Z</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: "3px", fontSize: "10px" }}>
                  Giro°
                  <input type="number" value={localRotationDegrees} onChange={(event) => setLocalRotationDegrees(event.target.value)} style={{ ...controlStyle, width: "64px" }} />
                </label>
                <button type="button" style={buttonStyle} onClick={() => handleApplyLocalRotation()}>
                  Girar
                </button>
                <button type="button" style={buttonStyle} onClick={() => handleApplyLocalRotation(90)}>
                  +90°
                </button>
                <button type="button" style={buttonStyle} onClick={() => handleApplyLocalRotation(-90)}>
                  -90°
                </button>
              </div>

              <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>
                Preparación geométrica
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                <button type="button" style={buttonStyle} onClick={() => coreRef.current?.startPreparedPieceOriginSnapEdit()}>
                  Origen ← SNAP
                </button>
                <button type="button" style={buttonStyle} onClick={() => coreRef.current?.startPointCommand()}>
                  POINT
                </button>
                <button type="button" style={buttonStyle} onClick={() => coreRef.current?.startLineCommand()}>
                  LINE
                </button>
                <button type="button" style={buttonStyle} onClick={() => coreRef.current?.addPreparedPieceSnapsFromSelection()}>
                  Punto → SNAP
                </button>
                <button type="button" style={buttonStyle} onClick={handleCreateStructuralAxis}>
                  Línea → eje estructural
                </button>
              </div>

              <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>
                Salida
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={exporting}
                  onClick={() => { void handleDownloadPreparedIfc(); }}
                >
                  {exporting ? "Generando IFC..." : "Exportar IFC al final"}
                </button>
                <button type="button" style={buttonStyle} onClick={handleDownloadEngineeringSnapshot}>
                  Guardar datos FrameLogic
                </button>
              </div>
            </>
          )
        }

        <div
          style={{
            marginTop:
              "12px",
            paddingTop:
              "9px",
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
