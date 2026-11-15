import { useState } from "react";
import {
  catalogFieldRows,
  parseCatalogRecordEditor,
  type CatalogPath,
  type CatalogRecord,
  type CatalogValue,
} from "./frameLogicCatalog";

function kindLabel(value: CatalogValue): string {
  if (Array.isArray(value)) return "Lista (" + value.length + " elementos)";
  if (value !== null && typeof value === "object") {
    return "Grupo (" + Object.keys(value).length + " propiedades)";
  }
  if (value === null) return "null";
  return String(value);
}

interface ValueInputProps {
  value: CatalogValue;
  path: CatalogPath;
  onEdit: (path: CatalogPath, value: CatalogValue) => void;
}

function ValueInput({ value, path, onEdit }: ValueInputProps) {
  const label = path.map((part) => String(part)).join(".");
  if (typeof value === "boolean") {
    return (
      <select aria-label={label} className="fl-catalog-value-select"
        value={String(value)}
        onChange={(event) => onEdit(path, event.currentTarget.value === "true")}>
        <option value="true">true</option><option value="false">false</option>
      </select>
    );
  }
  if (value === null) {
    return (
      <select aria-label={label} className="fl-catalog-value-select"
        value="null"
        onChange={(event) => {
          const kind = event.currentTarget.value;
          onEdit(path, kind === "text" ? "" :
            kind === "number" ? 0 : kind === "boolean" ? false : null);
        }}>
        <option value="null">null</option>
        <option value="text">Convertir a texto</option>
        <option value="number">Convertir a número</option>
        <option value="boolean">Convertir a booleano</option>
      </select>
    );
  }
  return (
    <input aria-label={label} className="fl-catalog-cell-input"
      type={typeof value === "number" ? "number" : "text"}
      step={typeof value === "number" ? "any" : undefined}
      value={value as string | number}
      onChange={(event) => {
        const text = event.currentTarget.value;
        onEdit(path, typeof value === "number"
          ? text.trim() === "" ? null : Number(text) : text);
      }} />
  );
}

export interface UniversalCatalogGridProps {
  registros: readonly CatalogRecord[];
  matches: readonly { record: CatalogRecord; index: number }[];
  selectedRow: number | null;
  unlocked: boolean;
  onSelect: (index: number) => void;
  onCellEdit: (index: number, path: CatalogPath, value: CatalogValue) => void;
  onRecordReplace: (index: number, record: CatalogRecord) => void;
}

/** A selected code is expanded vertically into every nested JSON value. */
export function FrameLogicUniversalCatalogGrid({
  registros, matches, selectedRow, unlocked,
  onSelect, onCellEdit, onRecordReplace,
}: UniversalCatalogGridProps) {
  const [jsonEditor, setJsonEditor] = useState<{
    index: number; text: string; error: string;
  } | null>(null);
  const record = selectedRow === null ? undefined : registros[selectedRow];

  const openJsonEditor = () => {
    if (!unlocked || !record || selectedRow === null) return;
    setJsonEditor({ index: selectedRow, text: JSON.stringify(record, null, 2), error: "" });
  };

  const applyJsonEditor = () => {
    if (!unlocked || !jsonEditor) return;
    try {
      const next = parseCatalogRecordEditor(jsonEditor.text);
      onRecordReplace(jsonEditor.index, next);
      setJsonEditor(null);
    } catch (error) {
      setJsonEditor((state) => state
        ? { ...state, error: error instanceof Error ? error.message : String(error) }
        : state);
    }
  };

  return (
    <div className="fl-universal-catalog" data-framelogic-universal-catalog="true">
      <aside className="fl-universal-codes">
        <div className="fl-universal-title">Códigos ({registros.length})</div>
        <div className="fl-universal-code-list" role="listbox" aria-label="Códigos del catálogo">
          {matches.map(({ record: item, index }) => (
            <button key={index} type="button" role="option"
              aria-selected={index === selectedRow}
              className={index === selectedRow ? "is-selected" : ""}
              onClick={() => { onSelect(index); setJsonEditor(null); }}>
              <span className="fl-universal-code-number">{index + 1}</span>
              <span>{item.codigo}</span>
            </button>
          ))}
          {!matches.length && <p className="fl-catalog-empty-cell">
            {registros.length ? "Sin resultados" : "Catálogo sin códigos"}
          </p>}
        </div>
      </aside>
      <section className="fl-universal-values" aria-label="Propiedades del código">
        <div className="fl-universal-values-header">
          <strong>{record ? "Código: " + record.codigo : "Selecciona un código"}</strong>
          {unlocked && record && <button type="button" onClick={openJsonEditor}>
            Editar estructura JSON
          </button>}
        </div>
        {record ? (
          <div className="fl-universal-values-scroll">
            <table className="fl-catalog-table fl-catalog-excel fl-universal-field-table">
              <thead><tr>
                <th>Subdivisión / propiedad</th>
                <th>Valor</th>
              </tr></thead>
              <tbody>
                {catalogFieldRows(record).map((row) => (
                  <tr key={JSON.stringify(row.path)}
                    className={row.kind !== "value" ? "fl-universal-group-row" : ""}>
                    <td title={row.path.map(String).join(".")}>
                      <span className="fl-universal-field-name"
                        style={{ paddingLeft: 9 + row.depth * 17 }}>
                        {row.depth > 0 ? "↳ " : ""}
                        {row.label}
                      </span>
                    </td>
                    <td>
                      {row.kind !== "value"
                        ? <span className="fl-universal-group-label">{kindLabel(row.value)}</span>
                        : unlocked
                          ? <ValueInput value={row.value} path={row.path}
                            onEdit={(path, next) => onCellEdit(selectedRow!, path, next)} />
                          : <span className="fl-catalog-cell-text">
                            {kindLabel(row.value)}
                          </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="fl-universal-empty">Selecciona un código para consultar sus subdivisiones.</p>}
        {unlocked && jsonEditor && jsonEditor.index === selectedRow && (
          <div className="fl-universal-json-editor">
            <strong>Editar estructura completa del código</strong>
            <p>Admite añadir, renombrar y eliminar propiedades, grupos y listas
              de cualquier profundidad. Mantén el campo «codigo».</p>
            <textarea
              aria-label="JSON completo del registro seleccionado"
              spellCheck={false} rows={11}
              value={jsonEditor.text}
              onChange={(event) =>
                setJsonEditor({ ...jsonEditor, text: event.currentTarget.value, error: "" })} />
            {jsonEditor.error && <p role="alert" className="fl-universal-json-error">{jsonEditor.error}</p>}
            <div className="fl-universal-json-buttons">
              <button type="button" onClick={() => setJsonEditor(null)}>Cancelar</button>
              <button type="button" onClick={applyJsonEditor}>Aplicar estructura</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
