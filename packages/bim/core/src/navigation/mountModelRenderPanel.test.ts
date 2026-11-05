import { describe, expect, it, vi } from "vitest";
import { mountModelRenderPanel } from "./mountModelRenderPanel";

describe("render and visual-quality controls inside isolated piece editing", () => {
  it("mounts Render outside the 3D viewport stacking context", () => {
    const panel = { style: {} } as HTMLElement;
    const body = { appendChild: vi.fn() } as unknown as HTMLElement;
    mountModelRenderPanel(panel, body);
    expect(body.appendChild).toHaveBeenCalledWith(panel);
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.pointerEvents).toBe("auto");
    expect(Number(panel.style.zIndex)).toBeGreaterThan(80);
  });
});
