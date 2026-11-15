import { describe, expect, it } from "vitest";
import {
  blankCatalog,
  CATALOG_DEFAULT_URL,
  createCatalogPasswordVerifier,
  normalizeFrameLogicCatalog,
  parseFrameLogicCatalog,
  resolveCatalogUrl,
  serializeFrameLogicCatalog,
  verifyCatalogPassword,
} from "./frameLogicCatalog";

const baseRecord = {
  codigo: "REC3000",
  nombre: "Perfil rectangular 3000",
  familia: "Perfiles metálicos",
  ruta: "/piezas/REC3000.step",
  peso: 18.5,
  longitud: 3000,
  tarifa: 41500,
};

describe("JSON catalog for FrameLogic parts", () => {
  it("creates a versioned empty file with no default credentials", () => {
    const file = blankCatalog();
    expect(file).toEqual({ version: 1, registros: [] });
    expect(serializeFrameLogicCatalog(file)).toContain('"registros": []');
    expect(CATALOG_DEFAULT_URL).toMatch(/\.json$/);
  });

  it("roundtrips code, name, family, path, weight, length and tariff", () => {
    const input = { version: 1, registros: [baseRecord] };
    const result = parseFrameLogicCatalog(JSON.stringify(input));
    expect(result.registros).toEqual([baseRecord]);
    expect(parseFrameLogicCatalog(serializeFrameLogicCatalog(result))).toEqual(result);
  });

  it("rejects code duplicates without case sensitivity", () => {
    expect(() => normalizeFrameLogicCatalog({
      version: 1,
      registros: [baseRecord, { ...baseRecord, codigo: "rec3000" }],
    })).toThrow(/duplicado/i);
  });

  it("rejects invalid numeric values, empty codes, unsupported versions", () => {
    expect(() => normalizeFrameLogicCatalog({
      version: 1, registros: [{ ...baseRecord, peso: "18.5" }],
    })).toThrow(/peso/i);
    expect(() => normalizeFrameLogicCatalog({
      version: 1, registros: [{ ...baseRecord, longitud: -3 }],
    })).toThrow(/longitud/i);
    expect(() => normalizeFrameLogicCatalog({
      version: 1, registros: [{ ...baseRecord, codigo: " " }],
    })).toThrow(/código/i);
    expect(() => normalizeFrameLogicCatalog({ version: 2, registros: [] }))
      .toThrow(/versión/i);
    expect(() => parseFrameLogicCatalog("{")).toThrow(/JSON válido/);
  });

  it("retains optional numeric fields as null", () => {
    const record = { ...baseRecord, peso: null, longitud: null, tarifa: null };
    const catalog = normalizeFrameLogicCatalog({ version: 1, registros: [record] });
    expect(catalog.registros[0]).toEqual(record);
  });

  it("blocks local paths, credentials, and non-JSON or unsafe remote URLs", () => {
    const base = "https://framelogic-dev.pages.dev/";
    expect(resolveCatalogUrl("/data/catalogo.json", base))
      .toBe("https://framelogic-dev.pages.dev/data/catalogo.json");
    expect(() => resolveCatalogUrl("file:///C:/datos/catalogo.json", base))
      .toThrow(/HTTPS/);
    expect(() => resolveCatalogUrl("https://user:pass@test.com/catalog.json", base))
      .toThrow(/credenciales/);
    expect(() => resolveCatalogUrl("javascript:alert(1)", base))
      .toThrow(/HTTPS/);
    expect(() => resolveCatalogUrl("https://example.org/otra", base))
      .toThrow(/\.json/);
  });

  it("does not include a default password and validates a salted PBKDF2 verifier", async () => {
    const password = "clave-super-segura-2026";
    const verifier = await createCatalogPasswordVerifier(password);
    expect(verifier.algorithm).toBe("PBKDF2-SHA256");
    expect(verifier.iterations).toBeGreaterThanOrEqual(100_000);
    expect(JSON.stringify(verifier)).not.toContain(password);
    expect(await verifyCatalogPassword(password, verifier)).toBe(true);
    expect(await verifyCatalogPassword("incorrecta", verifier)).toBe(false);
    const catalog = normalizeFrameLogicCatalog({
      version: 1, registros: [baseRecord], admin: verifier,
    });
    expect(parseFrameLogicCatalog(serializeFrameLogicCatalog(catalog)).admin).toEqual(verifier);
    await expect(createCatalogPasswordVerifier("short")).rejects.toThrow(/12 caracteres/);
  });
});
