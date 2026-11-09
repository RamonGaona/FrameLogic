import { describe, expect, it } from "vitest";
import { calculateAssistantDockLayout } from "./assistantDockLayout";

describe("chat/MCP responsive dock", () => {
  it("keeps the chat and MCP dock above CAD Render/section controls", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 1280,
      viewportHeight: 740,
      viewCubeBottom: 180,
      reservedTop: [596, 621, 630],
    });
    expect(layout.compact).toBe(false);
    expect(layout.dockTop).toBeGreaterThanOrEqual(190);
    expect(layout.dockTop + layout.panelHeight + 9).toBeLessThanOrEqual(596 - 12);
    expect(layout.panelRight).toBeGreaterThan(70);
  });

  it("keeps the open panel clear of the always-visible version badge", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 1100,
      viewportHeight: 700,
      viewCubeBottom: 170,
      reservedTop: [610, 565],
    });
    expect(layout.panelTop + layout.panelHeight + 9).toBeLessThanOrEqual(565 - 12);
    expect(layout.compact).toBe(false);
  });

  it("uses an intentionally modal sheet when the viewport is too narrow", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 540,
      viewportHeight: 780,
      viewCubeBottom: 170,
      reservedTop: [650],
    });
    expect(layout.compact).toBe(true);
  });

  it("uses the modal sheet when footer controls leave little space", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 1000,
      viewportHeight: 390,
      viewCubeBottom: 164,
      reservedTop: [280],
    });
    expect(layout.compact).toBe(true);
    expect(layout.dockTop).toBeGreaterThanOrEqual(12);
    expect(layout.dockTop + 105).toBeLessThanOrEqual(280 - 12);
  });

  it("moves Chat and MCP to the left of a visible right-side piece panel", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 1280,
      viewportHeight: 740,
      viewCubeBottom: 180,
      reservedTop: [596],
      sidePanel: { left: 984, top: 200, bottom: 540 },
    });
    expect(layout.dockRight).toBeGreaterThan(300);
    expect(layout.panelRight).toBeGreaterThan(layout.dockRight);
    expect(layout.compact).toBe(false);
  });

  it("opens a sheet when the piece panel leaves too little horizontal space", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 755,
      viewportHeight: 740,
      viewCubeBottom: 180,
      reservedTop: [600],
      sidePanel: { left: 459, top: 200, bottom: 530 },
    });
    expect(layout.compact).toBe(true);
    expect(layout.dockRight).toBeGreaterThan(300);
  });

  it("ignores top-bar controls instead of confusing them with the footer", () => {
    const layout = calculateAssistantDockLayout({
      viewportWidth: 1320,
      viewportHeight: 800,
      viewCubeBottom: 190,
      reservedTop: [20, 125, 210],
    });
    expect(layout.compact).toBe(false);
    expect(layout.panelHeight).toBeGreaterThan(400);
  });
});
