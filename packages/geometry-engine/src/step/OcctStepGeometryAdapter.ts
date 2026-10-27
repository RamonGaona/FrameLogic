// @ts-ignore -- @sunbox/occt-import-js does not publish TypeScript declarations.
import occtImportJs from "@sunbox/occt-import-js";

import {
  getOpenCascadeBrepKernel,
} from "./OpenCascadeBrepKernel";

import type {
  OpenCascadeBrepSnapshot,
} from "./OpenCascadeBrepKernel";

import type {
  StepGeometryAdapter,
  StepGeometryDocument,
  StepGeometryFeature,
  StepMeshData,
  StepProductNode,
} from "./StepGeometryAdapter";

interface OcctArrayAttribute {
  readonly array: number[];
}

interface OcctMesh {
  readonly name: string;
  readonly attributes: {
    readonly position: OcctArrayAttribute;
    readonly normal?: OcctArrayAttribute;
  };
  readonly index: OcctArrayAttribute;
}

interface OcctNode {
  readonly name: string;
  readonly meshes: number[];
  readonly children: OcctNode[];
}

interface OcctImportResult {
  readonly success: boolean;
  readonly root: OcctNode;
  readonly meshes: OcctMesh[];
}

interface OcctModule {
  ReadStepFile(
    content: Uint8Array,
    params: {
      readonly linearUnit: string;
      readonly linearDeflectionType: string;
      readonly linearDeflection: number;
      readonly angularDeflection: number;
    },
  ): OcctImportResult;
}

let occtPromise:
  Promise<OcctModule>
  | null =
    null;

function getOcct(): Promise<OcctModule> {
  occtPromise ??=
    (occtImportJs() as Promise<OcctModule>);
  return occtPromise;
}

/**
 * Conserva los bytes originales sin copiar el archivo completo cuando el
 * Uint8Array ya posee un ArrayBuffer exclusivo (caso normal de File y de los
 * paquetes FrameLogic). Solo copiamos vistas parciales o buffers no estándar.
 */
function retainSourceData(
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (
    data.buffer instanceof ArrayBuffer
    && data.byteOffset === 0
    && data.byteLength === data.buffer.byteLength
  ) {
    return data as Uint8Array<ArrayBuffer>;
  }

  const clone =
    new Uint8Array(
      new ArrayBuffer(data.byteLength),
    );
  clone.set(data);
  return clone;
}

function yieldToBrowser(): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(resolve, 0);
    },
  );
}

function now(): number {
  return typeof performance !== "undefined"
    ? performance.now()
    : Date.now();
}

function logTiming(
  fileName: string,
  timings: Record<string, number>,
): void {
  console.debug(
    `[FrameLogic][STEP] ${fileName}`,
    Object.fromEntries(
      Object.entries(timings).map(
        ([key, value]) => [key, Math.round(value * 10) / 10],
      ),
    ),
  );
}

/**
 * Adaptador STEP reutilizable por el visor y por el cargador de proyectos.
 * La triangulación alimenta Three.js; OpenCascade.js conserva el B-Rep vivo.
 *
 * Las dos etapas siguen siendo exactas/compatibles, pero ya no se lanzan como
 * un falso Promise.all: ReadStepFile es síncrono y bloqueaba antes de iniciar
 * la segunda rama. Cedemos un turno al navegador entre las etapas pesadas para
 * permitir que la UI actualice el estado de carga sin modificar los objetos
 * internos devueltos por @sunbox/occt-import-js.
 */
export class OcctStepGeometryAdapter
  implements StepGeometryAdapter {
  async load(
    data: Uint8Array,
    options: Parameters<StepGeometryAdapter["load"]>[1],
  ): Promise<StepGeometryDocument> {
    const totalStart = now();
    const sourceData =
      retainSourceData(data);
    const occtInitStart = now();
    const occt =
      await getOcct();
    const occtInitMs =
      now() - occtInitStart;
    const brepKernel =
      getOpenCascadeBrepKernel();
    const targetUnit =
      options.targetUnit
      ?? "meter";

    await yieldToBrowser();

    const visualStart = now();
    const result =
      occt.ReadStepFile(
        data,
        {
          linearUnit: targetUnit,
          linearDeflectionType: "bounding_box_ratio",
          linearDeflection: 0.001,
          angularDeflection: 0.5,
        },
      );
    const visualMs =
      now() - visualStart;

    if (!result.success) {
      throw new Error(
        `No se pudo leer el STEP "${options.sourceFileName}" con OpenCascade.`,
      );
    }

    const meshConvertStart = now();
    const meshes:
      StepMeshData[] =
      result.meshes.map(
        (
          mesh: OcctMesh,
          index: number,
        ): StepMeshData => ({
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
    const meshConvertMs =
      now() - meshConvertStart;

    await yieldToBrowser();

    const brepStart = now();
    const brep =
      await brepKernel.loadStep(
        sourceData,
        options.sourceFileName,
      );
    const brepMs =
      now() - brepStart;

    const scaleStart = now();
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
      brepKernel.getDocument(brep.id)
      ?? brep;
    const scaleMs =
      now() - scaleStart;

    const products:
      StepProductNode[] = [];

    const visitNode = (
      node: OcctNode,
      path: string,
    ): string => {
      const id = path;
      const childIds =
        node.children.map(
          (
            child: OcctNode,
            index: number,
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
              (meshIndex: number) =>
                meshes[meshIndex]?.id,
            )
            .filter(
              (
                value: string | undefined,
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

    const featureStart = now();
    const features =
      options.includeExactFeatures
        === false
        ? []
        : createExactFeatures(
            scaledBrep,
          );
    const featureMs =
      now() - featureStart;

    logTiming(
      options.sourceFileName,
      {
        occtInitMs,
        visualMs,
        meshConvertMs,
        brepMs,
        scaleMs,
        featureMs,
        totalMs:
          now() - totalStart,
      },
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
      features,
      products,
    };
  }

  disposeDocument(
    documentId: string,
  ): void {
    getOpenCascadeBrepKernel()
      .disposeDocument(documentId);
  }
}

function createExactFeatures(
  brep: OpenCascadeBrepSnapshot,
): StepGeometryFeature[] {
  const scale =
    brep.modelScale;
  const features:
    StepGeometryFeature[] = [];

  for (const edge of brep.edges) {
    if (!edge.circle) continue;
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

  for (const cylinder of brep.cylinders) {
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

  for (const plane of brep.planes) {
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
    brepVertexDiagonal(brep);
  const meshDiagonal =
    meshVertexDiagonal(meshes);

  if (
    !Number.isFinite(brepDiagonal)
    || brepDiagonal <= 1e-12
    || !Number.isFinite(meshDiagonal)
    || meshDiagonal <= 1e-12
  ) {
    return 1;
  }

  const scale =
    meshDiagonal
    / brepDiagonal;

  return Number.isFinite(scale)
    && scale > 0
    ? scale
    : 1;
}

function brepVertexDiagonal(
  brep: OpenCascadeBrepSnapshot,
): number {
  if (brep.vertices.length < 1) {
    return 0;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const vertex of brep.vertices) {
    const point = vertex.point;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.z < minZ) minZ = point.z;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if (point.z > maxZ) maxZ = point.z;
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
  let hasPoint = false;

  for (const mesh of meshes) {
    const positions = mesh.positions;
    for (
      let index = 0;
      index + 2 < positions.length;
      index += 3
    ) {
      const x = positions[index] ?? 0;
      const y = positions[index + 1] ?? 0;
      const z = positions[index + 2] ?? 0;
      hasPoint = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }

  return hasPoint
    ? Math.hypot(
        maxX - minX,
        maxY - minY,
        maxZ - minZ,
      )
    : 0;
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
    x: point.x * scale,
    y: point.y * scale,
    z: point.z * scale,
  };
}
