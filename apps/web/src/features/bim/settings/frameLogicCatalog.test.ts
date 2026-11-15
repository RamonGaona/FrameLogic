import { describe, expect, it } from "vitest";
import {
  blankCatalog,
  CATALOG_DEFAULT_URL,
  createCatalogPasswordVerifier,
  normalizeFrameLogicCatalog,
  catalogFieldRows,
  updateCatalogField,
  parseCatalogRecordEditor,
  makeCatalogRecordWithAllSubdivisions,
  catalogScalarType,
  convertCatalogScalarValue,
  parseCatalogNumericInput,
  type CatalogRecord,
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

  it("allows editing the JSON object to add entirely new subdivisions", () => {
    const newRecord = parseCatalogRecordEditor(JSON.stringify({
      codigo: "X", nuevaDivision: { sub: [true, null, { nombre: "A" }] },
    }));
    expect(newRecord.nuevaDivision).toEqual({ sub: [true, null, { nombre: "A" }] });
    expect(() => parseCatalogRecordEditor('["not an object"]')).toThrow(/objeto/i);
  });

  it("creates a unique new code with the UNION of subdivisions from every record", () => {
    const originals: CatalogRecord[] = [
      {
        codigo: "REC3002",
        descripcion: "Viga REC",
        material: { calidad: "S355", densidad: 7850 },
        geometria: { largo_mm: 3000 },
        procesos: ["Corte", "Soldadura"],
        taladros: [{ diametro: 18, posicion: { x: 22 } }, { diametro: 20 }],
        activo: true,
        tarifa: 12000,
      },
      {
        codigo: "PL-ANCLA-450",
        familia: "Placas",
        material: { acabado: "Galvanizado" },
        geometria: { ancho_mm: 450, espesor_mm: 25 },
        taladros: [{ posicion: { y: -30 }, referencia: "M24" }],
        revisiones: [{ estado: false }],
      },
    ];
    const newRecord = makeCatalogRecordWithAllSubdivisions(originals);
    expect(newRecord).toEqual({
      codigo: "NUEVO_0001",
      descripcion: "",
      material: { calidad: "", densidad: null, acabado: "" },
      geometria: { largo_mm: null, ancho_mm: null, espesor_mm: null },
      procesos: ["", ""],
      taladros: [
        { diametro: null, posicion: { x: null, y: null }, referencia: "" },
        { diametro: null },
      ],
      activo: null,
      tarifa: null,
      familia: "",
      revisiones: [{ estado: null }],
    });
    expect(originals[0]!.material).toEqual({ calidad: "S355", densidad: 7850 });
    expect(JSON.stringify(newRecord)).not.toContain("Galvanizado");
    expect(JSON.stringify(newRecord)).not.toContain("Corte");
    expect(JSON.stringify(newRecord)).not.toContain("12000");
    const saved = serializeFrameLogicCatalog({
      version: 1, registros: [...originals, newRecord],
    });
    expect(parseFrameLogicCatalog(saved).registros[2]).toEqual(newRecord);
  });

  it("avoids existing codes even when upper/lower-case differs", () => {
    const records: CatalogRecord[] = [
      { codigo: "nuevo_0001", propiedades: { anclajes: [{ diametro: 12 }] } },
      { codigo: "NUEVO_0002", propiedades: { calculo: { kN: 500 } } },
    ];
    expect(makeCatalogRecordWithAllSubdivisions(records).codigo).toBe("NUEVO_0003");
  });

  it("supports an empty catalog and contradicting field types without inventing values", () => {
    expect(makeCatalogRecordWithAllSubdivisions([])).toEqual({ codigo: "NUEVO_0001" });
    const records: CatalogRecord[] = [
      { codigo: "A", configuracion: "manual", limites: 5 },
      { codigo: "B", configuracion: { carga: { maxima_kN: 1400 } }, limites: false },
    ];
    const fresh = makeCatalogRecordWithAllSubdivisions(records);
    expect(fresh.configuracion).toEqual({ carga: { maxima_kN: null } });
    expect(fresh.limites).toBeNull();
  });

  it("creates repeated codes without losing any prior catalog records", () => {
    const first = { codigo: "A1", subdivision: { interno: { diametro: 90 } } };
    const next = makeCatalogRecordWithAllSubdivisions([first]);
    const following = makeCatalogRecordWithAllSubdivisions([first, next]);
    expect(following.codigo).toBe("NUEVO_0002");
    expect(following.subdivision).toEqual({ interno: { diametro: null } });
    const saved = parseFrameLogicCatalog(
      serializeFrameLogicCatalog({ version: 1, registros: [first, next, following] }),
    );
    expect(saved.registros[0]).toEqual(first);
    expect(saved.registros).toHaveLength(3);
  });

  it("converts an accidentally entered numeric string back to a JSON number", () => {
    expect(catalogScalarType("125.5")).toBe("text");
    expect(catalogScalarType(125.5)).toBe("number");
    expect(catalogScalarType(null)).toBe("null");
    expect(catalogScalarType(false)).toBe("boolean");
    expect(convertCatalogScalarValue("125.5", "number")).toBe(125.5);
    expect(convertCatalogScalarValue("-2,75", "number")).toBe(-2.75);
    expect(convertCatalogScalarValue(125.5, "text")).toBe("125.5");
    expect(convertCatalogScalarValue("0", "number")).toBe(0);
    expect(convertCatalogScalarValue("", "number")).toBeNull();
  });

  it("never converts arbitrary text into zero or silently loses values", () => {
    expect(() => convertCatalogScalarValue("texto equivocado", "number")).toThrow(/número válido/);
    expect(() => parseCatalogNumericInput("12kg")).toThrow(/número válido/);
    expect(() => parseCatalogNumericInput("1,2,3")).toThrow(/número válido/);
    expect(() => parseCatalogNumericInput("Infinity")).toThrow(/número válido/);
    expect(() => parseCatalogNumericInput("1e999")).toThrow(/intervalo/);
    expect(parseCatalogNumericInput("")).toBeNull();
    expect(parseCatalogNumericInput("   ")).toBeNull();
    expect(parseCatalogNumericInput("-0.125")).toBe(-0.125);
    expect(parseCatalogNumericInput("2e3")).toBe(2000);
    expect(parseCatalogNumericInput("0")).toBe(0);
  });

  it("converts scalar values without damaging sibling properties or code", () => {
    const source = {
      codigo: "REC3002", fabricacion: { peso_estimado_kg: "140.25", tratamiento: "Lacado" },
      piezas: [{ distancia: 125 }],
    };
    const next = updateCatalogField(source, ["fabricacion", "peso_estimado_kg"],
      convertCatalogScalarValue(source.fabricacion.peso_estimado_kg, "number"));
    expect(next.fabricacion).toEqual({ peso_estimado_kg: 140.25, tratamiento: "Lacado" });
    expect(source.fabricacion.peso_estimado_kg).toBe("140.25");
    expect(next.codigo).toBe("REC3002");
    expect(parseFrameLogicCatalog(serializeFrameLogicCatalog({
      version: 1, registros: [next],
    })).registros[0]).toEqual(next);
  });

  it("maintains JSON boolean and null semantics through type changes", () => {
    expect(convertCatalogScalarValue(null, "number")).toBeNull();
    expect(convertCatalogScalarValue(null, "text")).toBe("");
    expect(convertCatalogScalarValue("true", "boolean")).toBe(true);
    expect(convertCatalogScalarValue("false", "boolean")).toBe(false);
    expect(() => convertCatalogScalarValue("otro", "boolean")).toThrow(/booleano/);
    expect(convertCatalogScalarValue(true, "number")).toBe(1);
    expect(convertCatalogScalarValue(-3, "null")).toBeNull();
  });

});
