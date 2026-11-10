import { getOpenCascadeBrepKernel } from "./OpenCascadeBrepKernel";

/** A real 3D intersection has positive B-rep solid volume. Faces/edges alone never qualify. */
export type BooleanClashResult =
  | { readonly kind: "PENETRATION"; readonly volumeMm3: number;
      readonly center: { readonly x: number; readonly y: number; readonly z: number } }
  | { readonly kind: "NO_PENETRATION" }
  | { readonly kind: "UNAVAILABLE"; readonly reason: string };

interface Owned { delete?: () => void }
interface Shape extends Owned { IsNull: () => boolean }
interface BrepDocument { readonly shape: Shape; readonly modelScale: number }
interface BrepRuntime {
  readonly documents: Map<string, BrepDocument>;
  getOpenCascade(): Promise<Record<string, unknown>>;
}
type Constructible = new (...args: any[]) => Owned & Record<string, any>;

function create(oc: Record<string, unknown>, name: string, ...args: unknown[]): Owned & Record<string, any> {
  const Constructor = oc[name] as Constructible | undefined;
  if (typeof Constructor !== "function") throw new Error("Operación OCCT no disponible: " + name);
  return new Constructor(...args);
}
function dispose(owned: Owned[]): void {
  for (let i = owned.length - 1; i >= 0; i--) {
    try { owned[i]?.delete?.(); } catch { /* Avoid masking geometry errors on cleanup. */ }
  }
}

/** Applies each instance's actual world matrix, including STEP-to-model uniform scale. */
function transform(
  oc: Record<string, unknown>, shape: Shape, modelScale: number,
  matrix: readonly number[], owned: Owned[],
): Shape {
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)
    || !Number.isFinite(modelScale) || modelScale <= 0) {
    throw new Error("Matriz o escala B-rep inválida.");
  }
  const x = [matrix[0]!, matrix[1]!, matrix[2]!];
  const y = [matrix[4]!, matrix[5]!, matrix[6]!];
  const z = [matrix[8]!, matrix[9]!, matrix[10]!];
  const lengths = [x, y, z].map(v => Math.hypot(...v));
  const mean = (lengths[0]! + lengths[1]! + lengths[2]!) / 3;
  const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  if (mean < 1e-12 || lengths.some(length => Math.abs(length - mean) > mean * 1e-6)
    || Math.abs(dot(x, y)) > mean * mean * 1e-6
    || Math.abs(dot(x, z)) > mean * mean * 1e-6
    || Math.abs(dot(y, z)) > mean * mean * 1e-6) {
    throw new Error("La instancia tiene deformación o escala no uniforme; la booleana B-rep no es segura.");
  }
  const trsf = create(oc, "gp_Trsf_1");
  owned.push(trsf);
  // Three.js matrices are column-major; OCCT SetValues is row-major 3x4.
  trsf.SetValues(
    matrix[0]! * modelScale, matrix[4]! * modelScale, matrix[8]! * modelScale, matrix[12]!,
    matrix[1]! * modelScale, matrix[5]! * modelScale, matrix[9]! * modelScale, matrix[13]!,
    matrix[2]! * modelScale, matrix[6]! * modelScale, matrix[10]! * modelScale, matrix[14]!,
  );
  const operation = create(oc, "BRepBuilderAPI_Transform_2", shape, trsf, true);
  owned.push(operation);
  if (!operation.IsDone()) throw new Error("La transformación B-rep no pudo completarse.");
  const result = operation.Shape() as Shape;
  owned.push(result);
  if (result.IsNull()) throw new Error("La transformación B-rep devolvió una forma nula.");
  return result;
}

/**
 * Independent OCCT adapter: never mutates the STEP master shapes or the Three.js scene.
 * A positive overlap is reported only when BRepAlgoAPI_Common produces at least
 * one solid and BRepGProp measures its strictly positive volume (mm³).
 * When the kernel cannot certify a result, fail closed instead of inventing a clash.
 */
export class OpenCascadeClashKernel {
  async intersect(
    aDocumentId: string | undefined, bDocumentId: string | undefined,
    matrixA: readonly number[], matrixB: readonly number[],
  ): Promise<BooleanClashResult> {
    if (!aDocumentId || !bDocumentId) {
      return { kind: "UNAVAILABLE", reason: "La pareja no tiene ambos documentos STEP B-rep cargados." };
    }
    const runtime = getOpenCascadeBrepKernel() as unknown as BrepRuntime;
    const a = runtime.documents.get(aDocumentId);
    const b = runtime.documents.get(bDocumentId);
    if (!a || !b) {
      return { kind: "UNAVAILABLE", reason: "El documento B-rep se descargó o no está disponible." };
    }

    const owned: Owned[] = [];
    try {
      const oc = await runtime.getOpenCascade();
      const shapeA = transform(oc, a.shape, a.modelScale, matrixA, owned);
      const shapeB = transform(oc, b.shape, b.modelScale, matrixB, owned);
      const progress = create(oc, "Message_ProgressRange_1");
      owned.push(progress);
      const common = create(oc, "BRepAlgoAPI_Common_3", shapeA, shapeB, progress);
      owned.push(common);
      // Do not increase fuzzy tolerance to the user's threshold: doing so would
      // incorrectly turn touching faces into apparent penetrations.
      common.SetNonDestructive?.(true);
      common.Build(progress);
      if (!common.IsDone() || common.HasErrors?.()) {
        throw new Error("OpenCascade no pudo resolver la intersección.");
      }
      const commonShape = common.Shape() as Shape;
      owned.push(commonShape);
      if (commonShape.IsNull()) return { kind: "NO_PENETRATION" };

      // Boolean Common may return only shared faces/edges; they are NOT clashes.
      const enums = oc["TopAbs_ShapeEnum"] as Record<string, unknown> | undefined;
      if (!enums || enums["TopAbs_SOLID"] === undefined || enums["TopAbs_SHAPE"] === undefined) {
        throw new Error("No se puede verificar que la intersección sea un sólido.");
      }
      const explorer = create(oc, "TopExp_Explorer_2", commonShape,
        enums["TopAbs_SOLID"], enums["TopAbs_SHAPE"]);
      owned.push(explorer);
      if (!explorer.More()) return { kind: "NO_PENETRATION" };

      const validatorClass = oc["BRepCheck_Analyzer"];
      if (typeof validatorClass === "function") {
        const validator = create(oc, "BRepCheck_Analyzer", commonShape, true, false);
        owned.push(validator);
        if (!validator.IsValid_2()) {
          throw new Error("La geometría del volumen común no es válida.");
        }
      }
      const props = create(oc, "GProp_GProps_1");
      owned.push(props);
      const gprop = oc["BRepGProp"] as Record<string, unknown> | undefined;
      const volumeProperties = gprop?.["VolumeProperties_1"] as
        ((shape: Shape, props: unknown, closed: boolean, unique: boolean, mesh: boolean) => void) | undefined;
      if (typeof volumeProperties !== "function") {
        throw new Error("No se dispone del cálculo volumétrico B-rep.");
      }
      volumeProperties(commonShape, props, true, true, false);
      const volumeMm3 = props.Mass() as number;
      if (!Number.isFinite(volumeMm3) || volumeMm3 < 0) {
        throw new Error("El resultado OCCT no tiene un volumen físico válido.");
      }
      if (volumeMm3 <= 1e-9) return { kind: "NO_PENETRATION" };

      const center = props.CentreOfMass() as Owned & {
        X: () => number; Y: () => number; Z: () => number;
      };
      try {
        const coords = { x: center.X(), y: center.Y(), z: center.Z() };
        if (!Object.values(coords).every(Number.isFinite)) {
          throw new Error("El centroide B-rep no es válido.");
        }
        return { kind: "PENETRATION", volumeMm3, center: coords };
      } finally { center.delete?.(); }
    } catch (error) {
      return { kind: "UNAVAILABLE", reason: error instanceof Error ? error.message : String(error) };
    } finally {
      dispose(owned);
    }
  }
}

let sharedClashKernel: OpenCascadeClashKernel | undefined;
export function getOpenCascadeClashKernel(): OpenCascadeClashKernel {
  return sharedClashKernel ??= new OpenCascadeClashKernel();
}
