import occtImportJs from "@sunbox/occt-import-js";

import {
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

import type {
  OpenCascadeBrepSnapshot,
  StepGeometryAdapter,
  StepGeometryDocument,
  StepGeometryFeature,
  StepMeshData,
  StepProductNode,
} from "@framelogic/geometry";


let occtPromise:
  ReturnType<typeof occtImportJs>
  | null =
    null;


function getOcct() {
  occtPromise ??=
    occtImportJs();

  return occtPromise;
}


function cloneSourceData(
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const buffer =
    new ArrayBuffer(
      data.byteLength,
    );
  const clone =
    new Uint8Array(
      buffer,
    );

  clone.set(
    data,
  );

  return clone;
}


/**
 * STEP entra por dos rutas coordinadas:
 *
 * 1. @sunbox/occt-import-js -> triangulación para Three.js.
 * 2. OpenCascade.js completo -> TopoDS_Shape vivo + B-Rep exacto.
 *
 * La segunda ruta es la autoridad geométrica. La primera no participa en
 * decisiones de precisión; solo evita cambiar el pipeline visual mientras
 * migramos progresivamente toda la triangulación al kernel completo.
 */
export class OcctStepGeometryAdapter
  implements StepGeometryAdapter {
  async load(
    data: Uint8Array,
    options: Parameters<StepGeometryAdapter["load"]>[1],
  ): Promise<StepGeometryDocument> {
    const sourceData =
      cloneSourceData(
        data,
      );
    const occt =
      await getOcct();
    const brepKernel =
      getOpenCascadeBrepKernel();

    const targetUnit =
      options.targetUnit
      ?? "meter";

    const [
      result,
      brep,
    ] =
      await Promise.all([
        Promise.resolve(
          occt.ReadStepFile(
            data,
            {
              linearUnit:
                targetUnit,
              linearDeflectionType:
                "bounding_box_ratio",
              linearDeflection:
                0.001,
              angularDeflection:
                0.5,
            },
          ),
        ),
        brepKernel.loadStep(
          sourceData,
          options.sourceFileName,
        ),
      ]);

    if (!result.success) {
      brepKernel.disposeDocument(
        brep.id,
      );
      throw new Error(
        `No se pudo leer el STEP "${options.sourceFileName}" con OpenCascade.`,
      );
    }

    const meshes:
      StepMeshData[] =
      result.meshes.map(
        (
          mesh,
          index,
        ) => ({
          id:
            mesh.name
            || `mesh-${index + 1}`,
          positions:
            new Float32Array(
              mesh.attributes.position.array,
            ),
          indices:
            new Uint32Array(
              mesh.index.array,
            ),
          normals:
            mesh.attributes.normal
              ? new Float32Array(
                  mesh.attributes.normal.array,
                )
              : undefined,
        }),
      );

    /*
     * El binding visual y OpenCascade.js pueden elegir unidades internas
     * diferentes. Derivamos UNA escala uniforme comparando sus bounds; así
     * el B-Rep exacto coincide con la malla visible sin asumir que OCCT usa
     * metros o milímetros internamente.
     */
    const modelScale =
      inferBrepToMeshScale(
        brep,
        meshes,
      );

    brepKernel.setModelScale(
      brep.id,
      modelScale,
    );

    const scaledBrep =
      brepKernel.getDocument(
        brep.id,
      )
      ?? brep;

    const products:
      StepProductNode[] = [];

    const visitNode = (
      node: typeof result.root,
      path: string,
    ): string => {
      const id =
        path;
      const childIds =
        node.children.map(
          (
            child,
            index,
          ) =>
            visitNode(
              child,
              `${path}/${index}`,
            ),
        );

      products.push({
        id,
        name:
          node.name
          || undefined,
        geometryIds:
          node.meshes
            .map(
              (
                meshIndex,
              ) =>
                meshes[meshIndex]?.id,
            )
            .filter(
              (
                value,
              ): value is string =>
                value !== undefined,
            ),
        childIds,
      });

      return id;
    };

    visitNode(
      result.root,
      "root",
    );

    return {
      id:
        crypto.randomUUID(),
      sourceFileName:
        options.sourceFileName,
      sourceData,
      brepDocumentId:
        brep.id,
      unitScaleToMeters:
        targetUnit === "millimeter"
          ? 0.001
          : 1,
      meshes,
      features:
        options.includeExactFeatures
          === false
          ? []
          : createExactFeatures(
              scaledBrep,
            ),
      products,
    };
  }


  disposeDocument(
    documentId: string,
  ): void {
    getOpenCascadeBrepKernel()
      .disposeDocument(
        documentId,
      );
  }
}


function createExactFeatures(
  brep: OpenCascadeBrepSnapshot,
): StepGeometryFeature[] {
  const scale =
    brep.modelScale;
  const features:
    StepGeometryFeature[] = [];

  for (
    const edge
    of brep.edges
  ) {
    if (!edge.circle) {
      continue;
    }

    features.push({
      id:
        `brep:${edge.id}:circle`,
      kind:
        "CIRCLE",
      precision:
        "BREP_EXACT",
      center:
        scalePoint(
          edge.circle.center,
          scale,
        ),
      normal:
        edge.circle.normal,
      radius:
        edge.circle.radius
        * scale,
    });
  }

  for (
    const cylinder
    of brep.cylinders
  ) {
    features.push({
      id:
        `brep:${cylinder.id}`,
      kind:
        "CYLINDER",
      precision:
        "BREP_EXACT",
      axisOrigin:
        scalePoint(
          cylinder.axisOrigin,
          scale,
        ),
      axisDirection:
        cylinder.axisDirection,
      radius:
        cylinder.radius
        * scale,
    });
  }

  for (
    const plane
    of brep.planes
  ) {
    features.push({
      id:
        `brep:${plane.id}`,
      kind:
        "PLANE",
      precision:
        "BREP_EXACT",
      origin:
        scalePoint(
          plane.origin,
          scale,
        ),
      normal:
        plane.normal,
    });
  }

  return features;
}


function inferBrepToMeshScale(
  brep: OpenCascadeBrepSnapshot,
  meshes: readonly StepMeshData[],
): number {
  const brepDiagonal =
    pointCloudDiagonal(
      brep.vertices.map(
        (
          vertex,
        ) => vertex.point,
      ),
    );
  const meshPoints:
    Array<{
      x: number;
      y: number;
      z: number;
    }> = [];

  for (
    const mesh
    of meshes
  ) {
    for (
      let index = 0;
      index + 2
        < mesh.positions.length;
      index += 3
    ) {
      meshPoints.push({
        x:
          mesh.positions[index]
          ?? 0,
        y:
          mesh.positions[index + 1]
          ?? 0,
        z:
          mesh.positions[index + 2]
          ?? 0,
      });
    }
  }

  const meshDiagonal =
    pointCloudDiagonal(
      meshPoints,
    );

  if (
    !Number.isFinite(
      brepDiagonal,
    )
    || brepDiagonal <= 1e-12
    || !Number.isFinite(
      meshDiagonal,
    )
    || meshDiagonal <= 1e-12
  ) {
    return 1;
  }

  const scale =
    meshDiagonal
    / brepDiagonal;

  return Number.isFinite(
    scale,
  )
    && scale > 0
    ? scale
    : 1;
}


function pointCloudDiagonal(
  points: readonly {
    x: number;
    y: number;
    z: number;
  }[],
): number {
  if (
    points.length < 1
  ) {
    return 0;
  }

  let minX =
    Number.POSITIVE_INFINITY;
  let minY =
    Number.POSITIVE_INFINITY;
  let minZ =
    Number.POSITIVE_INFINITY;
  let maxX =
    Number.NEGATIVE_INFINITY;
  let maxY =
    Number.NEGATIVE_INFINITY;
  let maxZ =
    Number.NEGATIVE_INFINITY;

  for (
    const point
    of points
  ) {
    minX = Math.min(
      minX,
      point.x,
    );
    minY = Math.min(
      minY,
      point.y,
    );
    minZ = Math.min(
      minZ,
      point.z,
    );
    maxX = Math.max(
      maxX,
      point.x,
    );
    maxY = Math.max(
      maxY,
      point.y,
    );
    maxZ = Math.max(
      maxZ,
      point.z,
    );
  }

  return Math.hypot(
    maxX - minX,
    maxY - minY,
    maxZ - minZ,
  );
}


function scalePoint(
  point: {
    x: number;
    y: number;
    z: number;
  },
  scale: number,
) {
  return {
    x:
      point.x * scale,
    y:
      point.y * scale,
    z:
      point.z * scale,
  };
}
