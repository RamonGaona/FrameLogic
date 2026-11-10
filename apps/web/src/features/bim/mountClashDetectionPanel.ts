import * as THREE from "three";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import { ClashDetectionEngine, type ClashRecord, type ClashReviewStatus } from "@framelogic/bim-core";
import { getOrCreateAssistantDock, releaseAssistantDock, syncAssistantDockLayout } from "./assistantDockLayout";
import "./clashDetectionPanel.css";

type Core = Pick<PrecisionBimCoreInstance,
  "designModel" | "designScene" | "designSelection" | "instanceTree" | "precisionCamera" | "world">;
const STATUSES: ClashReviewStatus[] = ["Pendiente", "Revisado", "Aceptado", "Resuelto"];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function csvCell(value: unknown): string {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function download(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountClashDetectionPanel(core: Core): () => void {
  const engine = new ClashDetectionEngine(core.designModel, core.designScene);
  const root = document.createElement("div");
  root.className = "framelogic-clash-root";
  root.innerHTML = `
    <button type="button" class="framelogic-clash-toggle" aria-expanded="false" aria-controls="framelogic-clash-panel">Clash Detection</button>
    <section id="framelogic-clash-panel" class="framelogic-clash-panel" role="dialog" aria-label="Detección de interferencias" hidden>
      <header class="framelogic-clash-header"><div><strong>Clash Detection</strong><small>Diagnóstico geométrico · versión inicial</small></div><button type="button" data-close aria-label="Cerrar">×</button></header>
      <div class="framelogic-clash-scroll">
        <label>Alcance<select data-scope><option value="all">Modelo completo</option><option value="selection">Selección actual</option></select></label>
        <label>Tolerancia / separación mínima (mm)<input data-tolerance type="number" min="0" max="100000" step="0.1" value="1" /></label>
        <div class="framelogic-clash-checks">
          <label><input data-contact type="checkbox" checked /> Contactos</label>
          <label><input data-clearance type="checkbox" checked /> Separación mínima</label>
        </div>
        <div class="framelogic-clash-actions">
          <button data-run type="button">Analizar</button><button data-cancel type="button" disabled>Cancelar</button>
          <button data-clear type="button">Limpiar</button>
        </div>
        <p role="status" data-summary aria-live="polite">Listo para analizar. Los datos son solo de esta sesión.</p>
        <div class="framelogic-clash-filters">
          <input data-search type="search" placeholder="Buscar pieza o código" aria-label="Buscar interferencias" />
          <select data-filter aria-label="Filtrar por tipo"><option value="">Todos los tipos</option><option>HARD</option><option>CONTACT</option><option>CLEARANCE</option><option>UNCONFIRMED</option></select>
          <select data-status-filter aria-label="Filtrar por estado"><option value="">Todos los estados</option>${STATUSES.map(s => `<option>${s}</option>`).join("")}</select>
        </div>
        <div data-results class="framelogic-clash-results"><p>Ejecuta un análisis para ver posibles interferencias.</p></div>
        <div class="framelogic-clash-actions">
          <button data-back type="button">Vista anterior</button>
          <button data-hide type="button">Quitar resaltado</button>
          <button data-csv type="button">CSV</button><button data-json type="button">JSON</button>
        </div>
        <small class="framelogic-clash-disclaimer">HARD solo se confirma si hay vértices interiores en mallas cerradas. CONTACT, CLEARANCE y UNCONFIRMED son aproximaciones. No se calcula volumen ni se ejecutan booleanas B-rep.</small>
      </div>
    </section>`;
  const dock = getOrCreateAssistantDock();
  dock.append(root);
  const toggle = root.querySelector<HTMLButtonElement>(".framelogic-clash-toggle")!;
  const panel = root.querySelector<HTMLElement>(".framelogic-clash-panel")!;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const results = find<HTMLElement>("[data-results]");
  const summary = find<HTMLElement>("[data-summary]");
  const runButton = find<HTMLButtonElement>("[data-run]");
  const cancelButton = find<HTMLButtonElement>("[data-cancel]");
  const scope = find<HTMLSelectElement>("[data-scope]");
  const tolerance = find<HTMLInputElement>("[data-tolerance]");
  const contact = find<HTMLInputElement>("[data-contact]");
  const clearance = find<HTMLInputElement>("[data-clearance]");
  const search = find<HTMLInputElement>("[data-search]");
  const filter = find<HTMLSelectElement>("[data-filter]");
  const statusFilter = find<HTMLSelectElement>("[data-status-filter]");
  const savedStates = new Map<string, ClashReviewStatus>();
  let records: readonly ClashRecord[] = [];
  let scanSignature: string | null = null;
  let previousCamera: { position: THREE.Vector3; target: THREE.Vector3; zoom: number | null } | null = null;
  let controller: AbortController | null = null;
  let disposed = false;
  let activeClash: string | null = null;
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const red = new THREE.MeshBasicMaterial({ color: "#ff3030", side: THREE.DoubleSide });
  const markers: THREE.Object3D[] = [];

  const clearHighlight = () => {
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
    for (const marker of markers) {
      marker.parent?.remove(marker);
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) marker.material.dispose();
      }
    }
    markers.length = 0;
    activeClash = null;
  };

  const clearResults = (message: string) => {
    clearHighlight();
    records = []; scanSignature = null;
    results.replaceChildren();
    results.textContent = "Sin resultados vigentes.";
    summary.textContent = message;
  };

  const isStale = () => scanSignature !== null && engine.signature() !== scanSignature;

  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = records.filter(r => (!filter.value || r.kind === filter.value)
      && (!statusFilter.value || (savedStates.get(r.pairKey) || "Pendiente") === statusFilter.value)
      && (!query || [r.aName, r.bName, r.aCode, r.bCode, r.aAssembly, r.bAssembly]
        .some(s => s.toLocaleLowerCase().includes(query))));
    results.innerHTML = visible.length ? visible.map(r => `
      <div class="framelogic-clash-item">
        <button type="button" data-clash="${escapeHtml(r.id)}" title="Ir a la interferencia">
          <b>${escapeHtml(r.id)}</b> · ${escapeHtml(r.kind)} ${r.confirmed ? "(confirmado)" : "(aproximado)"}
          <span>${escapeHtml(r.aName)} / ${escapeHtml(r.aCode)} ↔ ${escapeHtml(r.bName)} / ${escapeHtml(r.bCode)}</span>
          <small>${escapeHtml(r.aAssembly)} ${r.aAssembly || r.bAssembly ? "↔" : ""} ${escapeHtml(r.bAssembly)}</small>
          ${r.distanceMm === undefined ? "" : `<small>Estimación: ${r.distanceMm.toFixed(3)} mm</small>`}
        </button>
        <select data-review="${escapeHtml(r.pairKey)}" aria-label="Estado de ${escapeHtml(r.id)}">
          ${STATUSES.map(s => `<option ${(savedStates.get(r.pairKey) || "Pendiente") === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>`).join("") : "<p>No hay resultados para los filtros actuales.</p>";
  };

  const focus = (id: string) => {
    if (isStale()) { clearResults("El modelo cambió: resultados invalidados. Ejecuta otro análisis."); return; }
    const clash = records.find(r => r.id === id);
    if (!clash) return;
    const a = core.designScene.getInstanceObject(clash.aId);
    const b = core.designScene.getInstanceObject(clash.bId);
    if (!a || !b) { clearResults("Las instancias cambiaron; vuelve a analizar."); return; }
    clearHighlight();
    const controls = core.world.camera.controls;
    if (!previousCamera) {
      const camera = core.world.camera.three;
      previousCamera = {
        position: controls.getPosition(new THREE.Vector3()).clone(),
        target: controls.getTarget(new THREE.Vector3()).clone(),
        zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : null,
      };
    }
    for (const obj of [a, b]) {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          originals.set(child, child.material);
          child.material = red;
        }
      });
    }
    const boundsA = core.designScene.getInstanceWorldBounds(clash.aId);
    const boundsB = core.designScene.getInstanceWorldBounds(clash.bId);
    const near = new THREE.Box3().setFromCenterAndSize(clash.location,
      new THREE.Vector3(150, 150, 150));
    if (boundsA && boundsB) {
      const whole = boundsA.clone().union(boundsB);
      const radius = Math.max(whole.getSize(new THREE.Vector3()).length() * 0.12, 5);
      near.setFromCenterAndSize(clash.location,
        new THREE.Vector3(radius * 2, radius * 2, radius * 2));
    }
    core.precisionCamera.focusBounds(near, 1.55);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.max(near.getSize(new THREE.Vector3()).length() / 42, 1), 10, 8),
      new THREE.MeshBasicMaterial({ color: "#ffcf44", depthTest: false }));
    marker.position.copy(clash.location);
    core.world.scene.three.add(marker);
    markers.push(marker);
    activeClash = clash.id;
    summary.textContent = clash.id + " · " + clash.explanation + " Resaltado temporal en rojo.";
  };

  const back = () => {
    if (!previousCamera) return;
    const { position: p, target: t, zoom } = previousCamera;
    const controls = core.world.camera.controls;
    void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, true);
    if (zoom !== null) void controls.zoomTo(zoom, true);
    previousCamera = null;
    clearHighlight();
  };

  const selectedPieceIds = (): string[] => {
    const ids = new Set(core.designSelection.getSelectedIds());
    const selectedAssemblies = new Set(core.instanceTree.getSelectedAssemblyIds());
    for (const piece of core.designModel.pieceInstances.getAll()) {
      for (const assembly of core.designModel.assemblies.findByPieceInstanceId(piece.id)) {
        let parent = assembly;
        const visited = new Set<string>();
        while (parent && !visited.has(parent.id)) {
          visited.add(parent.id);
          if (selectedAssemblies.has(parent.id)) ids.add(piece.id);
          const next = parent.parentAssemblyId
            ? core.designModel.assemblies.get(parent.parentAssemblyId) : undefined;
          if (!next) break;
          parent = next;
        }
      }
    }
    return [...ids];
  };

  const execute = async () => {
    if (controller) return;
    const limit = Number(tolerance.value);
    if (!Number.isFinite(limit) || limit < 0 || limit > 100000) {
      summary.textContent = "Tolerancia inválida. Introduce milímetros entre 0 y 100000.";
      return;
    }
    const selection = scope.value === "selection" ? selectedPieceIds() : undefined;
    if (selection && selection.length < 2) {
      summary.textContent = "Selecciona al menos dos piezas o un ensamble con varias piezas.";
      return;
    }
    back();
    clearResults("Preparando análisis...");
    controller = new AbortController();
    const signal = controller.signal;
    runButton.disabled = true;
    cancelButton.disabled = false;
    try {
      const scan = await engine.scan({
        selection, toleranceMm: limit,
        includeContact: contact.checked, includeClearance: clearance.checked,
        signal, onProgress: (done, total) => {
          if (!disposed) summary.textContent = `Analizando candidatos: ${done}/${total}...`;
        },
      });
      if (disposed || signal.aborted) return;
      records = scan.records;
      scanSignature = scan.signature;
      const types = (kind: ClashRecord["kind"]) => records.filter(r => r.kind === kind).length;
      summary.textContent = `${scan.pieces} piezas · ${scan.candidates} parejas candidatas ·
        ${types("HARD")} Hard confirmados · ${types("CONTACT")} contactos posibles ·
        ${types("CLEARANCE")} separaciones estimadas · ${types("UNCONFIRMED")} sin confirmar.`;
      render();
    } catch (error) {
      if (!disposed) clearResults(signal.aborted ? "Análisis cancelado." :
        error instanceof Error ? error.message : String(error));
    } finally {
      controller = null;
      runButton.disabled = false;
      cancelButton.disabled = true;
    }
  };

  const exportRows = () => records.map(r => ({
    id: r.id, instanceA: r.aId, pieceA: r.aName, codeA: r.aCode, assemblyA: r.aAssembly,
    instanceB: r.bId, pieceB: r.bName, codeB: r.bCode, assemblyB: r.bAssembly,
    type: r.kind, confirmed: r.confirmed, status: savedStates.get(r.pairKey) || "Pendiente",
    distanceMm: r.distanceMm ?? null, x: r.location.x, y: r.location.y, z: r.location.z,
    approximateLocation: r.approximateLocation, explanation: r.explanation,
  }));
  const exportResults = (format: "csv" | "json") => {
    if (!records.length || isStale()) {
      if (isStale()) clearResults("El modelo cambió: informe invalidado.");
      else summary.textContent = "No hay interferencias vigentes para exportar.";
      return;
    }
    const rows = exportRows();
    if (format === "json") {
      download("FrameLogic-clashes.json", "application/json", JSON.stringify({
        version: 1, units: "mm", geometry: "detail-mesh", confirmedVolumeAvailable: false, records: rows,
      }, null, 2));
    } else {
      const keys = Object.keys(rows[0]!);
      download("FrameLogic-clashes.csv", "text/csv",
        "\uFEFF" + [keys.map(csvCell).join(";"), ...rows.map(row =>
          keys.map(key => csvCell((row as Record<string, unknown>)[key])).join(";"))].join("\n"));
    }
  };

  runButton.onclick = () => void execute();
  cancelButton.onclick = () => controller?.abort();
  find<HTMLButtonElement>("[data-clear]").onclick = () => {
    controller?.abort(); back(); clearResults("Resultados limpiados."); savedStates.clear();
  };
  find<HTMLButtonElement>("[data-close]").onclick = () => { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); clearHighlight(); };
  find<HTMLButtonElement>("[data-hide]").onclick = clearHighlight;
  find<HTMLButtonElement>("[data-back]").onclick = back;
  find<HTMLButtonElement>("[data-csv]").onclick = () => exportResults("csv");
  find<HTMLButtonElement>("[data-json]").onclick = () => exportResults("json");
  for (const control of [search, filter, statusFilter]) control.addEventListener("input", render);
  results.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-clash]") : null;
    if (button) focus(button.dataset["clash"]!);
  });
  results.addEventListener("change", event => {
    const select = event.target;
    if (select instanceof HTMLSelectElement && select.dataset["review"]) {
      savedStates.set(select.dataset["review"]!, select.value as ClashReviewStatus);
      render();
    }
  });
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) {
      for (const other of document.querySelectorAll<HTMLElement>(".framelogic-chat-panel")) {
        other.hidden = true;
        document.querySelector(".framelogic-chat-toggle")?.setAttribute("aria-expanded", "false");
      }
      syncAssistantDockLayout(dock);
      if (isStale()) clearResults("El modelo cambió: se requiere recalcular.");
    } else clearHighlight();
  };
  root.addEventListener("pointerdown", e => e.stopPropagation());
  root.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { clearHighlight(); panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
  });
  const syncLayout = () => syncAssistantDockLayout(dock);
  syncLayout();
  window.addEventListener("resize", syncLayout);
  const timer = window.setInterval(() => {
    if (disposed) return;
    if (!panel.hidden) syncLayout();
    if (records.length && isStale()) { back(); clearResults("Cambios detectados en el modelo. Reanaliza para actualizar."); }
    if (activeClash && !core.designModel.pieceInstances.get(records.find(r => r.id === activeClash)?.aId || "")) {
      clearHighlight();
    }
  }, 900);
  return () => {
    disposed = true;
    controller?.abort();
    window.clearInterval(timer);
    window.removeEventListener("resize", syncLayout);
    back();
    clearHighlight();
    red.dispose();
    root.remove();
    releaseAssistantDock(dock);
  };
}
