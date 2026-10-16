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


function transformPointToDefinitionLocal(
  x: number,
  y: number,
  z: number,
  coordinateSystem: LocalCoordinateSystem,
): readonly [number, number, number] {

  const dx =
    x - coordinateSystem.origin.x;

  const dy =
    y - coordinateSystem.origin.y;

  const dz =
    z - coordinateSystem.origin.z;


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


function transformPointList(
  ifcText: string,
  coordinateSystem: LocalCoordinateSystem,
): string {

  const pointListPattern =
    /#\d+=IFCCARTESIANPOINTLIST3D\(\(([^;]*)\)\);/i;


  const match =
    ifcText.match(
      pointListPattern,
    );


  if (
    !match
    || match[1] === undefined
  ) {

    throw new Error(
      "No se encontró la geometría triangulada del IFC base.",
    );

  }


  const tuples: string[] = [];

  const tuplePattern =
    /\(([^()]*)\)/g;


  for (
    const tupleMatch
    of match[1].matchAll(
      tuplePattern,
    )
  ) {

    const values =
      tupleMatch[1]
        ?.split(
          ",",
        )
        .map(
          (
            value,
          ) =>
            Number(
              value.trim(),
            ),
        );


    if (
      !values
      || values.length !== 3
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
        "El IFC base contiene un punto que no se pudo interpretar.",
      );

    }


    const transformed =
      transformPointToDefinitionLocal(
        values[0]!,
        values[1]!,
        values[2]!,
        coordinateSystem,
      );


    tuples.push(
      `(${formatIfcNumber(transformed[0])},${formatIfcNumber(transformed[1])},${formatIfcNumber(transformed[2])})`,
    );

  }


  if (
    tuples.length < 1
  ) {

    throw new Error(
      "El IFC base no contiene puntos de geometría.",
    );

  }


  return ifcText.replace(
    pointListPattern,
    (
      original,
    ) => {

      const prefix =
        original.slice(
          0,
          original.indexOf("((") + 2,
        );


      return `${prefix}${tuples.join(",")}));`;

    },
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
  const localGeometryValueId =
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
    `#${localGeometryValueId}=IFCPROPERTYSINGLEVALUE('GeometryCoordinateSystem',$,IFCLABEL('PieceDefinitionLocal'),$);`,
    `#${snapValueId}=IFCPROPERTYSINGLEVALUE('Data',$,IFCTEXT('${escapeIfcString(snaps)}'),$);`,
    `#${axisValueId}=IFCPROPERTYSINGLEVALUE('AxisLines',$,IFCTEXT('${escapeIfcString(axes)}'),$);`,

    `#${identityPsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_Identity',$,(#${identityValueId}));`,
    `#${coordinatePsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_CoordinateSystem',$,(#${sourceCoordinateSystemValueId},#${localGeometryValueId}));`,
    `#${snapPsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_SnapPoints',$,(#${snapValueId}));`,
    `#${axisPsetId}=IFCPROPERTYSET('${createIfcGuid()}',$,'FrameLogic_ReferenceGeometry',$,(#${axisValueId}));`,

    `#${identityRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${identityPsetId});`,
    `#${coordinateRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${coordinatePsetId});`,
    `#${snapRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${snapPsetId});`,
    `#${axisRelId}=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',$,$,$,(#${productId}),#${axisPsetId});`,
  ];


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
    extraLines.join(
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


export async function buildPreparedFrameLogicIfc(
  input: PreparedFrameLogicIfcInput,
): Promise<File> {

  const baseText =
    await input.baseIfcFile.text();


  const transformedText =
    transformPointList(
      baseText,
      input.coordinateSystem,
    );


  const finalText =
    appendFrameLogicPropertySets(
      transformedText,
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
