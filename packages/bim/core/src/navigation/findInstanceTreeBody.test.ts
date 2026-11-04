import { afterEach, describe, expect, it, vi } from "vitest";
import { findInstanceTreeBody } from "./findInstanceTreeBody";

afterEach(() => vi.unstubAllGlobals());

describe("Instance tree DOM reparenting", () => {
  it("finds INSTANCIAS in the original viewport before layout reparenting", () => {
    const local = { id: "local-tree" } as unknown as HTMLElement;
    const container = { querySelector: vi.fn(() => local) } as unknown as HTMLElement;
    const query = vi.fn();
    vi.stubGlobal("document", { querySelector: query });
    expect(findInstanceTreeBody(container)).toBe(local);
    expect(query).not.toHaveBeenCalled();
  });
  it("finds INSTANCIAS after its parent is moved to the document body", () => {
    const moved = { id: "moved-tree" } as unknown as HTMLElement;
    const container = { querySelector: vi.fn(() => null) } as unknown as HTMLElement;
    const query = vi.fn((selector: string) =>
      selector.startsWith("[data-framelogic-model-space-panel-stack") ? moved : null);
    vi.stubGlobal("document", { querySelector: query });
    expect(findInstanceTreeBody(container)).toBe(moved);
    expect(query).toHaveBeenCalledOnce();
  });
  it("falls back to a legacy body placement and returns null without a tree", () => {
    const legacy = { id: "legacy-tree" } as unknown as HTMLElement;
    const container = { querySelector: vi.fn(() => null) } as unknown as HTMLElement;
    let query = vi.fn((selector: string) =>
      selector === '[data-framelogic-instance-tree-body="true"]' ? legacy : null);
    vi.stubGlobal("document", { querySelector: query });
    expect(findInstanceTreeBody(container)).toBe(legacy);
    query = vi.fn(() => null);
    vi.stubGlobal("document", { querySelector: query });
    expect(findInstanceTreeBody(container)).toBeNull();
  });
});
