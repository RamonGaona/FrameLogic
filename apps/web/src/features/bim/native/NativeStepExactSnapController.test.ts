import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { OpenCascadeBrepSnapshot } from "@framelogic/geometry";
import {
  findNativeExactSnap,
  indexNativeBrepSnapPoints,
} from "./NativeStepExactSnapController";

const point = (x: number, y: number, z: number) => ({ x, y, z });

function sampleSnapshot(): OpenCascadeBrepSnapshot {
  return {
    id: "brep:plate-1",
    sourceFileName: "placa.step",
    modelScale: 10,
    vertices: [{ id: "v1", point: point(1, 0, 0) }],
    edges: [
      { id: "e1", kind: "LINE", start: point(0, -1, 0),
        end: point(0, 1, 0), midpoint: point(0, 0, 0) },
      { id: "e2", kind: "CIRCLE",
        circle: { center: point(-1, 0, 0), normal: point(0, 0, 1), radius: 0.5 } },
    ],
    cylinders: [{ id: "c1", axisOrigin: point(0, 1, 0),
      axisDirection: point(0, 0, 1), radius: 0.5 }],
    planes: [],
  };
}

function camera(): THREE.OrthographicCamera {
  const c = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 1000);
  c.position.set(0, 0, 100);
  c.lookAt(0, 0, 0);
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
  return c;
}

const rect = { left: 10, top: 20, width: 400, height: 400 };

function clientAt(c: THREE.Camera, p: THREE.Vector3) {
  const projected = p.clone().project(c);
  return {
    clientX: rect.left + (projected.x + 1) * rect.width / 2,
    clientY: rect.top + (1 - projected.y) * rect.height / 2,
  };
}

describe("Native exact OpenCascade B-Rep snaps", () => {
  it("indexes exact vertices, edge midpoints, circle centers and cylinder axes in mm", () => {
    const indexed = indexNativeBrepSnapPoints(sampleSnapshot());
    expect(indexed).toHaveLength(4);
    expect(indexed.map((candidate) => candidate.kind))
      .toEqual(["VERTEX", "EDGE_MIDPOINT", "CIRCLE_CENTER", "AXIS_ORIGIN"]);
    expect(indexed[0].point.toArray()).toEqual([10, 0, 0]);
    expect(indexed[2].point.toArray()).toEqual([-10, 0, 0]);
    expect(indexed.every((candidate) => candidate.brepDocumentId === "brep:plate-1"))
      .toBe(true);
  });

  it("uses camera-projected CSS pixels, not triangulated mesh vertices", () => {
    const c = camera();
    const indexed = indexNativeBrepSnapPoints(sampleSnapshot());
    for (const candidate of indexed) {
      const { clientX, clientY } = clientAt(c, candidate.point);
      const hit = findNativeExactSnap(indexed, "brep:plate-1",
        c, clientX, clientY, rect, 10);
      expect(hit?.kind).toBe(candidate.kind);
      expect(hit?.point.distanceTo(candidate.point)).toBe(0);
      expect(hit?.screenDistancePx).toBeLessThan(1e-6);
    }
  });

  it("skips an occluded nearest snap and accepts the next eligible candidate", () => {
    const c = camera();
    const index = indexNativeBrepSnapPoints(sampleSnapshot());
    const hit = clientAt(c, index[0].point);
    const nearest = findNativeExactSnap(index, "brep:plate-1",
      c, hit.clientX, hit.clientY, rect, 150,
      (candidate) => candidate.kind !== "VERTEX");
    expect(nearest).not.toBeNull();
    expect(nearest?.kind).not.toBe("VERTEX");
  });

  it("projects moved exact B-Rep coordinates without mutating the native snapshot", () => {
    const c = camera();
    const points = indexNativeBrepSnapPoints(sampleSnapshot());
    const original = points[0].point.clone();
    const matrix = new THREE.Matrix4().makeTranslation(5, 0, 0);
    const projected = clientAt(c, original.clone().applyMatrix4(matrix));
    const hit = findNativeExactSnap(points, "brep:plate-1", c,
      projected.clientX, projected.clientY, rect, 8,
      (candidate) => candidate.point.x === 15, matrix);
    expect(hit?.point.x).toBe(15);
    expect(points[0].point.toArray()).toEqual([10, 0, 0]);
  });

  it("never uses points from a different STEP source document", () => {
    const c = camera();
    const indexed = indexNativeBrepSnapPoints(sampleSnapshot());
    const { clientX, clientY } = clientAt(c, indexed[0].point);
    expect(findNativeExactSnap(indexed, "other:brep", c,
      clientX, clientY, rect)).toBeNull();
    expect(findNativeExactSnap(indexed, "", c,
      clientX, clientY, rect)).toBeNull();
  });

  it("rejects distant, outside-canvas and clipped points", () => {
    const c = camera();
    const indexed = indexNativeBrepSnapPoints(sampleSnapshot());
    expect(findNativeExactSnap(indexed, "brep:plate-1",
      c, 19, 29, rect, 3)).toBeNull();
    expect(findNativeExactSnap(indexed, "brep:plate-1",
      c, 9, 30, rect)).toBeNull();
    const outside = [{ ...indexed[0], point: new THREE.Vector3(0, 0, 10000) }];
    expect(findNativeExactSnap(outside, "brep:plate-1",
      c, 210, 220, rect)).toBeNull();
  });

  it("handles invalid scale without manufacturing visually derived snaps", () => {
    expect(indexNativeBrepSnapPoints({ ...sampleSnapshot(), modelScale: 0 }))
      .toHaveLength(0);
    expect(indexNativeBrepSnapPoints({ ...sampleSnapshot(), modelScale: Infinity }))
      .toHaveLength(0);
  });
});
