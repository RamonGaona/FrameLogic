import { describe, expect, it } from "vitest";
import { getStablePieceColorIdentity } from "./getStablePieceColorIdentity";

describe("stable default color across project open/save", () => {
  it("uses a stable STEP source name instead of regenerated asset UUID", () => {
    const asset = { name: "Mprop_Configurable.STEP", format: "STEP" as const };
    expect(getStablePieceColorIdentity(asset, "uuid-before")).toBe(
      getStablePieceColorIdentity(asset, "uuid-after"),
    );
    expect(getStablePieceColorIdentity(asset, "uuid-after")).toBe("STEP:mprop_configurable.step");
  });
  it("uses content hash before names when available", () => {
    const first = { name: "source.step", format: "STEP" as const, contentHash: "ABC123" };
    const renamed = { ...first, name: "another.step" };
    expect(getStablePieceColorIdentity(first, "id-a")).toBe(
      getStablePieceColorIdentity(renamed, "id-b"),
    );
  });
  it("distinguishes IFC from STEP and falls back for missing assets", () => {
    expect(getStablePieceColorIdentity({ name: "part", format: "IFC" }, "a")).not.toBe(
      getStablePieceColorIdentity({ name: "part", format: "STEP" }, "b"),
    );
    expect(getStablePieceColorIdentity(undefined, "id")).toBe("id");
  });
});
