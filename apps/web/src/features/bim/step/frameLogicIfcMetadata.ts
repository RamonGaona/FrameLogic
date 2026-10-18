import type {
  PieceSnapPoint,
  ReferenceAxisLine,
} from "@framelogic/bim-core";


export interface FrameLogicIfcMetadata {
  readonly code: string;
  readonly name: string;
  readonly classification?: string;
  readonly tags: readonly string[];
  readonly sourceStepFileName?: string;
  readonly snapPoints: readonly PieceSnapPoint[];
  readonly axisLines: readonly ReferenceAxisLine[];
}


interface IfcPropertyValue {
  readonly name: string;
  readonly value: string;
}


function unescapeIfcString(
  value: string,
): string {

  return value.replaceAll(
    "''",
    "'",
  );

}


function parsePropertyValues(
  ifcText: string,
): Map<number, IfcPropertyValue> {

  const values =
    new Map<number, IfcPropertyValue>();

  const pattern =
    /#(\d+)=IFCPROPERTYSINGLEVALUE\('((?:''|[^'])*)',\$,(?:IFCTEXT|IFCLABEL)\('((?:''|[^'])*)'\),\$\);/gi;

  for (
    const match
    of ifcText.matchAll(
      pattern,
    )
  ) {

    const id =
      Number(
        match[1],
      );

    if (
      !Number.isFinite(
        id,
      )
      || match[2] === undefined
      || match[3] === undefined
    ) {

      continue;

    }

    values.set(
      id,
      {
        name:
          unescapeIfcString(
            match[2],
          ),
        value:
          unescapeIfcString(
            match[3],
          ),
      },
    );

  }

  return values;

}


function parseFrameLogicPropertySets(
  ifcText: string,
): Map<string, readonly number[]> {

  const propertySets =
    new Map<string, readonly number[]>();

  const pattern =
    /#\d+=IFCPROPERTYSET\('(?:''|[^'])*',(?:#\d+|\$),'(FrameLogic_[^']+)',\$,\(([^)]*)\)\);/gi;

  for (
    const match
    of ifcText.matchAll(
      pattern,
    )
  ) {

    const name =
      match[1];

    const refs =
      match[2];

    if (
      name === undefined
      || refs === undefined
    ) {

      continue;

    }

    const ids =
      Array.from(
        refs.matchAll(
          /#(\d+)/g,
        ),
      )
        .map(
          (
            item,
          ) =>
            Number(
              item[1],
            ),
        )
        .filter(
          Number.isFinite,
        );

    /*
     * Si un IFC fue reeditado varias veces, la última versión de cada
     * PropertySet es la vigente. Map.set reemplaza deliberadamente la previa.
     */
    propertySets.set(
      name,
      ids,
    );

  }

  return propertySets;

}


function findProperty(
  propertyIds: readonly number[],
  values: ReadonlyMap<number, IfcPropertyValue>,
  propertyName: string,
): string | undefined {

  for (
    const id
    of propertyIds
  ) {

    const property =
      values.get(
        id,
      );

    if (
      property?.name
      === propertyName
    ) {

      return property.value;

    }

  }

  return undefined;

}


function parseJson<T>(
  value: string | undefined,
  label: string,
): T {

  if (
    !value
  ) {

    throw new Error(
      `El IFC FrameLogic no contiene ${label}.`,
    );

  }

  try {

    return JSON.parse(
      value,
    ) as T;

  }
  catch {

    throw new Error(
      `El IFC FrameLogic contiene ${label} inválido.`,
    );

  }

}


export async function readFrameLogicIfcMetadata(
  file: File,
): Promise<FrameLogicIfcMetadata> {

  const ifcText =
    await file.text();

  const values =
    parsePropertyValues(
      ifcText,
    );

  const propertySets =
    parseFrameLogicPropertySets(
      ifcText,
    );

  const identityIds =
    propertySets.get(
      "FrameLogic_Identity",
    );

  const coordinateIds =
    propertySets.get(
      "FrameLogic_CoordinateSystem",
    );

  const snapIds =
    propertySets.get(
      "FrameLogic_SnapPoints",
    );

  const axisIds =
    propertySets.get(
      "FrameLogic_ReferenceGeometry",
    );

  if (
    !identityIds
    || !coordinateIds
    || !snapIds
    || !axisIds
  ) {

    throw new Error(
      "Este IFC no fue guardado como una pieza FrameLogic editable.",
    );

  }

  const geometryCoordinateSystem =
    findProperty(
      coordinateIds,
      values,
      "GeometryCoordinateSystem",
    );

  if (
    geometryCoordinateSystem
    !== "PreparedVertices"
  ) {

    throw new Error(
      "El IFC no contiene geometría local preparada por FrameLogic.",
    );

  }

  const identity =
    parseJson<{
      code?: unknown;
      name?: unknown;
      classification?: unknown;
      tags?: unknown;
      sourceStepFile?: unknown;
    }>(
      findProperty(
        identityIds,
        values,
        "Data",
      ),
      "FrameLogic_Identity.Data",
    );

  const code =
    typeof identity.code
      === "string"
      ? identity.code.trim()
      : "";

  const name =
    typeof identity.name
      === "string"
      ? identity.name.trim()
      : "";

  if (
    code.length < 1
    || name.length < 1
  ) {

    throw new Error(
      "El IFC FrameLogic no contiene código y nombre válidos.",
    );

  }

  const rawSnaps =
    parseJson<unknown>(
      findProperty(
        snapIds,
        values,
        "Data",
      ),
      "FrameLogic_SnapPoints.Data",
    );

  const rawAxes =
    parseJson<unknown>(
      findProperty(
        axisIds,
        values,
        "AxisLines",
      ),
      "FrameLogic_ReferenceGeometry.AxisLines",
    );

  if (
    !Array.isArray(
      rawSnaps,
    )
    || !Array.isArray(
      rawAxes,
    )
  ) {

    throw new Error(
      "El IFC FrameLogic contiene SNAPs o ejes con formato inválido.",
    );

  }

  const tags =
    Array.isArray(
      identity.tags,
    )
      ? identity.tags.filter(
          (
            tag,
          ): tag is string =>
            typeof tag
            === "string",
        )
      : [];

  return {
    code,
    name,
    classification:
      typeof identity.classification
        === "string"
        && identity.classification.trim().length > 0
        ? identity.classification
        : undefined,
    tags,
    sourceStepFileName:
      typeof identity.sourceStepFile
        === "string"
        && identity.sourceStepFile.trim().length > 0
        ? identity.sourceStepFile
        : undefined,
    snapPoints:
      rawSnaps as PieceSnapPoint[],
    axisLines:
      rawAxes as ReferenceAxisLine[],
  };

}
