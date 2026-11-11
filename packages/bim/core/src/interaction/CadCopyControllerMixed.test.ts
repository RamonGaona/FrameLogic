import { afterEach, describe, expect, it, vi } from "vitest";
import { CadCopyController } from "./CadCopyController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

vi.mock("../import/CadReferenceTransformController", () => ({
  getActiveCadReferenceBlockController: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

function fixture(options: {
  pieces?: string[]; lines?: string[]; points?: string[];
  references?: string[];
}) {
  const { pieces = [], lines = [], points = [], references = [] } = options;
  const setStatus = vi.fn();
  const reference = {
    getSelectedReferenceNames: () => references,
    setInteractionEnabled: vi.fn(),
  };
  vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(reference as never);
  const model = {
    pieceInstances: {get: (id: string) => pieces.includes(id) ? {id} : undefined},
    cadLines: {get: (id: string) => lines.includes(id) ? {id} : undefined},
  };
  const controller = Object.assign(Object.create(CadCopyController.prototype) as object, {
    disposed: false, active: false, stage: "SELECT",
    sourceLineIds: [], sourcePieceIds: [], sourcePointIds: [],
    sourceAssemblyIds: [], sourceReferenceNames: [],
    unifiedCopy: false, copyingReferences: null, basePoint: null,
    setStatus,
    options: {
      beforeStart: vi.fn(),
      designModel: model,
      polylines: {findByLineId: () => undefined},
      designSelection: {
        getSelectedIds: () => pieces, setEnabled: vi.fn(),
      },
      lineSelection: {
        getSelectedIds: () => lines, setEnabled: vi.fn(),
      },
      pointSelection: {
        getSelectedIds: () => points, setEnabled: vi.fn(),
      },
      selectedAssemblyIds: () => [],
    },
  }) as CadCopyController;
  return {controller, setStatus, reference};
}
describe("COPYBASE captures ALL simultaneously selected types", () => {
  it("does not discard a native CAD line when a piece 3D is also selected", () => {
    const f = fixture({pieces: ["p3d"], lines: ["lineCAD"]});
    expect(f.controller.start()).toBe(true);
    expect(Reflect.get(f.controller, "unifiedCopy")).toBe(true);
    expect(Reflect.get(f.controller, "sourcePieceIds")).toEqual(["p3d"]);
    expect(Reflect.get(f.controller, "sourceLineIds")).toEqual(["lineCAD"]);
    expect(Reflect.get(f.controller, "sourcePointIds")).toEqual([]);
    expect(Reflect.get(f.controller, "stage")).toBe("BASE");
    expect(f.setStatus).toHaveBeenCalledWith(expect.stringContaining("COPYBASE MIXTO"));
  });

  it("includes whole DWG and loose point in a common COPYBASE session", () => {
    const f = fixture({points: ["pCAD"], references: ["Plano"]});
    expect(f.controller.start()).toBe(true);
    expect(Reflect.get(f.controller, "sourceReferenceNames")).toEqual(["Plano"]);
    expect(Reflect.get(f.controller, "sourcePointIds")).toEqual(["pCAD"]);
    expect(f.reference.setInteractionEnabled).toHaveBeenCalledWith(false);
    expect(Reflect.get(f.controller, "unifiedCopy")).toBe(true);
  });
});
