import { useEffect, useRef, useState, type RefObject } from "react";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import {
  ensureRepositoryStepDemoDefinitions,
  planRepositoryStepDemoFill,
  REPOSITORY_STEP_EXAMPLES,
} from "./repositoryStepDemo";
import { insertLinePositionDemo } from "./linePositionInsertDemo";

export interface LineFillDemoToolProps {
  readonly coreRef: RefObject<PrecisionBimCoreInstance | null>;
  readonly onInstancesChanged: () => void;
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Demonstration only: use the three STEP models shipped in /public/examples.
 * No JSON, browser folder permission, FLPIECE files or catalogue is required.
 */
export function LineFillDemoTool({ coreRef, onInstancesChanged }: LineFillDemoToolProps) {
  const [armed, setArmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const onChangedRef = useRef(onInstancesChanged);
  onChangedRef.current = onInstancesChanged;
  const [status, setStatus] = useState(
    "Ejemplo STEP del repositorio: REC1500 → REC3000 → REC6000. No se leen JSON.",
  );

  function onInsert(): void {
    if (loading) return;
    if (armed) {
      setArmed(false);
      setStatus("Inserción cancelada.");
      return;
    }
    const core = coreRef.current;
    if (!core) {
      setStatus("El motor 3D todavía no está disponible.");
      return;
    }
    if (core.pieceFrameLogicWorkspace.editingInstanceId) {
      setStatus("Vuelve a Model Space antes de insertar las piezas.");
      return;
    }
    core.cancelActiveCadCommand();
    core.cadLineSelection.clearSelection();
    setArmed(true);
    setStatus("Selecciona una línea CAD individual. Esc cancela.");
  }

  useEffect(() => {
    if (!armed) return;
    const core = coreRef.current;
    if (!core) return;
    let stopped = false;
    let consumed = false;
    const unsubscribe = core.cadLineSelection.subscribe((ids) => {
      if (stopped || consumed || ids.length !== 1) return;
      consumed = true;
      const id = ids[0]!;
      queueMicrotask(() => {
        if (stopped) return;
        const line = core.designModel.cadLines.get(id);
        setArmed(false);
        if (!line) {
          setStatus("Selecciona una línea CAD individual válida.");
          return;
        }
        void (async () => {
          setLoading(true);
          try {
            const loaded = await ensureRepositoryStepDemoDefinitions(core, setStatus);
            const plan = planRepositoryStepDemoFill(line, loaded.lengths);
            const info = [
              "DEMO STEP · archivos incluidos en FrameLogic",
              "Orden: " + REPOSITORY_STEP_EXAMPLES.map((piece) => piece.code).join(" → "),
              ...loaded.lengths.map((piece) =>
                piece.code + ": " + piece.lengthMm.toFixed(1) + " mm (medida 3D)"),
              "Línea: " + plan.lineLengthMm.toFixed(1) + " mm",
              "Piezas a insertar: " + plan.segments.length,
              "Ocupación: " + plan.occupiedMm.toFixed(1) + " mm",
              "Resto: " + plan.remainingMm.toFixed(1) + " mm",
              plan.capped ? "Límite de seguridad: 250 piezas." : "",
              "Sin POSITIONS.json ni DBFrameLogic.json.",
              "¿Confirmar inserción?",
            ].filter(Boolean).join("\n");
            if (!window.confirm(info)) {
              setStatus("Inserción cancelada. No se crearon instancias.");
              return;
            }
            const placed = insertLinePositionDemo(core, plan, line.end, {
              requireRealGeometry: true,
            });
            onChangedRef.current();
            setStatus(
              "Insertadas " + placed.realPieces + " piezas STEP del repositorio ("
              + loaded.imported + " modelos cargados; " + loaded.reused
              + " reutilizados). Sin referencias temporales. Resto: "
              + plan.remainingMm.toFixed(1) + " mm.",
            );
          } catch (error) {
            setStatus("No se insertó la secuencia: " + errorText(error));
          } finally {
            setLoading(false);
          }
        })();
      });
    });
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setArmed(false);
      setStatus("Inserción cancelada.");
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      stopped = true;
      unsubscribe();
      window.removeEventListener("keydown", cancelOnEscape);
    };
  }, [armed, coreRef]);

  return (
    <div data-framelogic-line-position-demo="true" style={{
      display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
    }}>
      <button
        type="button"
        onClick={onInsert}
        disabled={loading}
        title="Repite REC1500, REC3000 y REC6000 del repositorio sobre una línea CAD, usando su geometría STEP real y sin leer JSON"
      >
        {armed ? "Cancelar insertar" : loading ? "Cargando STEP..." : "Insertar (demo)"}
      </button>
      <span role="status" style={{
        maxWidth: 470, fontSize: 11, color: "#dbe6ed", lineHeight: 1.3,
      }}>{status}</span>
    </div>
  );
}
