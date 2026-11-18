import { describe, expect, it, vi, afterEach } from "vitest";
import { PieceFrameLogicWorkspaceController } from "./PieceFrameLogicWorkspaceController";

afterEach(() => vi.unstubAllGlobals());

describe("piece editor preparation lifecycle", () => {
  it("returns the docked preparation panel to document.body before removing workspace", () => {
    const controller = Object.create(PieceFrameLogicWorkspaceController.prototype) as PieceFrameLogicWorkspaceController;
    const events: string[] = [];
    const preparationPanel = { id: "prep" } as unknown as HTMLElement;
    const workspace = {
      querySelector: vi.fn(() => preparationPanel),
      remove: vi.fn(() => events.push("remove workspace")),
    };
    const appendChild = vi.fn(() => events.push("release preparation"));
    const removeAttribute = vi.fn();
    vi.stubGlobal("document", {
      documentElement: { removeAttribute },
      body: { appendChild },
    });
    Reflect.set(controller, "workspace", workspace);
    Reflect.set(controller, "actions", {
      stopPreparation: vi.fn(() => events.push("stop preparation")),
    });
    Reflect.set(controller, "selection", { exitIsolation: vi.fn() });
    Reflect.set(controller, "restoreMainUi", vi.fn());
    Reflect.set(controller, "inputs", {});
    Reflect.set(controller, "activeInstanceId", "piece-1");
    Reflect.get(controller, "exitWorkspace").call(controller);

    expect(appendChild).toHaveBeenCalledWith(preparationPanel);
    expect(events.indexOf("release preparation")).toBeLessThan(events.indexOf("remove workspace"));
    expect(removeAttribute).toHaveBeenCalledWith("data-framelogic-piece-workspace-active");
    expect(workspace.remove).toHaveBeenCalledOnce();
  });


  it("starts preparation immediately upon entering the isolated editor, before LINE can draw", () => {
    const controller = Object.create(PieceFrameLogicWorkspaceController.prototype) as PieceFrameLogicWorkspaceController;
    const startPreparation = vi.fn();
    const setIsoView = vi.fn(async () => {});
    const isolateSelection = vi.fn(() => true);
    const buildWorkspace = vi.fn();
    const hideMainUi = vi.fn();
    const setStatus = vi.fn();
    const setAttribute = vi.fn();
    vi.stubGlobal("document", { documentElement: { setAttribute } });
    Reflect.set(controller, "designModel", {
      pieceInstances: { get: () => ({ definitionId: "def-1" }) },
      pieceDefinitions: { get: () => ({ id: "def-1", code: "P", name: "Pieza" }) },
    });
    Reflect.set(controller, "selection", { selectSingle: vi.fn(), isolateSelection });
    Reflect.set(controller, "actions", { startPreparation, setIsoView });
    Reflect.set(controller, "buildWorkspace", buildWorkspace);
    Reflect.set(controller, "hideMainUi", hideMainUi);
    Reflect.set(controller, "setStatus", setStatus);
    Reflect.get(controller, "enterWorkspace").call(controller, "piece-1");
    expect(isolateSelection).toHaveBeenCalledOnce();
    expect(startPreparation).toHaveBeenCalledWith("piece-1");
    expect(buildWorkspace).toHaveBeenCalledOnce();
    expect(setAttribute).toHaveBeenCalledWith("data-framelogic-piece-workspace-active", "true");
  });
});
