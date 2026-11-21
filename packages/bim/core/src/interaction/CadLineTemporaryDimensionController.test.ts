import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadLineTemporaryDimensionController, placePreviewLineAngleLabel, placePreviewLineLengthLabel } from "./CadLineTemporaryDimensionController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

vi.mock("../import/CadReferenceTransformController", () => ({
  getActiveCadReferenceBlockController: vi.fn(() => null),
}));

afterEach(() => {
  vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(null);
});

describe("automatic dimensions for read-only DWG line members", () => {
  function setup() {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD Plano · 0", locked: false, visible: true, snapEnabled: true,
    });
    const line = model.registerCadLine({ layerId: layer.id,
      start: { x: 2, y: 3, z: 4 }, end: { x: 5, y: 7, z: 4 } });
    model.layers.update(layer.id, { locked: true });
    const selection = { isEnabled: true, getSelectedIds: vi.fn((): string[] => []) };
    const dimension = Object.create(CadLineTemporaryDimensionController.prototype) as CadLineTemporaryDimensionController;
    Reflect.set(dimension, "isLinePlacementActive", () => false);
    Reflect.set(dimension, "designModel", model);
    Reflect.set(dimension, "lineSelection", selection);
    const segment = () => (Reflect.get(dimension, "getActiveSegment") as Function)
      .call(dimension) as { start: THREE.Vector3; end: THREE.Vector3; source: string } | null;
    return { model, line, selection, segment };
  }

  it("shows an exact 5-unit dimension after clicking an internal line, even though layer is locked", () => {
    const f = setup();
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue({
      getInspectedLineId: () => f.line.id,
    } as unknown as ReturnType<typeof getActiveCadReferenceBlockController>);
    const segment = f.segment();
    expect(segment?.start.distanceTo(segment.end)).toBe(5);
    expect(segment?.source).toBe("SELECTION");
    expect(f.selection.getSelectedIds()).toEqual([]);
  });

  it("keeps ordinary standalone CAD line measurements working", () => {
    const f = setup();
    f.selection.getSelectedIds.mockReturnValue([f.line.id]);
    expect(f.segment()?.start.distanceTo(f.segment()!.end)).toBe(5);
  });
});

describe("LINE preview label visibility", () => {
  it("keeps the label inside the canvas even when zoom moves the endpoint beyond it", () => {
    const area = { left: 50, top: 60, width: 720, height: 450 };
    const label = { width: 110, height: 20 };
    for (const anchor of [
      { x: 200, y: 180 }, { x: -10000, y: 300 },
      { x: 90000, y: 20000 }, { x: 50, y: 60 },
    ]) {
      const p = placePreviewLineLengthLabel(area, anchor, label);
      expect(p.x).toBeGreaterThanOrEqual(60);
      expect(p.x + label.width).toBeLessThanOrEqual(760);
      expect(p.y).toBeGreaterThanOrEqual(104);
      expect(p.y + label.height).toBeLessThanOrEqual(452);
    }
  });

  it("uses the last screen pointer when a projected preview endpoint leaves the camera", () => {
    const dimension = Object.create(CadLineTemporaryDimensionController.prototype);
    const style: Record<string, string> = {};
    const label = { style, offsetWidth: 110, offsetHeight: 20 };
    Reflect.set(dimension, "label", label);
    Reflect.set(dimension, "lastPointer", { x: 275, y: 160 });
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const rect = { left: 50, top: 60, width: 720, height: 450 } as DOMRect;
    const syncLabel = Reflect.get(dimension, "syncLabel") as Function;
    syncLabel.call(dimension, new THREE.Vector3(1_000, 1_000, 0), rect, camera, true);
    const expected = placePreviewLineLengthLabel(rect, { x: 275, y: 160 }, { width: label.offsetWidth, height: label.offsetHeight });
    expect(style.left).toBe(String(expected.x) + "px");
    expect(style.top).toBe(String(expected.y) + "px");
    expect(style.display).toBe("block");
  });
});

describe("LINE angle follows the mobile endpoint", () => {
  it("places the angle by the moving end and switches side near the viewport edge", () => {
    const area = { left: 50, top: 60, width: 720, height: 450 };
    const label = { width: 45, height: 20 };
    const left = placePreviewLineAngleLabel(area, { x: 100, y: 200 }, label);
    expect(left.x).toBe(118);
    expect(left.y).toBe(162);
    const right = placePreviewLineAngleLabel(area, { x: 735, y: 200 }, label);
    expect(right.x).toBe(672);
    expect(right.y).toBe(162);
    for (const anchor of [
      { x: 100, y: 200 }, { x: 735, y: 200 },
      { x: -4000, y: 10000 }, { x: 4000, y: -1000 },
    ]) {
      const p = placePreviewLineAngleLabel(area, anchor, label);
      expect(p.x).toBeGreaterThanOrEqual(60);
      expect(p.x + label.width).toBeLessThanOrEqual(760);
      expect(p.y).toBeGreaterThanOrEqual(104);
      expect(p.y + label.height).toBeLessThanOrEqual(452);
    }
  });

  it("reprojects the moving end with camera changes and falls back to cursor when offscreen", () => {
    const dimension = Object.create(CadLineTemporaryDimensionController.prototype);
    const style: Record<string, string> = {};
    const label = { style, offsetWidth: 45, offsetHeight: 20 };
    Reflect.set(dimension, "angleLabel", label);
    Reflect.set(dimension, "lastPointer", { x: 220, y: 300 });
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const rect = { left: 50, top: 60, width: 720, height: 450 } as DOMRect;
    const place = Reflect.get(dimension, "syncAngleLabel") as Function;
    place.call(dimension, new THREE.Vector3(4, 0, 0), rect, camera);
    const initial = style.left;
    expect(style.display).toBe("block");
    place.call(dimension, new THREE.Vector3(-4, 0, 0), rect, camera);
    expect(style.left).not.toBe(initial);
    // Even if the endpoint exits the camera frustum, the angle remains visible.
    place.call(dimension, new THREE.Vector3(1000, 0, 0), rect, camera);
    const fallback = placePreviewLineAngleLabel(rect, { x: 220, y: 300 },
      { width: label.offsetWidth, height: label.offsetHeight });
    expect(style.left).toBe(String(fallback.x) + "px");
    expect(style.top).toBe(String(fallback.y) + "px");
    expect(style.display).toBe("block");
  });
});

describe("preview distance remains independent from manual entry", () => {
  it("shows the current geometric preview length in the blue label", () => {
    const dimension = Object.create(CadLineTemporaryDimensionController.prototype);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const label = { style: {} as Record<string, string>, textContent: "",
      offsetWidth: 90, offsetHeight: 20 };
    const angleLabel = { style: {} as Record<string, string>, textContent: "" };
    const geometry = new THREE.BufferGeometry();
    const lines = { visible: false };
    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(2_300, 0, 0);
    Reflect.set(dimension, "domElement", {
      isConnected: true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    Reflect.set(dimension, "getActiveSegment", () => ({ start, end, source: "PREVIEW" }));
    Reflect.set(dimension, "cameraProvider", () => camera);
    Reflect.set(dimension, "geometry", geometry);
    Reflect.set(dimension, "dimensionLines", lines);
    Reflect.set(dimension, "label", label);
    Reflect.set(dimension, "angleLabel", angleLabel);
    Reflect.set(dimension, "workPlane", { getState: () => ({ enabled: false }) });

    const movingAngle = vi.fn();
    Reflect.set(dimension, "syncAngleLabel", movingAngle);
    const sync = Reflect.get(dimension, "sync") as Function;
    sync.call(dimension);
    expect(movingAngle).toHaveBeenCalledWith(end, expect.anything(), camera);
    expect(label.textContent).toBe("2.300 mm");
    expect(label.style.display).toBe("block");

    // Changing the provisional geometry changes the label independently of input drafts.
    end.set(1800, 0, 0);
    sync.call(dimension);
    expect(label.textContent).toBe("1.800 mm");
    geometry.dispose();
  });
});
