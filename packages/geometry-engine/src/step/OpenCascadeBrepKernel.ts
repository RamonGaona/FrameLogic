import initOpenCascade from "opencascade.js";

import type {
  TopAbs_ShapeEnum,
  TopoDS_Shape,
} from "opencascade.js";

import type {
  Point3,
} from "../types/Point3";

import type {
  Vector3,
} from "../types/Vector3";


type OpenCascadeInstance =
  Awaited<
    ReturnType<
      typeof initOpenCascade
    >
  >;


export type BrepCurveKind =
  | "LINE"
  | "CIRCLE"
  | "OTHER";


export interface BrepExactCircle {
  readonly center: Point3;
  readonly normal: Vector3;
  readonly radius: number;
}


export interface BrepExactVertex {
  readonly id: string;
  readonly point: Point3;
}


export interface BrepExactEdge {
  readonly id: string;
  readonly kind: BrepCurveKind;
  readonly start?: Point3;
  readonly end?: Point3;
  readonly midpoint?: Point3;
  readonly circle?: BrepExactCircle;
}


export interface BrepExactCylinder {
  readonly id: string;
  readonly axisOrigin: Point3;
  readonly axisDirection: Vector3;
  readonly radius: number;
}


export interface BrepExactPlane {
  readonly id: string;
  readonly origin: Point3;
  readonly normal: Vector3;
}


export interface OpenCascadeBrepSnapshot {
  readonly id: string;
  readonly sourceFileName: string;
  readonly modelScale: number;
  readonly vertices: readonly BrepExactVertex[];
  readonly edges: readonly BrepExactEdge[];
  readonly cylinders: readonly BrepExactCylinder[];
  readonly planes: readonly BrepExactPlane[];
}


interface RuntimeDocument {
  readonly id: string;
  readonly sourceFileName: string;
  readonly shape: TopoDS_Shape;
  modelScale: number;
  readonly vertices: BrepExactVertex[];
  readonly edges: BrepExactEdge[];
  readonly cylinders: BrepExactCylinder[];
  readonly planes: BrepExactPlane[];
}


interface SurfaceExtraction {
  readonly cylinders: BrepExactCylinder[];
  readonly planes: BrepExactPlane[];
}


let sharedKernel:
  OpenCascadeBrepKernel
  | null =
    null;


function asShapeEnum(
  value: unknown,
): TopAbs_ShapeEnum {
  return value as TopAbs_ShapeEnum;
}


function yieldToBrowser(): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(resolve, 0);
    },
  );
}


/**
 * Autoridad geométrica STEP de FrameLogic.
 *
 * Mantiene el TopoDS_Shape vivo en WASM mientras el documento siga cargado.
 * Las consultas de interacción no recorren OCCT en cada pointermove: durante
 * la carga se indexan vértices, aristas analíticas y superficies exactas.
 *
 * El indexado cede brevemente entre familias geométricas para evitar bloquear
 * la UI durante toda la carga de una pieza compleja. Planos y cilindros se
 * extraen ahora en una sola pasada por las caras.
 */
export class OpenCascadeBrepKernel {
  private ocPromise:
    Promise<OpenCascadeInstance>
    | null =
      null;

  private readonly documents =
    new Map<
      string,
      RuntimeDocument
    >();


  async loadStep(
    data: Uint8Array,
    sourceFileName: string,
  ): Promise<OpenCascadeBrepSnapshot> {
    const oc =
      await this.getOpenCascade();
    const id =
      crypto.randomUUID();
    const filePath =
      `/framelogic-${id}.step`;

    oc.FS.writeFile(
      filePath,
      data,
    );

    const reader =
      new oc.STEPControl_Reader_1();

    try {
      const status =
        reader.ReadFile(
          filePath,
        );

      if (
        status
        !== oc.IFSelect_ReturnStatus
          .IFSelect_RetDone
      ) {
        throw new Error(
          `OpenCascade no pudo leer el STEP "${sourceFileName}".`,
        );
      }

      const progress =
        new oc.Message_ProgressRange_1();
      const transferred =
        reader.TransferRoots(
          progress,
        );
      progress.delete();

      if (
        transferred < 1
      ) {
        throw new Error(
          `OpenCascade no pudo transferir la geometría B-Rep de "${sourceFileName}".`,
        );
      }

      const shape =
        reader.OneShape();

      if (
        shape.IsNull()
      ) {
        shape.delete();
        throw new Error(
          `El STEP "${sourceFileName}" no produjo un TopoDS_Shape válido.`,
        );
      }

      try {
        const vertices =
          this.extractVertices(
            oc,
            shape,
          );

        await yieldToBrowser();

        const edges =
          this.extractEdges(
            oc,
            shape,
          );

        await yieldToBrowser();

        const surfaces =
          this.extractSurfaces(
            oc,
            shape,
          );

        const runtime:
          RuntimeDocument = {
            id,
            sourceFileName,
            shape,
            modelScale:
              1,
            vertices,
            edges,
            cylinders:
              surfaces.cylinders,
            planes:
              surfaces.planes,
          };

        this.documents.set(
          id,
          runtime,
        );

        return this.snapshot(
          runtime,
        );
      }
      catch (
        error
      ) {
        shape.delete();
        throw error;
      }
    }
    finally {
      reader.delete();

      try {
        oc.FS.unlink(
          filePath,
        );
      }
      catch {
        // El archivo temporal puede haber sido retirado por Emscripten.
      }
    }
  }


  getDocument(
    id: string,
  ):
    OpenCascadeBrepSnapshot
    | undefined {
    const document =
      this.documents.get(
        id,
      );

    return document
      ? this.snapshot(
          document,
        )
      : undefined;
  }


  setModelScale(
    id: string,
    scale: number,
  ): boolean {
    const document =
      this.documents.get(
        id,
      );

    if (
      !document
      || !Number.isFinite(
        scale,
      )
      || scale <= 0
    ) {
      return false;
    }

    document.modelScale =
      scale;

    return true;
  }


  disposeDocument(
    id: string,
  ): boolean {
    const document =
      this.documents.get(
        id,
      );

    if (!document) {
      return false;
    }

    this.documents.delete(
      id,
    );
    document.shape.delete();

    return true;
  }


  dispose(): void {
    for (
      const id
      of Array.from(
        this.documents.keys(),
      )
    ) {
      this.disposeDocument(
        id,
      );
    }
  }


  private getOpenCascade():
    Promise<OpenCascadeInstance> {
    this.ocPromise ??=
      initOpenCascade();

    return this.ocPromise;
  }


  private extractVertices(
    oc: OpenCascadeInstance,
    shape: TopoDS_Shape,
  ): BrepExactVertex[] {
    const vertices:
      BrepExactVertex[] = [];
    const explorer =
      new oc.TopExp_Explorer_2(
        shape,
        asShapeEnum(
          oc.TopAbs_ShapeEnum
            .TopAbs_VERTEX,
        ),
        asShapeEnum(
          oc.TopAbs_ShapeEnum
            .TopAbs_SHAPE,
        ),
      );
    let index =
      0;

    try {
      while (
        explorer.More()
      ) {
        const vertex =
          oc.TopoDS.Vertex_1(
            explorer.Current(),
          );
        const point =
          oc.BRep_Tool.Pnt(
            vertex,
          );

        vertices.push({
          id:
            `vertex-${index}`,
          point:
            point3(
              point,
            ),
        });

        point.delete();
        vertex.delete();
        explorer.Next();
        index += 1;
      }
    }
    finally {
      explorer.delete();
    }

    return vertices;
  }


  private extractEdges(
    oc: OpenCascadeInstance,
    shape: TopoDS_Shape,
  ): BrepExactEdge[] {
    const edges:
      BrepExactEdge[] = [];
    const explorer =
      new oc.TopExp_Explorer_2(
        shape,
        asShapeEnum(
          oc.TopAbs_ShapeEnum
            .TopAbs_EDGE,
        ),
        asShapeEnum(
          oc.TopAbs_ShapeEnum
            .TopAbs_SHAPE,
        ),
      );
    let index =
      0;

    try {
      while (
        explorer.More()
      ) {
        const edge =
          oc.TopoDS.Edge_1(
            explorer.Current(),
          );
        const adaptor =
          new oc.BRepAdaptor_Curve_2(
            edge,
          );

        try {
          const first =
            adaptor.FirstParameter();
          const last =
            adaptor.LastParameter();
          const finiteRange =
            Number.isFinite(
              first,
            )
            && Number.isFinite(
              last,
            );
          const startPoint =
            finiteRange
              ? adaptor.Value(
                  first,
                )
              : null;
          const endPoint =
            finiteRange
              ? adaptor.Value(
                  last,
                )
              : null;
          const type =
            adaptor.GetType();
          const kind:
            BrepCurveKind =
              type
                === oc.GeomAbs_CurveType
                  .GeomAbs_Line
                ? "LINE"
                : type
                    === oc.GeomAbs_CurveType
                      .GeomAbs_Circle
                  ? "CIRCLE"
                  : "OTHER";
          const midpoint =
            finiteRange
            && (
              kind === "LINE"
              || kind === "CIRCLE"
            )
              ? adaptor.Value(
                  (
                    first
                    + last
                  ) / 2,
                )
              : null;

          let circle:
            BrepExactCircle
            | undefined;

          if (
            kind === "CIRCLE"
          ) {
            const exactCircle =
              adaptor.Circle();
            const center =
              exactCircle.Location();
            const axis =
              exactCircle.Axis();
            const direction =
              axis.Direction();

            circle = {
              center:
                point3(
                  center,
                ),
              normal:
                vector3(
                  direction,
                ),
              radius:
                exactCircle.Radius(),
            };

            direction.delete();
            axis.delete();
            center.delete();
            exactCircle.delete();
          }

          edges.push({
            id:
              `edge-${index}`,
            kind,
            start:
              startPoint
                ? point3(
                    startPoint,
                  )
                : undefined,
            end:
              endPoint
                ? point3(
                    endPoint,
                  )
                : undefined,
            midpoint:
              midpoint
                ? point3(
                    midpoint,
                  )
                : undefined,
            circle,
          });

          startPoint?.delete();
          endPoint?.delete();
          midpoint?.delete();
        }
        finally {
          adaptor.delete();
          edge.delete();
        }

        explorer.Next();
        index += 1;
      }
    }
    finally {
      explorer.delete();
    }

    return edges;
  }


  private extractSurfaces(
    oc: OpenCascadeInstance,
    shape: TopoDS_Shape,
  ): SurfaceExtraction {
    const cylinders:
      BrepExactCylinder[] = [];
    const planes:
      BrepExactPlane[] = [];
    const explorer =
      new oc.TopExp_Explorer_2(
        shape,
        asShapeEnum(
          oc.TopAbs_ShapeEnum
            .TopAbs_FACE,
        ),
        asShapeEnum(
          oc.TopAbs_ShapeEnum
            .TopAbs_SHAPE,
        ),
      );
    let index =
      0;

    try {
      while (
        explorer.More()
      ) {
        const face =
          oc.TopoDS.Face_1(
            explorer.Current(),
          );
        const adaptor =
          new oc.BRepAdaptor_Surface_2(
            face,
            true,
          );

        try {
          const type =
            adaptor.GetType();

          if (
            type
              === oc.GeomAbs_SurfaceType
                .GeomAbs_Cylinder
          ) {
            const cylinder =
              adaptor.Cylinder();
            const axis =
              cylinder.Axis();
            const origin =
              axis.Location();
            const direction =
              axis.Direction();

            cylinders.push({
              id:
                `cylinder-${index}`,
              axisOrigin:
                point3(
                  origin,
                ),
              axisDirection:
                vector3(
                  direction,
                ),
              radius:
                cylinder.Radius(),
            });

            direction.delete();
            origin.delete();
            axis.delete();
            cylinder.delete();
          }
          else if (
            type
              === oc.GeomAbs_SurfaceType
                .GeomAbs_Plane
          ) {
            const plane =
              adaptor.Plane();
            const origin =
              plane.Location();
            const axis =
              plane.Axis();
            const direction =
              axis.Direction();

            planes.push({
              id:
                `plane-${index}`,
              origin:
                point3(
                  origin,
                ),
              normal:
                vector3(
                  direction,
                ),
            });

            direction.delete();
            axis.delete();
            origin.delete();
            plane.delete();
          }
        }
        finally {
          adaptor.delete();
          face.delete();
        }

        explorer.Next();
        index += 1;
      }
    }
    finally {
      explorer.delete();
    }

    return {
      cylinders,
      planes,
    };
  }


  private snapshot(
    document: RuntimeDocument,
  ): OpenCascadeBrepSnapshot {
    return {
      id:
        document.id,
      sourceFileName:
        document.sourceFileName,
      modelScale:
        document.modelScale,
      vertices:
        document.vertices,
      edges:
        document.edges,
      cylinders:
        document.cylinders,
      planes:
        document.planes,
    };
  }
}


export function getOpenCascadeBrepKernel():
  OpenCascadeBrepKernel {
  sharedKernel ??=
    new OpenCascadeBrepKernel();

  return sharedKernel;
}


function point3(
  point: {
    X: () => number;
    Y: () => number;
    Z: () => number;
  },
): Point3 {
  return {
    x:
      point.X(),
    y:
      point.Y(),
    z:
      point.Z(),
  };
}


function vector3(
  vector: {
    X: () => number;
    Y: () => number;
    Z: () => number;
  },
): Vector3 {
  return {
    x:
      vector.X(),
    y:
      vector.Y(),
    z:
      vector.Z(),
  };
}
