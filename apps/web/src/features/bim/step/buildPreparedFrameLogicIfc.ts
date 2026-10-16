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


function formatIfcVector(
  vector: Vector3Tuple,
): string {

  return `(${formatIfcNumber(vector[0])},${formatIfcNumber(vector[1])},${formatIfcNumber(vector[2])})`;

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
 * PieceDefinition.coordinateSystem expresa los ejes locales de
 * FrameLogic dentro de las coordenadas originales del STEP.
 *
 * El workspace de preparación usa:
 *
 *   local = A * (asset - origin)
 *
 * donde las filas de A son xAxis, yAxis y zAxis.
 *
 * En IFC, IfcAxis2Placement3D expresa en cambio las columnas de
 * la transformación local -> padre. Por eso las direcciones que
 * escribimos aquí son las columnas de A y la traslación es
 * -A * origin.
 */
function applyPreparedIfcPlacement(
  ifcText: string,
  coordinateSystem: LocalCoordinateSystem,
): string {

  const origin =
    coordinateSystem.origin;

  const xAxis =
    coordinateSystem.xAxis;

  const yAxis =
    coordinateSystem.yAxis;

  const zAxis =
    coordinateSystem.zAxis;


  const location: Vector3Tuple = [
    -(
      xAxis.x * origin.x
      + xAxis.y * origin.y
      + xAxis.z * origin.z
    ),
    -(
      yAxis.x * origin.x
      + yAxis.y * origin.y
      + yAxis.z * origin.z
    ),
    -(
      zAxis.x * origin.x
      + zAxis.y * origin.y
      + zAxis.z * origin.z
    ),
  ];


  /*
   * Columnas de A:
   * - columna 1 = dirección X del STEP transformado;
   * - columna 3 = dirección Z del STEP transformado.
   * IFC calcula Y = Z × X.
   */
  const refDirection: Vector3Tuple = [
    xAxis.x,
    yAxis.x,
    zAxis.x,
  ];

  const axisDirection: Vector3Tuple = [
    xAxis.z,
    yAxis.z,
    zAxis.z,
  ];


  const pointPattern =
    /#12=IFCCARTESIANPOINT\(\([^;]*\)\);/i;

  const axisPlacementPattern =
    /#13=IFCAXIS2PLACEMENT3D\(#12,[^;]*\);/i;


  if (
    !pointPattern.test(
      ifcText,
    )
    || !axisPlacementPattern.test(
      ifcText,
    )
  ) {

    throw new Error(
      "El IFC de trabajo no contiene la colocación esperada de la pieza FrameLogic.",
    );

  }


  let nextId =
    getNextEntityId(
      ifcText,
    );

  const axisDirectionId =
    nextId;

  nextId +=
    1;

  const refDirectionId =
    nextId;


  let result =
    ifcText.replace(
      pointPattern,
      `#12=IFCCARTESIANPOINT(${formatIfcVector(location)});`,
    );


  result =
    result.replace(
      axisPlacementPattern,
      `#13=IFCAXIS2PLACEMENT3D(#12,#${axisDirectionId},#${refDirectionId});`,
    );


  result =
    insertBeforeDataEnd(
      result,
      [
        `#${axisDirectionId}=IFCDIRECTION(${formatIfcVector(axisDirection)});`,
        `#${refDirectionId}=IFCDIRECTION(${formatIfcVector(refDirection)});`,
      ],
    );


  return result;

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
    `#${geometryCoordinateSystemValueId}=IFCPROPERTYSINGLEVALUE('GeometryCoordinateSystem',$,IFCLABEL('PreparedIfcLocalPlacement'),$);`,
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


  /*
   * La geometría STEP permanece intacta. La preparación se
   * expresa mediante la colocación IFC del producto, que es el
   * mecanismo estándar para origen + orientación y es respetado
   * por Web-IFC/Mesher al volver a importar la pieza.
   */
  const placedText =
    applyPreparedIfcPlacement(
      baseText,
      input.coordinateSystem,
    );


  const finalText =
    appendFrameLogicPropertySets(
      placedText,
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