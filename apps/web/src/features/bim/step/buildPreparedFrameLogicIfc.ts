import type {
  LocalCoordinateSystem,
  PieceSnapPoint,
  ReferenceAxisLine,
} from "@framelogic/bim-core";


export interface PreparedFrameLogicIfcInput {
  baseIfcFile: File;
  sourceStepFileName: string;
  code: string;
  name: string;
  classification?: string;
  tags?: readonly string[];
  coordinateSystem: LocalCoordinateSystem;
  snapPoints: readonly PieceSnapPoint[];
  axisLines: readonly ReferenceAxisLine[];
}


type Vector3Tuple =
  readonly [number, number, number];


function formatIfcNumber(
  value: number,
): string {

  if (
    !Number.isFinite(
      value,
    )
  ) {

    throw new Error(
      "La PieceDefinition contiene una coordenada no finita.",
    );

  }


  if (
    Math.abs(
      value,
    ) < 1e-12
  ) {

    return "0.";

  }


  const text =
    value
      .toPrecision(
        15,
      )
      .replace(
        /(?:\.0+|(?:(\.\d*?[1-9]))0+)$/,
        "$1",
      );


  if (
    text.includes(
      ".",
    )
    || /e/i.test(
      text,
    )
  ) {

    return text.replace(
      "e",
      "E",
    );

  }


  return `${text}.`;

}


function escapeIfcString(
  value: string,
): string {

  return value
    .replaceAll(
      "'",
      "''",
    )
    .replaceAll(
      "\r",
      " ",
    )
    .replaceAll(
      "\n",
      " ",
    );

}


function createIfcGuid(): string {

  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";


  const bytes =
    crypto.getRandomValues(
      new Uint8Array(
        22,
      ),
    );


  let result =
    "";


  for (
    const byte
    of bytes
  ) {

    result +=
      alphabet[
        byte % alphabet.length
      ];

  }


  return result;

}


function getNextEntityId(
  ifcText: string,
): number {

  let nextId =
    1;


  for (
    const entityMatch
    of ifcText.matchAll(
      /#(\d+)=/g,
    )
  ) {

    const current =
      Number(
        entityMatch[1],
      );


    if (
      Number.isFinite(
        current,
      )
    ) {

      nextId =
        Math.max(
          nextId,
          current + 1,
        );

    }

  }


  return nextId;

}


function insertBeforeDataEnd(
  ifcText: string,
  lines: readonly string[],
): string {

  const dataEndIndex =
    ifcText.lastIndexOf(
      "ENDSEC;",
    );


  if (
    dataEndIndex < 0
  ) {

    throw new Error(
      "El IFC base no contiene una sección DATA válida.",
    );

  }


  return [
    ifcText.slice(
      0,
      dataEndIndex,
    ),
    lines.join(
      "\n",
    ),
    "\n",
    ifcText.slice(
      dataEndIndex,
    ),
  ].join(
    "",
  );

}


/**
 * Web-IFC / Fragments entrega la geometría IFC al visor usando el cambio
 * de base que FrameLogic ya está editando visualmente:
 *
 *   IFC (x, y, z) -> FrameLogic asset (x, z, -y)
 *
 * PieceDefinition.coordinateSystem está definido sobre ese asset visual,
 * no directamente sobre las coordenadas crudas del STEP/IFC.
 *
 * Por tanto, al exportar hay que reproducir exactamente el mismo pipeline:
 *
 *   1. IFC crudo -> asset visual FrameLogic
 *   2. asset visual -> PieceDefinition local preparada
 *
 * El paso 2 es:
 *
 *   local = A * (asset - origin)
 *
 * donde las filas de A son xAxis, yAxis y zAxis.
 */
function transformPointToPreparedLocal(
  x: number,
  y: number,
  z: number,
  coordinateSystem: LocalCoordinateSystem,
): Vector3Tuple {

  const assetX =
    x;

  const assetY =
    z;

  const assetZ =
    -y;


  const dx =
    assetX
    - coordinateSystem.origin.x;

  const dy =
    assetY
    - coordinateSystem.origin.y;

  const dz =
    assetZ
    - coordinateSystem.origin.z;


  return [
    coordinateSystem.xAxis.x * dx
      + coordinateSystem.xAxis.y * dy
      + coordinateSystem.xAxis.z * dz,

    coordinateSystem.yAxis.x * dx
      + coordinateSystem.yAxis.y * dy
      + coordinateSystem.yAxis.z * dz,

    coordinateSystem.zAxis.x * dx
      + coordinateSystem.zAxis.y * dy
      + coordinateSystem.zAxis.z * dz,
  ];

}


function bakePreparedGeometry(
  ifcText: string,
  coordinateSystem: LocalCoordinateSystem,
): string {

  let transformedListCount =
    0;

  let transformedPointCount =
    0;


  const pointListPattern =
    /#(\d+)=IFCCARTESIANPOINTLIST3D\(\(([^;]+)\)\);/gi;


  const transformedText =
    ifcText.replace(
      pointListPattern,
      (
        _original,
        entityId: string,
        pointListContent: string,
      ) => {

        const tuples: string[] = [];

        const tuplePattern =
          /\(([^()]*)\)/g;


        for (
          const tupleMatch
          of pointListContent.matchAll(
            tuplePattern,
          )
        ) {

          const rawTuple =
            tupleMatch[1];


          if (
            rawTuple === undefined
          ) {

            continue;

          }


          const values =
            rawTuple
              .split(",")
              .map(
                (
                  value,
                ) =>
                  Number(
                    value.trim(),
                  ),
              );


          if (
            values.length !== 3
            || values.some(
              (
                value,
              ) =>
                !Number.isFinite(
                  value,
                ),
            )
          ) {

            throw new Error(
              `El IFC base contiene un punto 3D no válido en #${entityId}.`,
            );

          }


          const prepared =
            transformPointToPreparedLocal(
              values[0]!,
              values[1]!,
              values[2]!,
              coordinateSystem,
            );


          tuples.push(
            `(${formatIfcNumber(prepared[0])},${formatIfcNumber(prepared[1])},${formatIfcNumber(prepared[2])})`,
          );


          transformedPointCount +=
            1;

        }


        if (
          tuples.length < 1
        ) {

          throw new Error(
            `El IFC base no contiene puntos utilizables en #${entityId}.`,
          );

        }


        transformedListCount +=
          1;


        return `#${entityId}=IFCCARTESIANPOINTLIST3D((${tuples.join(",")}));`;

      },
    );


  if (
    transformedListCount < 1
    || transformedPointCount < 1
  ) {

    throw new Error(
      "No se encontró geometría triangulada que pudiera convertirse al sistema local FrameLogic.",
    );

  }


  const identityLocationPattern =
    /#12=IFCCARTESIANPOINT\(\([^;]*\)\);/i;

  const identityAxisPattern =
    /#13=IFCAXIS2PLACEMENT3D\(#12,[^;]*\);/i;


  if (
    !identityLocationPattern.test(
      transformedText,
    )
    || !identityAxisPattern.test(
      transformedText,
    )
  ) {

    throw new Error(
      "El IFC de trabajo no contiene la colocación base esperada de FrameLogic.",
    );

  }


  return transformedText
    .replace(
      identityLocationPattern,
      "#12=IFCCARTESIANPOINT((0.,0.,0.));",
    )
    .replace(
      identityAxisPattern,
      "#13=IFCAXIS2PLACEMENT3D(#12,$,$);",
    );

}


function appendFrameLogicPropertySets(
  ifcText: string,
  input: PreparedFrameLogicIfcInput,
): string {

  const productMatch =
    ifcText.match(
      /#(\d+)=IFCBUILDINGELEMENTPROXY\(/i,
    );


  if (
    !productMatch
    || productMatch[1] === undefined
  ) {

    throw new Error(
      "No se encontró la pieza IFC que debe recibir los datos FrameLogic.",
    );

  }


  const productId =
    Number(
      productMatch[1],
    );


  let nextId =
    getNextEntityId(
      ifcText,
    );


  const allocate =
    (): number => {

      const id =
        nextId;


      nextId +=
        1;


      return id;

    };


  const sourceCoordinateSystem =
    JSON.stringify(
      input.coordinateSystem,
    );

  const snaps =
    JSON.stringify(
      input.snapPoints,
    );

  const axes =
    JSON.stringify(
      input.axisLines,
    );

  const identity =
    JSON.stringify({
      code:
        input.code,
      name:
        input.name,
      classification:
        input.classification
        ?? "",
      tags:
        input.tags
        ?? [],
      sourceStepFile:
        input.sourceStepFileName,
    });


  const identityValueId =
    allocate();

  const sourceCoordinateSystemValueId =
    allocate();

  const geometryCoordinateSystemValueId =
    allocate();

  const snapValueId =
    allocate();

  const axisValueId =
    allocate();

  const identityPsetId =
    allocate();

  const coordinatePsetId =
    allocate();

  const snapPsetId =
    allocate();

  const axisPsetId =
    allocate();

  const identityRelId =
    allocate();

  const coordinateRelId =
    allocate();

  const snapRelId =
    allocate();

  const axisRelId =
    allocate();


  const extraLines = [
    `#${identityValueId}=IFCPROPERTYSINGLEVALUE('Data',$,IFCTEXT('${escapeIfcString(identity)}'),$);`,
    `#${sourceCoordinateSystemValueId}=IFCPROPERTYSINGLEVALUE('SourceCoordinateSystem',$,IFCTEXT('${escapeIfcString(sourceCoordinateSystem)}'),$);`,
    `#${geometryCoordinateSystemValueId}=IFCPROPERTYSINGLEVALUE('GeometryCoordinateSystem',$,IFCLABEL('PreparedVertices'),$);`,
    `#${snapValueId}=IFCPROPERTYSINGLEVALUE('Data',$,IFCTEXT('${escapeIfcString(snaps)}'),$);`,
    `#${axisValueId}=IFCPROPERTYSINGLEVALUE('AxisLines',$,IFCTEXT('${escapeIfcString(axes)}'),$);`,

    `#${identityPsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_Identity',$,(#${identityValueId}));`,
    `#${coordinatePsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_CoordinateSystem',$,(#${sourceCoordinateSystemValueId},#${geometryCoordinateSystemValueId}));`,
    `#${snapPsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_SnapPoints',$,(#${snapValueId}));`,
    `#${axisPsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_ReferenceGeometry',$,(#${axisValueId}));`,

    `#${identityRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${identityPsetId});`,
    `#${coordinateRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${coordinatePsetId});`,
    `#${snapRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${snapPsetId});`,
    `#${axisRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${axisPsetId});`,
  ];


  return insertBeforeDataEnd(
    ifcText,
    extraLines,
  );

}


export async function buildPreparedFrameLogicIfc(
  input: PreparedFrameLogicIfcInput,
): Promise<File> {

  const baseText =
    await input.baseIfcFile.text();


  const preparedGeometryText =
    bakePreparedGeometry(
      baseText,
      input.coordinateSystem,
    );


  const finalText =
    appendFrameLogicPropertySets(
      preparedGeometryText,
      input,
    );


  const safeCode =
    input.code
      .trim()
      .replace(
        /[^a-zA-Z0-9_-]+/g,
        "_",
      )
    || "FrameLogic_Piece";


  return new File(
    [
      finalText,
    ],
    `${safeCode}_FrameLogic.ifc`,
    {
      type:
        "application/x-step",
    },
  );

}
