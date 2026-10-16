import occtImportJs from "@sunbox/occt-import-js";


export interface StepPieceIdentity {
  code: string;
  name: string;
  classification?: string;
  tags?: readonly string[];
}


export interface StepConversionResult {
  readonly ifcFile: File;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly sourceMeshCount: number;
}


interface TriangulatedStepGeometry {
  readonly positions: number[];
  readonly triangles: Array<
    readonly [number, number, number]
  >;
  readonly sourceMeshCount: number;
}


let occtPromise:
  ReturnType<typeof occtImportJs>
  | null =
    null;


function getOcct() {

  occtPromise ??=
    occtImportJs();


  return occtPromise;

}


function flattenNumbers(
  value: unknown,
): number[] {

  if (
    ArrayBuffer.isView(
      value,
    )
  ) {

    return Array.from(
      value as unknown as ArrayLike<number>,
    );

  }


  if (
    !Array.isArray(
      value,
    )
  ) {

    return [];

  }


  const result: number[] = [];


  for (
    const item
    of value
  ) {

    if (
      typeof item
      === "number"
    ) {

      result.push(
        item,
      );

      continue;

    }


    if (
      Array.isArray(
        item,
      )
      || ArrayBuffer.isView(
        item,
      )
    ) {

      result.push(
        ...flattenNumbers(
          item,
        ),
      );

    }

  }


  return result;

}


async function readStepGeometry(
  file: File,
): Promise<TriangulatedStepGeometry> {

  const occt =
    await getOcct();


  const data =
    new Uint8Array(
      await file.arrayBuffer(),
    );


  const result =
    occt.ReadStepFile(
      data,
      {
        linearUnit:
          "meter",
        linearDeflectionType:
          "bounding_box_ratio",
        linearDeflection:
          0.001,
        angularDeflection:
          0.5,
      },
    );


  if (
    !result.success
  ) {

    throw new Error(
      `No se pudo leer el STEP "${file.name}" con OpenCascade.`,
    );

  }


  if (
    result.meshes.length < 1
  ) {

    throw new Error(
      `El STEP "${file.name}" no contiene geometría triangulable.`,
    );

  }


  const positions: number[] = [];
  const triangles: Array<
    readonly [number, number, number]
  > = [];


  let vertexOffset =
    0;


  for (
    const mesh
    of result.meshes
  ) {

    const meshPositions =
      flattenNumbers(
        mesh.attributes.position.array,
      );


    const meshIndices =
      flattenNumbers(
        mesh.index.array,
      );


    if (
      meshPositions.length < 9
      || meshPositions.length % 3 !== 0
    ) {

      continue;

    }


    if (
      meshIndices.length < 3
      || meshIndices.length % 3 !== 0
    ) {

      continue;

    }


    if (
      !meshPositions.every(
        Number.isFinite,
      )
      || !meshIndices.every(
        Number.isFinite,
      )
    ) {

      throw new Error(
        `El STEP "${file.name}" contiene coordenadas o índices no válidos.`,
      );

    }


    positions.push(
      ...meshPositions,
    );


    for (
      let index = 0;
      index < meshIndices.length;
      index += 3
    ) {

      const first =
        meshIndices[index];
      const second =
        meshIndices[index + 1];
      const third =
        meshIndices[index + 2];


      if (
        first === undefined
        || second === undefined
        || third === undefined
      ) {

        continue;

      }


      triangles.push(
        [
          Math.trunc(
            first,
          )
          + vertexOffset
          + 1,
          Math.trunc(
            second,
          )
          + vertexOffset
          + 1,
          Math.trunc(
            third,
          )
          + vertexOffset
          + 1,
        ],
      );

    }


    vertexOffset +=
      meshPositions.length / 3;

  }


  if (
    positions.length < 9
    || triangles.length < 1
  ) {

    throw new Error(
      `No fue posible obtener una malla válida desde "${file.name}".`,
    );

  }


  return {
    positions,
    triangles,
    sourceMeshCount:
      result.meshes.length,
  };

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


function formatIfcNumber(
  value: number,
): string {

  if (
    !Number.isFinite(
      value,
    )
  ) {

    throw new Error(
      "La geometría STEP contiene una coordenada no finita.",
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

    return text
      .replace(
        "e",
        "E",
      );

  }


  return `${text}.`;

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


function buildIfcText(
  sourceFileName: string,
  identity: StepPieceIdentity,
  geometry: TriangulatedStepGeometry,
): string {

  const code =
    escapeIfcString(
      identity.code.trim(),
    );


  const name =
    escapeIfcString(
      identity.name.trim()
      || code,
    );


  const classification =
    escapeIfcString(
      identity.classification
        ?.trim()
      ?? "",
    );


  const tags =
    escapeIfcString(
      (
        identity.tags
        ?? []
      )
        .map(
          (
            tag,
          ) =>
            tag.trim(),
        )
        .filter(
          Boolean,
        )
        .join(
          ", ",
        ),
    );


  const sourceName =
    escapeIfcString(
      sourceFileName,
    );


  const pointRows: string[] = [];


  for (
    let index = 0;
    index < geometry.positions.length;
    index += 3
  ) {

    pointRows.push(
      `(${formatIfcNumber(geometry.positions[index] ?? 0)},${formatIfcNumber(geometry.positions[index + 1] ?? 0)},${formatIfcNumber(geometry.positions[index + 2] ?? 0)})`,
    );

  }


  const triangleRows =
    geometry.triangles.map(
      (
        triangle,
      ) =>
        `(${triangle[0]},${triangle[1]},${triangle[2]})`,
    );


  const timestamp =
    new Date()
      .toISOString();


  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME('${sourceName}.ifc','${timestamp}',('FrameLogic'),('FrameLogic'),'FrameLogic STEP preparation','FrameLogic','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    "#1=IFCPERSON($,$,'FrameLogic',$,$,$,$,$);",
    "#2=IFCORGANIZATION($,'FrameLogic',$,$,$);",
    "#3=IFCPERSONANDORGANIZATION(#1,#2,$);",
    "#4=IFCAPPLICATION(#2,'0.1.0','FrameLogic','FRAMELOGIC');",
    "#5=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,0);",
    "#6=IFCCARTESIANPOINT((0.,0.,0.));",
    "#7=IFCAXIS2PLACEMENT3D(#6,$,$);",
    "#8=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#7,$);",
    "#9=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
    "#10=IFCUNITASSIGNMENT((#9));",
    `#11=IFCPROJECT('${createIfcGuid()}',#5,'FrameLogic STEP Piece',$,$,$,$,(#8),#10);`,
    "#12=IFCCARTESIANPOINT((0.,0.,0.));",
    "#13=IFCAXIS2PLACEMENT3D(#12,$,$);",
    "#14=IFCLOCALPLACEMENT($,#13);",
    `#15=IFCCARTESIANPOINTLIST3D((${pointRows.join(",")}));`,
    `#16=IFCTRIANGULATEDFACESET(#15,$,.T.,(${triangleRows.join(",")}),$);`,
    "#17=IFCSHAPEREPRESENTATION(#8,'Body','Tessellation',(#16));",
    "#18=IFCPRODUCTDEFINITIONSHAPE($,$,(#17));",
    `#19=IFCBUILDINGELEMENTPROXY('${createIfcGuid()}',#5,'${name}',$,$,#14,#18,'${code}',.ELEMENT.);`,
    `#20=IFCPROPERTYSINGLEVALUE('Code',$,IFCLABEL('${code}'),$);`,
    `#21=IFCPROPERTYSINGLEVALUE('Classification',$,IFCTEXT('${classification}'),$);`,
    `#22=IFCPROPERTYSINGLEVALUE('Tags',$,IFCTEXT('${tags}'),$);`,
    `#23=IFCPROPERTYSINGLEVALUE('SourceFile',$,IFCTEXT('${sourceName}'),$);`,
    "#24=IFCPROPERTYSINGLEVALUE('SourceFormat',$,IFCLABEL('STEP'),$);",
    `#25=IFCPROPERTYSET('${createIfcGuid()}',#5,'FrameLogic_Identity',$,(#20,#21,#22,#23,#24));`,
    `#26=IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',#5,$,$,(#19),#25);`,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join(
    "\n",
  );

}


export async function convertStepToFrameLogicIfc(
  file: File,
  identity: StepPieceIdentity,
): Promise<StepConversionResult> {

  const code =
    identity.code.trim();


  if (
    code.length === 0
  ) {

    throw new Error(
      "El código de la pieza es obligatorio.",
    );

  }


  const geometry =
    await readStepGeometry(
      file,
    );


  const ifcText =
    buildIfcText(
      file.name,
      {
        ...identity,
        code,
        name:
          identity.name.trim()
          || code,
      },
      geometry,
    );


  const ifcFileName =
    `${code.replace(/[^a-zA-Z0-9_-]+/g, "_") || "FrameLogic_Piece"}.ifc`;


  const ifcFile =
    new File(
      [
        ifcText,
      ],
      ifcFileName,
      {
        type:
          "application/x-step",
      },
    );


  return {
    ifcFile,
    vertexCount:
      geometry.positions.length / 3,
    triangleCount:
      geometry.triangles.length,
    sourceMeshCount:
      geometry.sourceMeshCount,
  };

}
