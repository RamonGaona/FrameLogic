declare module "@sunbox/occt-import-js" {

  export interface OcctTriangulationParams {
    linearUnit:
      | "millimeter"
      | "centimeter"
      | "meter"
      | "inch"
      | "foot";
    linearDeflectionType:
      | "bounding_box_ratio"
      | "absolute_value";
    linearDeflection: number;
    angularDeflection: number;
  }

  export interface OcctArrayAttribute {
    array: number[];
  }

  export interface OcctMesh {
    name: string;
    color?: [number, number, number];
    attributes: {
      position: OcctArrayAttribute;
      normal?: OcctArrayAttribute;
    };
    index: OcctArrayAttribute;
    brep_faces?: Array<{
      first: number;
      last: number;
      color: [number, number, number] | null;
    }>;
  }

  export interface OcctNode {
    name: string;
    meshes: number[];
    children: OcctNode[];
  }

  export interface OcctImportResult {
    success: boolean;
    root: OcctNode;
    meshes: OcctMesh[];
  }

  export interface OcctModule {
    ReadStepFile(
      content: Uint8Array<ArrayBufferLike>,
      params: OcctTriangulationParams | null,
    ): OcctImportResult;
  }

  export default function occtImportJs(
    moduleArg?: Record<string, unknown>,
  ): Promise<OcctModule>;

}
