import type {
  PieceSnapPoint,
  ReferenceAxisLine,
} from "@framelogic/domain";


export interface FrameLogicPieceIfcMetadata {
  readonly snapPoints:
    readonly PieceSnapPoint[];

  readonly axisLines:
    readonly ReferenceAxisLine[];
}


interface IfcPropertyValue {
  readonly name:
    string;

  readonly value:
    string;
}


function unescapeIfcString(
  value:
    string,
): string {

  return value.replaceAll(
    "''",
    "'",
  );

}


function parsePropertyValues(
  ifcText:
    string,
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
  ifcText:
    string,
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
     * Si un IFC FrameLogic fue editado varias veces,
     * la última versión de cada PropertySet es la vigente.
     */
    propertySets.set(
      name,
      ids,
    );

  }


  return propertySets;

}


function findProperty(
  propertyIds:
    readonly number[],

  values:
    ReadonlyMap<number, IfcPropertyValue>,

  propertyName:
    string,
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
  value:
    string | undefined,

  label:
    string,
): T {

  if (
    !value
  ) {

    throw new Error(
      `The FrameLogic IFC does not contain ${label}.`,
    );

  }


  try {

    return JSON.parse(
      value,
    ) as T;

  }
  catch {

    throw new Error(
      `The FrameLogic IFC contains invalid ${label}.`,
    );

  }

}


export async function readFrameLogicPieceIfcMetadata(
  file:
    File,
): Promise<FrameLogicPieceIfcMetadata | null> {

  const ifcText =
    await file.text();


  const hasFrameLogicMarker =
    ifcText.includes(
      "'FrameLogic_Identity'",
    )
    || ifcText.includes(
      "'FrameLogic_CoordinateSystem'",
    )
    || ifcText.includes(
      "'FrameLogic_SnapPoints'",
    )
    || ifcText.includes(
      "'FrameLogic_ReferenceGeometry'",
    );


  if (
    !hasFrameLogicMarker
  ) {

    return null;

  }


  const values =
    parsePropertyValues(
      ifcText,
    );

  const propertySets =
    parseFrameLogicPropertySets(
      ifcText,
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
    !coordinateIds
    || !snapIds
    || !axisIds
  ) {

    throw new Error(
      "The IFC contains incomplete FrameLogic piece metadata.",
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
      "The IFC does not contain FrameLogic prepared local geometry.",
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
      "The FrameLogic IFC contains invalid SNAP or reference-axis metadata.",
    );

  }


  return {
    snapPoints:
      rawSnaps as PieceSnapPoint[],
    axisLines:
      rawAxes as ReferenceAxisLine[],
  };

}
