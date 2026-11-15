import { describe, expect, it, vi } from "vitest";
import { writeAuthorizedCatalogFile } from "./catalogFileWriter";
import type { CatalogFileHandle } from "./catalogFileHandleStore";

function mockHandle(original = "antes") {
  const writer = {
    write: vi.fn(async (_text: string) => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const getFile = vi.fn(async () => ({ text: async () => original }) as File);
  const requestPermission = vi.fn(async () => "granted" as const);
  const createWritable = vi.fn(async () => writer);
  const handle: CatalogFileHandle = {
    name: "DBFrameLogic.json", getFile, requestPermission, createWritable,
  };
  return { handle, writer, getFile, requestPermission, createWritable };
}

describe("authorized local JSON persistence", () => {
  it("writes to the selected original only with write permission and unchanged baseline", async () => {
    const h = mockHandle();
    await writeAuthorizedCatalogFile(h.handle, "después", "antes", () => true);
    expect(h.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(h.getFile).toHaveBeenCalledOnce();
    expect(h.writer.write).toHaveBeenCalledWith("después");
    expect(h.writer.close).toHaveBeenCalledOnce();
    expect(h.writer.abort).not.toHaveBeenCalled();
  });

  it("does not even request browser access without editor authorization", async () => {
    const h = mockHandle();
    await expect(writeAuthorizedCatalogFile(h.handle, "x", "antes", () => false))
      .rejects.toThrow(/autorización/);
    expect(h.requestPermission).not.toHaveBeenCalled();
    expect(h.createWritable).not.toHaveBeenCalled();
  });

  it("does not write when browser denies permission", async () => {
    const h = mockHandle();
    h.requestPermission.mockResolvedValueOnce("denied" as never);
    await expect(writeAuthorizedCatalogFile(h.handle, "x", "antes", () => true))
      .rejects.toThrow(/permiso/);
    expect(h.createWritable).not.toHaveBeenCalled();
  });

  it("blocks external concurrent changes before creating a writer", async () => {
    const h = mockHandle("externo");
    await expect(writeAuthorizedCatalogFile(h.handle, "nuevo", "antes", () => true))
      .rejects.toThrow(/cambió fuera/);
    expect(h.createWritable).not.toHaveBeenCalled();
  });

  it("checks the lock again after asynchronous permission was granted", async () => {
    const h = mockHandle();
    let unlocked = true;
    h.requestPermission.mockImplementationOnce(async () => {
      unlocked = false;
      return "granted";
    });
    await expect(writeAuthorizedCatalogFile(h.handle, "x", "antes", () => unlocked))
      .rejects.toThrow(/caducado/);
    expect(h.createWritable).not.toHaveBeenCalled();
  });

  it("aborts a staged write when the lock closes before commit", async () => {
    const h = mockHandle();
    let unlocked = true;
    h.writer.write.mockImplementationOnce(async () => {
      unlocked = false;
    });
    await expect(writeAuthorizedCatalogFile(h.handle, "x", "antes", () => unlocked))
      .rejects.toThrow(/caducado/);
    expect(h.writer.abort).toHaveBeenCalledOnce();
    expect(h.writer.close).not.toHaveBeenCalled();
  });

  it("aborts a write failure instead of indicating the file was saved", async () => {
    const h = mockHandle();
    h.writer.write.mockRejectedValueOnce(new Error("Disco no disponible"));
    await expect(writeAuthorizedCatalogFile(h.handle, "x", "antes", () => true))
      .rejects.toThrow(/Disco no disponible/);
    expect(h.writer.abort).toHaveBeenCalledOnce();
    expect(h.writer.close).not.toHaveBeenCalled();
  });

  it("allows writing a newly chosen file without pretending to update a previous source", async () => {
    const h = mockHandle();
    await writeAuthorizedCatalogFile(h.handle, "nuevo", null, () => true);
    expect(h.getFile).not.toHaveBeenCalled();
    expect(h.writer.close).toHaveBeenCalledOnce();
  });
});
