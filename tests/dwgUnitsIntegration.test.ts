import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Protect the single-factor import path against regressions where the
 * converted DXF INSUNITS override an explicitly selected 'mm' choice.
 */
describe("DWG import unit integration", () => {
  it("uses the selected factor for both opening and recovery, including text anchors", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../packages/bim/core/src/import/CadReferenceImportController.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("await chooseCadImportUnits(parsed, file.name)");
    expect(source).toContain("const unitScale = selection.factor");
    expect(source).toContain('selection.unit === "mm" && unitScale !== 1');
    expect(source).toContain("const sourceUnitName =");
    expect(source).not.toContain("this.resolveUnitScale");
    expect(source.match(/scaledPoint\([^,]+, unitScale\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("shows the user a preview before importing and never offers DWG auto units", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../packages/bim/core/src/import/CadImportUnitDialog.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain('select.value = "mm"');
    expect(source).toContain("Factor que se aplicará");
    expect(source).toContain("Extensión resultante");
    expect(source).toContain("INSUNITS");
    expect(source).not.toContain('["auto",');
  });
});
