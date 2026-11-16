import { describe, expect, it } from "vitest";
import { indexCatalogNames, resolveCatalogName } from "./positionsCatalogNames";
import { parseFrameLogicCatalog } from "./frameLogicCatalog";
import { serializeFlatPositionsFile, type FlatPositionsFile } from "./positionsFlatCatalog";

const db = () => parseFrameLogicCatalog(JSON.stringify({
  version: "1.0.0",
  registros: [
    { codigo: "PEB95400", nombre: "Marco principal 5400", peso: 27 },
    { codigo: "MSX10011", detalles: { NOMBRE: "Gato de ajuste" } },
    { codigo: "MSB20007", nombre: "" },
    { codigo: "PEB93000", descripcion: "Sin campo nombre" },
  ],
}));

describe("Columna Nombre enlazada a DBFrameLogic.json", () => {
  it("resuelve por codigo sin distinguir mayúsculas o espacios", () => {
    const names=indexCatalogNames(db());
    expect(resolveCatalogName(names," peb95400 ")).toEqual({
      label: "Marco principal 5400", state: "resolved",
    });
    expect(resolveCatalogName(names,"MSX10011")).toEqual({
      label: "Gato de ajuste", state: "resolved",
    });
  });
  it("distingue base no cargada, código inexistente y nombre ausente", () => {
    const names=indexCatalogNames(db());
    expect(resolveCatalogName(null,"PEB95400").state).toBe("db-not-loaded");
    expect(resolveCatalogName(names,"INEXISTENTE")).toEqual({
      label: "Código no encontrado", state: "code-not-found",
    });
    expect(resolveCatalogName(names,"MSB20007").state).toBe("name-missing");
    expect(resolveCatalogName(names,"PEB93000").state).toBe("name-missing");
  });
  it("no copia ni añade nombre al JSON de posiciones", () => {
    const file:FlatPositionsFile={
      version: "1.0.0", fecha_modificacion: "", usuario_modificacion: "",
      items: [{posicion:90,codigo:"PEB95400",familias:["Empresa A","MP"]}],
    };
    const names=indexCatalogNames(db());
    expect(resolveCatalogName(names,file.items[0]!.codigo).label).toBe("Marco principal 5400");
    expect(JSON.parse(serializeFlatPositionsFile(file))).toEqual(file);
    expect(serializeFlatPositionsFile(file)).not.toContain("Marco principal 5400");
    expect(serializeFlatPositionsFile(file)).not.toContain('"nombre"');
  });
});
