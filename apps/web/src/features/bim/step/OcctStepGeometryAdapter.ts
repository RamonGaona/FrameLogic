import { OcctStepGeometryAdapter as CachedStepGeometryAdapter } from "@framelogic/geometry";
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


interface StepPerformanceRecord {
  readonly fileName: string;
  readonly fileSizeMb: number;
  readonly totalMs: number;
  readonly cloneSourceMs: number;
  readonly visualKernelInitMs: number;
  readonly visualTriangulationMs: number;
  readonly brepLoadMs: number;
  readonly meshCopyMs: number;
  readonly scaleInferenceMs: number;
  readonly productTreeMs: number;
  readonly exactFeaturesMs: number;
  readonly meshCount: number;
  readonly visualVertexCount: number;
  readonly triangleCount: number;
  readonly brepVertexCount: number;
  readonly brepEdgeCount: number;
  readonly brepCylinderCount: number;
  readonly brepPlaneCount: number;
  readonly exactFeatureCount: number;
  readonly productCount: number;
}


interface StepDiagnosticsWindow extends Window {
  __frameLogicStepTimings?:
    StepPerformanceRecord[];
}


function getOcct() {
  occtPromise ??=
    occtImportJs();

  return occtPromise;
}


export async function warmupStepGeometryKernels():
  Promise<void> {
  const brepKernel =
    getOpenCascadeBrepKernel();

  await Promise.all([
    getOcct().then(
      () => undefined,
    ),
    brepKernel.warmup(),
  ]);
}


function elapsedMs(
  start: number,
): number {
  return performance.now()
    - start;
}


function roundMs(
  value: number,
): number {
  return Math.round(
    value * 10,
  ) / 10;
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


function publishStepPerformance(
  record: StepPerformanceRecord,
): void {
  const diagnosticsWindow =
    window as StepDiagnosticsWindow;

  diagnosticsWindow
    .__frameLogicStepTimings ??= [];

  diagnosticsWindow
    .__frameLogicStepTimings
    .push(
      record,
    );

  console.groupCollapsed(
    `[FrameLogic STEP] ${record.fileName} · ${roundMs(record.totalMs)} ms`,
  );
  console.table([
    {
      etapa: "Copiar STEP original",
      ms: roundMs(record.cloneSourceMs),
    },
    {
      etapa: "Inicializar kernel visual WASM",
      ms: roundMs(record.visualKernelInitMs),
    },
    {
      etapa: "Leer + triangular STEP visual",
      ms: roundMs(record.visualTriangulationMs),
    },
    {
      etapa: "Cargar + indexar B-Rep exacto",
      ms: roundMs(record.brepLoadMs),
    },
    {
      etapa: "Copiar buffers de malla",
      ms: roundMs(record.meshCopyMs),
    },
    {
      etapa: "Inferir escala B-Rep ↔ malla",
      ms: roundMs(record.scaleInferenceMs),
    },
    {
      etapa: "Construir árbol de productos",
      ms: roundMs(record.productTreeMs),
    },
    {
      etapa: "Crear features exactos",
      ms: roundMs(record.exactFeaturesMs),
    },
    {
      etapa: "TOTAL",
      ms: roundMs(record.totalMs),
    },
  ]);
  console.table({
    "Tamaño STEP (MB)":
      Math.round(
        record.fileSizeMb * 100,
      ) / 100,
    Mallas:
      record.meshCount,
    "Vértices visuales":
      record.visualVertexCount,
    Triángulos:
      record.triangleCount,
    "Vértices B-Rep":
      record.brepVertexCount,
    "Aristas B-Rep":
      record.brepEdgeCount,
    Cilindros:
      record.brepCylinderCount,
    Planos:
      record.brepPlaneCount,
    "Features exactos":
      record.exactFeatureCount,
    Productos:
      record.productCount,
  });
  console.info(
    "Historial temporal: window.__frameLogicStepTimings",
  );
  console.groupEnd();
}


/**
 * STEP entra por dos rutas coordinadas:
 *
 * 1. @sunbox/occt-import-js -> triangulación para Three.js.
 * 2. OpenCascade.js completo -> TopoDS_Shape vivo + B-Rep exacto.
 *
 * FrameLogic usa 1 unidad de Model Space = 1 milímetro. La frontera STEP
 * normaliza siempre a milímetros, incluso si una llamada antigua todavía
 * solicita `targetUnit: "meter"`.
 *
 * TEMPORAL: este adaptador publica mediciones en consola y conserva el
 * historial de la sesión en window.__frameLogicStepTimings. La instrumentación
 * no modifica la geometría ni las opciones de importación.
 */
export class OcctStepGeometryAdapter
  implements StepGeometryAdapter {
  async load(
    data: Uint8Array,
    options: Parameters<StepGeometryAdapter["load"]>[1],
  ): Promise<StepGeometryDocument> {
    if (options.cachedVisuals) {
      return new CachedStepGeometryAdapter().load(data, options);
    }
    const totalStart =
      performance.now();

    const cloneStart =
      performance.now();
    const sourceData =
      cloneSourceData(
        data,
      );
    const cloneSourceMs =
      elapsedMs(
        cloneStart,
      );

    const visualKernelStart =
      performance.now();
    const occt =
      await getOcct();
    const visualKernelInitMs =
      elapsedMs(
        visualKernelStart,
      );

    const brepKernel =
      getOpenCascadeBrepKernel();

    const targetUnit =
      "millimeter" as const;

    /*
     * ReadStepFile es síncrono. Medirlo separado deja visible que envolverlo
     * en Promise.resolve no lo convertía en trabajo paralelo.
     */
    const visualTriangulationStart =
      performance.now();
    const result =
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
      );
    const visualTriangulationMs =
      elapsedMs(
        visualTriangulationStart,
      );

    const brepStart =
      performance.now();
    const brep =
      await brepKernel.loadStep(
        sourceData,
        options.sourceFileName,
      );
    const brepLoadMs =
      elapsedMs(
        brepStart,
      );

    if (!result.success) {
      brepKernel.disposeDocument(
        brep.id,
      );
      throw new Error(
        `No se pudo leer el STEP "${options.sourceFileName}" con OpenCascade.`,
      );
    }

    const meshCopyStart =
      performance.now();
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
    const meshCopyMs =
      elapsedMs(
        meshCopyStart,
      );

    /*
     * El binding visual y OpenCascade.js pueden elegir unidades internas
     * diferentes. Derivamos UNA escala uniforme comparando sus bounds; así
     * el B-Rep exacto coincide con la malla visible sin asumir la unidad
     * interna del kernel.
     */
    const scaleStart =
      performance.now();
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
    const scaleInferenceMs =
      elapsedMs(
        scaleStart,
      );

    const productsStart =
      performance.now();
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
    const productTreeMs =
      elapsedMs(
        productsStart,
      );

    const exactFeaturesStart =
      performance.now();
    const features =
      options.includeExactFeatures
        === false
        ? []
        : createExactFeatures(
            scaledBrep,
          );
    const exactFeaturesMs =
      elapsedMs(
        exactFeaturesStart,
      );

    let visualVertexCount =
      0;
    let triangleCount =
      0;

    for (
      const mesh
      of meshes
    ) {
      visualVertexCount +=
        Math.floor(
          mesh.positions.length / 3,
        );
      triangleCount +=
        Math.floor(
          mesh.indices.length / 3,
        );
    }

    publishStepPerformance({
      fileName:
        options.sourceFileName,
      fileSizeMb:
        data.byteLength
        / (
          1024
          * 1024
        ),
      totalMs:
        elapsedMs(
          totalStart,
        ),
      cloneSourceMs,
      visualKernelInitMs,
      visualTriangulationMs,
      brepLoadMs,
      meshCopyMs,
      scaleInferenceMs,
      productTreeMs,
      exactFeaturesMs,
      meshCount:
        meshes.length,
      visualVertexCount,
      triangleCount,
      brepVertexCount:
        scaledBrep.vertices.length,
      brepEdgeCount:
        scaledBrep.edges.length,
      brepCylinderCount:
        scaledBrep.cylinders.length,
      brepPlaneCount:
        scaledBrep.planes.length,
      exactFeatureCount:
        features.length,
      productCount:
        products.length,
    });

    return {
      id:
        crypto.randomUUID(),
      sourceFileName:
        options.sourceFileName,
      sourceData,
      brepDocumentId:
        brep.id,
      unitScaleToMeters:
        0.001,
      meshes,
      features,
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
    brepVertexDiagonal(
      brep.vertices,
    );
  const meshDiagonal =
    meshVertexDiagonal(
      meshes,
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


function brepVertexDiagonal(
  vertices: OpenCascadeBrepSnapshot["vertices"],
): number {
  if (
    vertices.length < 1
  ) {
    return 0;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (
    const vertex
    of vertices
  ) {
    const point =
      vertex.point;

    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }

  return Math.hypot(
    maxX - minX,
    maxY - minY,
    maxZ - minZ,
  );
}


function meshVertexDiagonal(
  meshes: readonly StepMeshData[],
): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let pointCount = 0;

  for (
    const mesh
    of meshes
  ) {
    const positions =
      mesh.positions;

    for (
      let index = 0;
      index + 2 < positions.length;
      index += 3
    ) {
      const x = positions[index] ?? 0;
      const y = positions[index + 1] ?? 0;
      const z = positions[index + 2] ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
      pointCount += 1;
    }
  }

  if (
    pointCount < 1
  ) {
    return 0;
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
