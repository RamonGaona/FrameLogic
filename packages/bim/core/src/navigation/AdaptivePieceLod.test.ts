import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { adaptiveVisualLevel, projectedBoundsSizePx } from "./AdaptivePieceLod";

describe("adaptive display quality", () => {
  it("uses hysteresis across low, work and detail without jitter", () => {
    expect(adaptiveVisualLevel(45)).toBe("LOW");
    expect(adaptiveVisualLevel(68, "LOW")).toBe("LOW");
    expect(adaptiveVisualLevel(95, "LOW")).toBe("WORK");
    expect(adaptiveVisualLevel(350, "WORK")).toBe("DETAIL");
    expect(adaptiveVisualLevel(275, "DETAIL")).toBe("DETAIL");
    expect(adaptiveVisualLevel(250, "DETAIL")).toBe("WORK");
    expect(adaptiveVisualLevel(45, "DETAIL")).toBe("LOW");
  });
  it("fails open to normal design quality for invalid projections", () => {
    expect(adaptiveVisualLevel(null, "DETAIL")).toBe("WORK");
    expect(adaptiveVisualLevel(NaN, "LOW")).toBe("WORK");
  });
  it("increases projected size on zoom for both camera types", () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const perspective = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    perspective.position.z = 20;
    perspective.lookAt(0, 0, 0);
    perspective.updateMatrixWorld(true);
    const far = projectedBoundsSizePx(box, perspective, 800, 800)!;
    perspective.position.z = 10;
    perspective.updateMatrixWorld(true);
    const near = projectedBoundsSizePx(box, perspective, 800, 800)!;
    expect(near).toBeGreaterThan(far);
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    ortho.position.z = 20;
    ortho.updateMatrixWorld(true);
    ortho.updateProjectionMatrix();
    const farOrtho = projectedBoundsSizePx(box, ortho, 800, 800)!;
    ortho.zoom = 2;
    ortho.updateProjectionMatrix();
    const nearOrtho = projectedBoundsSizePx(box, ortho, 800, 800)!;
    expect(nearOrtho).toBeGreaterThan(farOrtho);
  });
});
