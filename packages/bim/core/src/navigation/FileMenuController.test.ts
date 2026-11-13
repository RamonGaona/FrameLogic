import { afterEach, describe, expect, it, vi } from "vitest";
import { FILE_MENU_ACTIONS, findFileCommand } from "./FileMenuController";

afterEach(() => vi.unstubAllGlobals());

describe("ARCHIVO menu source actions", () => {
  it("keeps existing file actions, adds Cota beside editable CAD, and retains DWG recovery", () => {
    expect(FILE_MENU_ACTIONS.map((action) => action.id)).toEqual([
      "save-project",
      "open-project",
      "open-cad",
      "open-cad-cota",
      "recover-cad",
      "import-piece",
      "open-piece",
    ]);
  });

  it("locates each original command by stable ID, even outside the menu parent", () => {
    class ButtonMock {}
    vi.stubGlobal("HTMLButtonElement", ButtonMock);
    const importButton = new ButtonMock();
    const querySelector = vi.fn((selector: string) =>
      selector === 'button[data-framelogic-file-command="import-piece"]'
        ? importButton
        : null,
    );
    const fakeDocument = { querySelector } as unknown as Document;
    expect(findFileCommand(fakeDocument, "import-piece")).toBe(importButton);
    expect(findFileCommand(fakeDocument, "open-cad")).toBeNull();
    expect(querySelector).toHaveBeenCalledWith(
      'button[data-framelogic-file-command="import-piece"]',
    );
  });

  it("does not treat a similarly named non-button as an executable action", () => {
    class ButtonMock {}
    vi.stubGlobal("HTMLButtonElement", ButtonMock);
    const fakeDocument = {
      querySelector: () => ({ textContent: "Guardar proyecto" }),
    } as unknown as Document;
    expect(findFileCommand(fakeDocument, "save-project")).toBeNull();
  });
});
