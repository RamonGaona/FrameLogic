import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadCopyController } from "./CadCopyController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

vi.mock("../import/CadReferenceTransformController", () => ({
  getActiveCadReferenceBlockController: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

describe("COPYBASE for an imported DWG/DXF block", () => {
  it("captures preselected reference, disables its gizmo during base/destination and copies entire block", () => {
    const copyReferencesByBase = vi.fn(() => ({ referenceNames: ["Planta copia 1"] }));
    const setInteractionEnabled = vi.fn();
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue({
      getSelectedReferenceNames: () => ["Planta"],
      setInteractionEnabled,
      copyReferencesByBase,
    } as never);
    const setEnabledLines = vi.fn(), setEnabledPoints = vi.fn(), setEnabledDesign = vi.fn();
    const setStatus = vi.fn();
    const beforeStart = vi.fn();
    const clearCache = vi.fn();
    const controller = Object.assign(
      Object.create(CadCopyController.prototype) as object,
      {
        active: false,
        stage: "SELECT",
        disposed: false,
        sourceLineIds: [],
        sourcePieceIds: [],
        sourceAssemblyIds: [],
        sourceReferenceNames: [],
        copyingReferences: null,
        basePoint: null,
        status: { style: { display: "none" } },
        setStatus,
        options: {
          beforeStart,
          pointSelection: { setEnabled: setEnabledPoints, getSelectedIds: () => [] },
          lineSelection: { setEnabled: setEnabledLines, getSelectedIds: () => [] },
          designSelection: { setEnabled: setEnabledDesign, getSelectedIds: () => [] },
          clearGeometryQueryCache: clearCache,
        },
      },
    ) as unknown as {
      start(): boolean;
      commitCopy(delta: THREE.Vector3): void;
      readonly isActive: boolean;
    };
    expect(controller.start()).toBe(true);
    expect(beforeStart).toHaveBeenCalledOnce();
    expect(setInteractionEnabled).toHaveBeenCalledWith(false);
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining("COPYBASE DWG/DXF"));
    const delta = new THREE.Vector3(100, 30, -10);
    controller.commitCopy(delta);
    expect(copyReferencesByBase).toHaveBeenCalledWith(["Planta"], delta);
    expect(setInteractionEnabled).toHaveBeenCalledWith(true);
    expect(setStatus).toHaveBeenLastCalledWith(
      expect.stringContaining("Planta copia 1"), 2000,
    );
    expect(clearCache).toHaveBeenCalledOnce();
    expect(controller.isActive).toBe(false);
  });

  it("leaves the copy command active and does not switch reference selection on copy failure", () => {
    const copyReferencesByBase = vi.fn(() => { throw new Error("Sin geometría"); });
    const setStatus = vi.fn();
    const controller = Object.assign(
      Object.create(CadCopyController.prototype) as object,
      {
        active: true,
        sourceReferenceNames: ["Planta"],
        copyingReferences: { copyReferencesByBase },
        setStatus,
      },
    ) as unknown as {commitCopy(delta: THREE.Vector3): void; readonly isActive: boolean};
    controller.commitCopy(new THREE.Vector3(10, 0, 0));
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining("Sin geometría"));
    expect(controller.isActive).toBe(true);
  });
});
