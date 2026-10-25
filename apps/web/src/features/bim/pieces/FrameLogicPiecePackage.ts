import type {
  LocalCoordinateSystem,
  PieceEngineeringData,
  PieceReferenceGeometry,
  PieceSnapPoint,
} from "@framelogic/bim-core";


export type FrameLogicPieceGeometryFormat =
  | "STEP"
  | "IFC";


export interface FrameLogicPiecePackageV1 {
  readonly schema:
    "FRAMELOGIC_PIECE";
  readonly version:
    1;

  /**
   * Solo los paquetes READY se pueden abrir como piezas propias.
   * Archivos externos o piezas incompletas deben entrar por Importar pieza.
   */
  readonly status:
    "READY";

  readonly geometry: {
    readonly format:
      FrameLogicPieceGeometryFormat;
    readonly fileName:
      string;
    readonly dataBase64:
      string;
  };

  readonly definition: {
    readonly code:
      string;
    readonly name:
      string;
    readonly classification?:
      string;
    readonly tags:
      readonly string[];
    readonly coordinateSystem:
      LocalCoordinateSystem;
    readonly snapPoints:
      readonly PieceSnapPoint[];
    readonly referenceGeometry:
      PieceReferenceGeometry;
  };

  /**
   * Metadata de ingeniería obligatoria en una pieza propia FrameLogic.
   * La geometría puede ser STEP o IFC, pero Abrir nunca acepta un paquete
   * que no tenga este bloque validado.
   */
  readonly engineering:
    Omit<
      PieceEngineeringData,
      "pieceDefinitionId"
    >;
}


export type FrameLogicPiecePackage =
  FrameLogicPiecePackageV1;


function hasObjectData(
  value: unknown,
): boolean {
  return (
    typeof value === "object"
    && value !== null
    && Object.keys(
      value as Record<string, unknown>,
    ).length > 0
  );
}


function hasMeaningfulEngineeringMetadata(
  engineering:
    FrameLogicPiecePackageV1["engineering"],
): boolean {
  return Boolean(
    engineering.revision
    || hasObjectData(
      engineering.material,
    )
    || hasObjectData(
      engineering.commercial,
    )
    || hasObjectData(
      engineering.physical,
    )
    || engineering.structuralAxis
    || engineering.features.length > 0
  );
}


export function parseFrameLogicPiecePackage(
  text: string,
): FrameLogicPiecePackage {
  let parsed:
    unknown;

  try {
    parsed = JSON.parse(
      text,
    );
  }
  catch {
    throw new Error(
      "El archivo no es un paquete FrameLogic válido.",
    );
  }

  const value =
    parsed as Partial<FrameLogicPiecePackageV1>;

  if (
    value.schema
      !== "FRAMELOGIC_PIECE"
    || value.version
      !== 1
    || value.status
      !== "READY"
  ) {
    throw new Error(
      "El archivo no es una pieza FrameLogic READY compatible. Usa Importar pieza para STEP/IFC externos o incompletos.",
    );
  }

  if (
    !value.geometry
    || !value.definition
    || !value.engineering
  ) {
    throw new Error(
      "La pieza FrameLogic está incompleta: debe contener geometría, definición y metadatos de ingeniería.",
    );
  }

  if (
    value.geometry.format
      !== "STEP"
    && value.geometry.format
      !== "IFC"
  ) {
    throw new Error(
      "La geometría de la pieza FrameLogic debe ser STEP o IFC.",
    );
  }

  if (
    typeof value.geometry.fileName
      !== "string"
    || value.geometry.fileName.trim()
      .length === 0
    || typeof value.geometry.dataBase64
      !== "string"
    || value.geometry.dataBase64.length
      === 0
  ) {
    throw new Error(
      "La pieza FrameLogic no contiene una geometría válida.",
    );
  }

  if (
    typeof value.definition.code
      !== "string"
    || value.definition.code.trim()
      .length === 0
    || typeof value.definition.name
      !== "string"
    || value.definition.name.trim()
      .length === 0
    || !Array.isArray(
      value.definition.tags,
    )
    || !Array.isArray(
      value.definition.snapPoints,
    )
    || !value.definition.coordinateSystem
    || !value.definition.referenceGeometry
    || !Array.isArray(
      value.definition.referenceGeometry.axisLines,
    )
  ) {
    throw new Error(
      "La pieza FrameLogic no contiene una definición válida.",
    );
  }

  if (
    !Array.isArray(
      value.engineering.features,
    )
  ) {
    throw new Error(
      "La pieza FrameLogic no contiene metadatos de ingeniería válidos.",
    );
  }

  const ready =
    value as FrameLogicPiecePackageV1;

  if (
    !hasMeaningfulEngineeringMetadata(
      ready.engineering,
    )
  ) {
    throw new Error(
      "La pieza FrameLogic no tiene metadatos de ingeniería definidos. Usa Importar pieza para archivos STEP/IFC externos.",
    );
  }

  return ready;
}


export function decodeFrameLogicPieceGeometry(
  value: FrameLogicPiecePackage,
): Uint8Array {
  let binary:
    string;

  try {
    binary = window.atob(
      value.geometry.dataBase64,
    );
  }
  catch {
    throw new Error(
      "La geometría embebida de la pieza FrameLogic está dañada.",
    );
  }

  const bytes =
    new Uint8Array(
      binary.length,
    );

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(
        index,
      );
  }

  return bytes;
}
