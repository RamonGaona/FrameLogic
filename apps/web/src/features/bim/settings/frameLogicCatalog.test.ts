import { describe, expect, it } from "vitest";
import {
  blankCatalog,
  CATALOG_DEFAULT_URL,
  createCatalogPasswordVerifier,
  createCatalogRecordFromExisting,
  normalizeFrameLogicCatalog,
  catalogFieldRows,
  updateCatalogField,
  parseCatalogRecordEditor,
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

  it("only requires codigo, and accepts any property type and subdivision", () => {
    const flexible = {
      codigo: "PRUEBA",
      condiciones: { temperatura_c: -3, aprobado: false, nota: "mínimo" },
      valores: [null, 42, "M16", { x: -125, y: 0 }],
    };
    const catalog = normalizeFrameLogicCatalog({ version: 1, registros: [flexible] });
    expect(catalog.registros).toEqual([flexible]);
    expect(() => normalizeFrameLogicCatalog({
      version: 1, registros: [{ codigo: " " }],
    })).toThrow(/codigo/i);
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
  it("preserves unrelated, differently shaped objects for multiple codes", () => {
    const example = {
      version: 1,
      registros: [
        { codigo: "REC3000", geometria: { seccion: { tipo: "RHS", ancho_mm: 120 } },
          procesos: ["Corte", "Taladrado"], material: { aprobado: true } },
        { codigo: "PL-ANCLA-450",
          taladros: [{ diametro_mm: 26, posicion_mm: { x: -55, y: 55 } }],
          precios: { moneda: "EUR", subtotal: 20.5 }, tratamiento: null },
      ],
    };
    const output = parseFrameLogicCatalog(JSON.stringify(example));
    expect(output.registros).toEqual(example.registros);
    expect(parseFrameLogicCatalog(serializeFrameLogicCatalog(output)).registros)
      .toEqual(example.registros);
  });

  it("renders every nested leaf, array position and group path", () => {
    const record = parseCatalogRecordEditor(JSON.stringify({
      codigo: "A1",
      material: { calidad: "S355", propiedades: { densidad: 7850 } },
      agujeros: [{ diametro: 18 }, { diametro: 22 }],
      booleano: false,
      opcional: null,
    }));
    const rows = catalogFieldRows(record);
    const paths = rows.map((row) => row.path.join("."));
    expect(paths).toContain("codigo");
    expect(paths).toContain("material");
    expect(paths).toContain("material.calidad");
    expect(paths).toContain("material.propiedades.densidad");
    expect(paths).toContain("agujeros");
    expect(paths).toContain("agujeros.0.diametro");
    expect(paths).toContain("agujeros.1.diametro");
    expect(paths).toContain("booleano");
    expect(paths).toContain("opcional");
  });

  it("edits a deeply nested property without replacing siblings or changing types", () => {
    const record = parseCatalogRecordEditor(JSON.stringify({
      codigo: "A1", geometria: { x: 1, y: 2 },
      taladros: [{ diametro: 18 }, { diametro: 20 }],
    }));
    const updated = updateCatalogField(record, ["taladros", 1, "diametro"], 24);
    expect(updated.taladros).toEqual([{ diametro: 18 }, { diametro: 24 }]);
    expect(updated.geometria).toEqual({ x: 1, y: 2 });
    expect(record.taladros).toEqual([{ diametro: 18 }, { diametro: 20 }]);
    expect(() => updateCatalogField(record, ["inexistente"], "x"))
      .toThrow(/inexistente/i);
  });

  it("creates a code with the union of every existing subdivision and empty values", () => {
    const records = normalizeFrameLogicCatalog({ version: 1, registros: [
      { codigo: "REC3000", nombre: "Tubo", material: { norma: "S355", densidad: 7850 },
        dimensiones: { largo_mm: 3000 }, conexiones: [{ diametro: 16 }] },
      { codigo: "PL-ANCLA-450", descripcion: "Placa", material: { tratamiento: "Pintura" },
        dimensiones: { espesor_mm: 25 }, conexiones: [{ cantidad: 4, posicion: { x: 10 } },
          { cantidad: 2 }], costo: { moneda: "EUR", valor: 15.5 }, activo: false },
    ] }).registros;
    const generated = createCatalogRecordFromExisting(records, "NUEVA-001");
    expect(generated).toEqual({
      codigo: "NUEVA-001",
      nombre: "",
      material: { norma: "", densidad: null, tratamiento: "" },
      dimensiones: { largo_mm: null, espesor_mm: null },
      conexiones: [
        { diametro: null, cantidad: null, posicion: { x: null } },
        { cantidad: null },
      ],
      descripcion: "",
      costo: { moneda: "", valor: null },
      activo: null,
    });
    // Sources remain unchanged and no actual attributes (e.g. weight) are copied.
    expect(records[0]!.nombre).toBe("Tubo");
    expect(records[1]!.dimensiones).toEqual({ espesor_mm: 25 });
    expect(normalizeFrameLogicCatalog({version: 1, registros: [...records, generated]}).registros)
      .toHaveLength(3);
  });

  it("rejects empty and duplicate new codes and incompatible JSON subdivisions", () => {
    const records = normalizeFrameLogicCatalog({ version: 1, registros: [
      { codigo: "A1", tipo: "X", detalles: { posiciones: [1] } },
      { codigo: "B2", detalles: { posiciones: { frente: 3 } } },
    ] }).registros;
    expect(() => createCatalogRecordFromExisting(records, "")).toThrow(/código/i);
    expect(() => createCatalogRecordFromExisting(records, "a1")).toThrow(/duplicado/i);
    expect(() => createCatalogRecordFromExisting(records, "Nuevo")).toThrow(/incompatible/i);
    expect(createCatalogRecordFromExisting([], "PRIMERO")).toEqual({ codigo: "PRIMERO" });
  });

  it("allows editing the JSON object to add entirely new subdivisions", () => {
    const newRecord = parseCatalogRecordEditor(JSON.stringify({
      codigo: "X", nuevaDivision: { sub: [true, null, { nombre: "A" }] },
    }));
    expect(newRecord.nuevaDivision).toEqual({ sub: [true, null, { nombre: "A" }] });
    expect(() => parseCatalogRecordEditor('["not an object"]')).toThrow(/objeto/i);
  });

});
