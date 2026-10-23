import occtImportJs from "@sunbox/occt-import-js";

import type {
  StepGeometryAdapter,
  StepGeometryDocument,
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


/**
 * Adaptador transitorio basado en el importador OCCT ya instalado.
 *
 * Entrega malla STEP directa y estructura de producto, pero el binding
 * actual no expone todavía círculos/cilindros B-Rep exactos. Por eso
 * features queda vacío hasta sustituirlo por el adapter OCCT de precisión.
 */
export class OcctStepGeometryAdapter
  implements StepGeometryAdapter {
  async load(
    data: Uint8Array,
    options: Parameters<StepGeometryAdapter["load"]>[1],
  ): Promise<StepGeometryDocument> {
    const occt =
      await getOcct();

    const targetUnit =
      options.targetUnit
      ?? "meter";

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

    if (!result.success) {
      throw new Error(
        `No se pudo leer el STEP "${options.sourceFileName}" con OpenCascade.`,
      );
    }

    const meshes =
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
      unitScaleToMeters:
        targetUnit === "millimeter"
          ? 0.001
          : 1,
      meshes,
      features: [],
      products,
    };
  }
}
