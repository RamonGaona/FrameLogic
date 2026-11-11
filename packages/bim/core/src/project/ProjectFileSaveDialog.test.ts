import { describe, expect, it, vi } from "vitest";
import {
  fileNameToProjectName,
  saveProjectWithDialog,
  type ProjectFileHandle,
  type ProjectSaveDialogHost,
  type ProjectWritableFile,
} from "./ProjectFileSaveDialog";

function fixture(existingSize: number, selectedName = "Estructura-01.flproject") {
  const stream: ProjectWritableFile = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const handle: ProjectFileHandle = {
    name: selectedName,
    getFile: vi.fn(async () => ({ size: existingSize })),
    createWritable: vi.fn(async () => stream),
  };
  const host: ProjectSaveDialogHost = {
    showSaveFilePicker: vi.fn(async () => handle),
    confirm: vi.fn(() => true),
  };
  const createBlob = vi.fn((chosen: string) =>
    new Blob([JSON.stringify({ name: fileNameToProjectName(chosen) })],
      { type: "application/json" }),
  );
  return { host, handle, stream, createBlob };
}

describe("ProjectFileSaveDialog", () => {
  it("opens the native save-as picker with the FrameLogic file type", async () => {
    const f = fixture(0);
    const result = await saveProjectWithDialog(f.host, "FrameLogic Project.flproject", f.createBlob);
    expect(f.host.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: "FrameLogic Project.flproject",
      types: [{
        description: "Proyecto FrameLogic (.flproject)",
        accept: { "application/json": [".flproject"] },
      }],
      excludeAcceptAllOption: true,
    });
    expect(result).toEqual({ status: "saved", fileName: "Estructura-01.flproject" });
    expect(f.host.confirm).not.toHaveBeenCalled();
    expect(f.createBlob).toHaveBeenCalledWith("Estructura-01.flproject");
    expect(f.stream.write).toHaveBeenCalledOnce();
    expect(f.stream.close).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation before replacing a nonempty existing file", async () => {
    const f = fixture(1453, "Proyecto existente.flproject");
    (f.host.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = await saveProjectWithDialog(f.host, "Proyecto existente.flproject", f.createBlob);
    expect(result).toEqual({ status: "cancelled" });
    expect(f.host.confirm).toHaveBeenCalledWith(expect.stringContaining("¿Deseas reemplazarlo?"));
    expect(f.handle.createWritable).not.toHaveBeenCalled();
    expect(f.createBlob).not.toHaveBeenCalled();
    expect(f.stream.write).not.toHaveBeenCalled();
  });

  it("overwrites an existing file only after confirmation", async () => {
    const f = fixture(987);
    expect((await saveProjectWithDialog(f.host, "Estructura-01.flproject", f.createBlob)).status)
      .toBe("saved");
    expect(f.host.confirm).toHaveBeenCalledOnce();
    expect(f.stream.write).toHaveBeenCalledOnce();
    expect(f.stream.close).toHaveBeenCalledOnce();
  });

  it("never saves after cancelling the browser dialog", async () => {
    const f = fixture(0);
    (f.host.showSaveFilePicker as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException("cancelled", "AbortError"),
    );
    expect(await saveProjectWithDialog(f.host, "a.flproject", f.createBlob))
      .toEqual({ status: "cancelled" });
    expect(f.createBlob).not.toHaveBeenCalled();
    expect(f.handle.createWritable).not.toHaveBeenCalled();
  });

  it("returns unsupported without creating project bytes if picker is missing", async () => {
    const f = fixture(0);
    expect(await saveProjectWithDialog({ confirm: vi.fn() }, "a.flproject", f.createBlob))
      .toEqual({ status: "unsupported" });
    expect(f.createBlob).not.toHaveBeenCalled();
  });

  it("preserves a save error and aborts the writable stream", async () => {
    const f = fixture(0);
    (f.stream.write as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Disk full"));
    await expect(saveProjectWithDialog(f.host, "a.flproject", f.createBlob))
      .rejects.toThrow("Disk full");
    expect(f.stream.abort).toHaveBeenCalledOnce();
    expect(f.stream.close).not.toHaveBeenCalled();
  });

  it("keeps a readable project name when a chosen file is renamed", () => {
    expect(fileNameToProjectName("Obra 2026.flproject")).toBe("Obra 2026");
    expect(fileNameToProjectName("ESTRUCTURA.FLPROJECT")).toBe("ESTRUCTURA");
    expect(fileNameToProjectName(".flproject")).toBe("FrameLogic Project");
  });
});
