import {
  getOpenCascadeBrepKernel,
} from "./OpenCascadeBrepKernel";

import type {
  Point3,
} from "../types/Point3";

import type {
  Vector3,
} from "../types/Vector3";


export type OpenCascadeDrawingPrecision =
  | "BREP_EXACT"
  | "FALLBACK";

export interface OpenCascadeDrawingSegment {
  readonly a: Point3;
  readonly b: Point3;
  readonly visible: boolean;
  readonly topologyId?: string;
}

export interface OpenCascadeSectionResult {
  readonly precision: OpenCascadeDrawingPrecision;
  readonly segments: readonly OpenCascadeDrawingSegment[];
  readonly reason?: string;
}

export interface OpenCascadeHlrResult {
  readonly precision: OpenCascadeDrawingPrecision;
  readonly visible: readonly OpenCascadeDrawingSegment[];
  readonly hidden: readonly OpenCascadeDrawingSegment[];
  readonly reason?: string;
}

interface Deleteable {
  delete?: () => void;
}

interface RuntimeDocument {
  readonly shape: unknown;
  readonly modelScale: number;
}

interface KernelRuntime {
  readonly documents: Map<string, RuntimeDocument>;
  getOpenCascade: () => Promise<Record<string, unknown>>;
}

interface CurveAdaptor extends Deleteable {
  FirstParameter: () => number;
  LastParameter: () => number;
  Value: (parameter: number) => PointObject;
}

interface PointObject extends Deleteable {
  X: () => number;
  Y: () => number;
  Z: () => number;
}

interface Explorer extends Deleteable {
  More: () => boolean;
  Current: () => unknown;
  Next: () => void;
}

interface ShapeAlgorithm extends Deleteable {
  Shape?: () => unknown;
  Build?: (progress: unknown) => void;
  IsDone?: () => boolean;
}

const SAMPLE_COUNT = 24;

/**
 * Operaciones 2D de documentación sobre el TopoDS_Shape vivo.
 *
 * opencascade.js genera nombres de constructor con sufijos `_1`, `_2`, ...
 * según el overload de OCCT. Este adaptador detecta el overload disponible en
 * runtime para mantener FrameLogic desacoplado de una versión concreta del
 * archivo de declaraciones generado.
 */
export class OpenCascadeDrawingKernel {
  async sectionByPlane(
    documentId: string,
    origin: Point3,
    normal: Vector3,
  ): Promise<OpenCascadeSectionResult> {
    const runtime =
      getOpenCascadeBrepKernel() as unknown as KernelRuntime;
    const document =
      runtime.documents.get(
        documentId,
      );

    if (!document) {
      return {
        precision: "FALLBACK",
        segments: [],
        reason: "B-Rep document is not loaded.",
      };
    }

    try {
      const oc =
        await runtime.getOpenCascade();
      const point =
        this.construct(
          oc,
          "gp_Pnt_",
          [
            origin.x / document.modelScale,
            origin.y / document.modelScale,
            origin.z / document.modelScale,
          ],
        );
      const direction =
        this.construct(
          oc,
          "gp_Dir_",
          [
            normal.x,
            normal.y,
            normal.z,
          ],
        );
      const plane =
        this.construct(
          oc,
          "gp_Pln_",
          [point, direction],
        );
      const section =
        this.construct(
          oc,
          "BRepAlgoAPI_Section_",
          [document.shape, plane, false],
          [document.shape, plane],
        ) as ShapeAlgorithm;

      this.callOptional(
        section,
        ["ComputePCurveOn1", "ComputePCurveOn1_1"],
        false,
      );
      this.callOptional(
        section,
        ["ComputePCurveOn2", "ComputePCurveOn2_1"],
        false,
      );
      this.callOptional(
        section,
        ["Approximation", "Approximation_1"],
        true,
      );
      this.buildAlgorithm(
        oc,
        section,
      );

      const shape =
        section.Shape?.();

      if (!shape) {
        this.disposeMany(
          section,
          plane,
          direction,
          point,
        );
        return {
          precision: "FALLBACK",
          segments: [],
          reason: "OpenCascade section operation returned no shape.",
        };
      }

      const segments =
        this.extractShapeSegments(
          oc,
          shape,
          document.modelScale,
          true,
        );

      this.disposeMany(
        shape,
        section,
        plane,
        direction,
        point,
      );

      return {
        precision: "BREP_EXACT",
        segments,
      };
    }
    catch (
      error
    ) {
      return {
        precision: "FALLBACK",
        segments: [],
        reason:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  async hiddenLines(
    documentId: string,
    direction: Vector3,
    up: Vector3,
  ): Promise<OpenCascadeHlrResult> {
    const runtime =
      getOpenCascadeBrepKernel() as unknown as KernelRuntime;
    const document =
      runtime.documents.get(
        documentId,
      );

    if (!document) {
      return {
        precision: "FALLBACK",
        visible: [],
        hidden: [],
        reason: "B-Rep document is not loaded.",
      };
    }

    try {
      const oc =
        await runtime.getOpenCascade();
      const location =
        this.construct(
          oc,
          "gp_Pnt_",
          [0, 0, 0],
        );
      const viewDirection =
        this.construct(
          oc,
          "gp_Dir_",
          [
            direction.x,
            direction.y,
            direction.z,
          ],
        );
      const xVector =
        normalize(
          cross(
            up,
            direction,
          ),
        );
      const xDirection =
        this.construct(
          oc,
          "gp_Dir_",
          [
            xVector.x,
            xVector.y,
            xVector.z,
          ],
        );
      const axis =
        this.construct(
          oc,
          "gp_Ax2_",
          [location, viewDirection, xDirection],
          [location, viewDirection],
        );
      const projector =
        this.construct(
          oc,
          "HLRAlgo_Projector_",
          [axis, false, 0],
          [axis],
        );
      const algo =
        this.construct(
          oc,
          "HLRBRep_Algo_",
          [],
        ) as Record<string, unknown> & Deleteable;

      this.callRequired(
        algo,
        ["Add", "Add_1", "Add_2"],
        document.shape,
        0,
      );
      this.callRequired(
        algo,
        ["Projector", "Projector_1"],
        projector,
      );
      this.callRequired(
        algo,
        ["Update", "Update_1"],
      );
      this.callRequired(
        algo,
        ["Hide", "Hide_1"],
      );

      const extractor =
        this.construct(
          oc,
          "HLRBRep_HLRToShape_",
          [algo],
        ) as Record<string, unknown> & Deleteable;
      const visibleShape =
        this.firstShape(
          extractor,
          [
            "VCompound",
            "Rg1LineVCompound",
            "OutLineVCompound",
          ],
        );
      const hiddenShape =
        this.firstShape(
          extractor,
          [
            "HCompound",
            "Rg1LineHCompound",
            "OutLineHCompound",
          ],
        );
      const visible =
        visibleShape
          ? this.extractShapeSegments(
              oc,
              visibleShape,
              document.modelScale,
              true,
            )
          : [];
      const hidden =
        hiddenShape
          ? this.extractShapeSegments(
              oc,
              hiddenShape,
              document.modelScale,
              false,
            )
          : [];

      this.disposeMany(
        visibleShape,
        hiddenShape,
        extractor,
        algo,
        projector,
        axis,
        xDirection,
        viewDirection,
        location,
      );

      return {
        precision: "BREP_EXACT",
        visible,
        hidden,
      };
    }
    catch (
      error
    ) {
      return {
        precision: "FALLBACK",
        visible: [],
        hidden: [],
        reason:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  private extractShapeSegments(
    oc: Record<string, unknown>,
    shape: unknown,
    scale: number,
    visible: boolean,
  ): OpenCascadeDrawingSegment[] {
    const shapeEnum =
      oc["TopAbs_ShapeEnum"] as
        | Record<string, unknown>
        | undefined;
    const edgeEnum =
      shapeEnum?.["TopAbs_EDGE"];
    const genericEnum =
      shapeEnum?.["TopAbs_SHAPE"];

    if (
      edgeEnum === undefined
      || genericEnum === undefined
    ) {
      throw new Error(
        "OpenCascade TopAbs edge enum is unavailable.",
      );
    }

    const explorer =
      this.constructExact(
        oc,
        "TopExp_Explorer_2",
        [shape, edgeEnum, genericEnum],
      ) as Explorer;
    const result:
      OpenCascadeDrawingSegment[] = [];
    let edgeIndex = 0;

    try {
      while (
        explorer.More()
      ) {
        const edge =
          this.callStatic(
            oc,
            "TopoDS",
            ["Edge_1", "Edge"],
            explorer.Current(),
          );
        const adaptor =
          this.constructExact(
            oc,
            "BRepAdaptor_Curve_2",
            [edge],
          ) as CurveAdaptor;

        try {
          const first =
            adaptor.FirstParameter();
          const last =
            adaptor.LastParameter();

          if (
            Number.isFinite(first)
            && Number.isFinite(last)
          ) {
            let previous =
              this.readPoint(
                adaptor.Value(first),
                scale,
              );

            for (
              let index = 1;
              index <= SAMPLE_COUNT;
              index += 1
            ) {
              const parameter =
                first
                + (
                    last - first
                  )
                  * index
                  / SAMPLE_COUNT;
              const current =
                this.readPoint(
                  adaptor.Value(parameter),
                  scale,
                );

              result.push({
                a: previous,
                b: current,
                visible,
                topologyId:
                  `hlr-edge-${edgeIndex}`,
              });
              previous =
                current;
            }
          }
        }
        finally {
          adaptor.delete?.();
          this.disposeMany(
            edge,
          );
        }

        explorer.Next();
        edgeIndex += 1;
      }
    }
    finally {
      explorer.delete?.();
    }

    return result;
  }

  private buildAlgorithm(
    oc: Record<string, unknown>,
    algorithm: ShapeAlgorithm,
  ): void {
    if (!algorithm.Build) {
      return;
    }

    const progress =
      this.constructExact(
        oc,
        "Message_ProgressRange_1",
        [],
      );

    try {
      algorithm.Build(
        progress,
      );
    }
    finally {
      this.disposeMany(
        progress,
      );
    }
  }

  private firstShape(
    target: Record<string, unknown>,
    methods: readonly string[],
  ): unknown | null {
    for (
      const name
      of methods
    ) {
      const value =
        target[name];

      if (
        typeof value
        !== "function"
      ) {
        continue;
      }

      try {
        const result =
          Reflect.apply(
            value,
            target,
            [],
          );

        if (result) {
          return result;
        }
      }
      catch {
        // Try the next extractor supported by this build.
      }
    }

    return null;
  }

  private readPoint(
    point: PointObject,
    scale: number,
  ): Point3 {
    try {
      return {
        x:
          point.X() * scale,
        y:
          point.Y() * scale,
        z:
          point.Z() * scale,
      };
    }
    finally {
      point.delete?.();
    }
  }

  private construct(
    oc: Record<string, unknown>,
    prefix: string,
    ...argumentSets: readonly unknown[][]
  ): unknown {
    const names =
      Object.keys(
        oc,
      )
        .filter(
          (
            key,
          ) =>
            key.startsWith(
              prefix,
            ),
        )
        .sort();

    for (
      const args
      of argumentSets
    ) {
      for (
        const name
        of names
      ) {
        const constructor =
          oc[name];

        if (
          typeof constructor
          !== "function"
        ) {
          continue;
        }

        try {
          return Reflect.construct(
            constructor,
            [...args],
          );
        }
        catch {
          // Overload mismatch; try the next generated constructor.
        }
      }
    }

    throw new Error(
      `OpenCascade constructor ${prefix}* is unavailable for the requested arguments.`,
    );
  }

  private constructExact(
    oc: Record<string, unknown>,
    name: string,
    args: readonly unknown[],
  ): unknown {
    const constructor =
      oc[name];

    if (
      typeof constructor
      !== "function"
    ) {
      throw new Error(
        `OpenCascade constructor ${name} is unavailable.`,
      );
    }

    return Reflect.construct(
      constructor,
      [...args],
    );
  }

  private callRequired(
    target: Record<string, unknown>,
    names: readonly string[],
    ...args: readonly unknown[]
  ): unknown {
    for (
      const name
      of names
    ) {
      const method =
        target[name];

      if (
        typeof method
        !== "function"
      ) {
        continue;
      }

      try {
        return Reflect.apply(
          method,
          target,
          [...args],
        );
      }
      catch {
        // Overload mismatch.
      }
    }

    throw new Error(
      `OpenCascade method ${names.join("/")} is unavailable.`,
    );
  }

  private callOptional(
    target: object,
    names: readonly string[],
    ...args: readonly unknown[]
  ): void {
    const record =
      target as Record<string, unknown>;

    for (
      const name
      of names
    ) {
      const method =
        record[name];

      if (
        typeof method
        !== "function"
      ) {
        continue;
      }

      try {
        Reflect.apply(
          method,
          target,
          [...args],
        );
        return;
      }
      catch {
        // Try the next overload name.
      }
    }
  }

  private callStatic(
    oc: Record<string, unknown>,
    objectName: string,
    methodNames: readonly string[],
    ...args: readonly unknown[]
  ): unknown {
    const owner =
      oc[objectName] as
        | Record<string, unknown>
        | undefined;

    if (!owner) {
      throw new Error(
        `OpenCascade object ${objectName} is unavailable.`,
      );
    }

    return this.callRequired(
      owner,
      methodNames,
      ...args,
    );
  }

  private disposeMany(
    ...values: readonly unknown[]
  ): void {
    for (
      const value
      of values
    ) {
      if (
        value
        && typeof value
        === "object"
      ) {
        const deletion =
          (value as Deleteable)
            .delete;

        if (
          typeof deletion
          === "function"
        ) {
          try {
            deletion.call(
              value,
            );
          }
          catch {
            // Disposing helper objects is best-effort.
          }
        }
      }
    }
  }
}

function cross(
  a: Vector3,
  b: Vector3,
): Vector3 {
  return {
    x:
      a.y * b.z
      - a.z * b.y,
    y:
      a.z * b.x
      - a.x * b.z,
    z:
      a.x * b.y
      - a.y * b.x,
  };
}

function normalize(
  vector: Vector3,
): Vector3 {
  const length =
    Math.hypot(
      vector.x,
      vector.y,
      vector.z,
    );

  if (
    !Number.isFinite(length)
    || length <= 1e-12
  ) {
    return {
      x: 1,
      y: 0,
      z: 0,
    };
  }

  return {
    x:
      vector.x / length,
    y:
      vector.y / length,
    z:
      vector.z / length,
  };
}
