import { createOperationDispatcher, type PrecisionBimCoreInstance } from "@framelogic/bim-core";
import { parseLocalChatCommand, type ChatPiece } from "./localChatCommand";
import { resolveChatPieceTarget } from "./localChatPieceTarget";
import "./localChatPanel.css";
import { getOrCreateAssistantDock, releaseAssistantDock, syncAssistantDockLayout } from "./assistantDockLayout";

type Core = Pick<PrecisionBimCoreInstance, "automation" | "designSelection" | "getCadSelectionState" | "subscribeCadSelection">;
type LocalEngine = {
  chat: { completions: { create(input: {
    messages: Array<{ role: "system" | "user"; content: string }>;
    max_tokens: number; temperature: number;
  }): Promise<{ choices: Array<{ message: { content: string | null } }> }> } };
  unload?: () => Promise<void>;
};
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const WEBLLM_CDN = "https://esm.run/@mlc-ai/web-llm@0.2.87";

function getPieces(core: Core): { refs: ChatPiece[]; lines: string[] } {
  const { instances, definitions } = core.automation.listPieces();
  const byId = new Map(definitions.map(d => [d.id, d]));
  const refs = instances.map(p => {
    const d = byId.get(p.definitionId);
    return { id: p.id, name: p.name?.trim() || d?.name || d?.code || "Pieza", code: d?.code || "" };
  });
  const lines = instances.map((p, i) => {
    const d = byId.get(p.definitionId);
    const v = p.transform.position;
    return String(i + 1) + ". " + refs[i]!.name + " | " + p.id
      + " | definición: " + (d?.code || p.definitionId)
      + " | posición: (" + v.x + ", " + v.y + ", " + v.z + ") mm";
  });
  return { refs, lines };
}

/** A browser-local assistant. No external AI API or remote MCP credentials. */
export function mountLocalChatPanel(core: Core): () => void {
  const root = document.createElement("div");
  root.className = "framelogic-chat-root";
  root.innerHTML = [
    '<button class="framelogic-chat-toggle" type="button" aria-expanded="false" aria-controls="framelogic-chat-panel">Chat</button>',
    '<section id="framelogic-chat-panel" class="framelogic-chat-panel" role="dialog" aria-label="Asistente local de FrameLogic" hidden>',
    '<header class="framelogic-chat-header"><div><strong>Asistente FrameLogic</strong><small>Local · sin API de pago</small></div><button data-close type="button" aria-label="Cerrar chat">×</button></header>',
    '<label class="framelogic-chat-piece-picker" for="framelogic-chat-piece">Pieza para comandos<select id="framelogic-chat-piece"><option value="">Usar selección del modelo</option></select><small class="framelogic-chat-selection-status" role="status" aria-live="polite"></small></label>',
    '<div class="framelogic-chat-messages" role="log" aria-live="polite"></div>',
    '<div class="framelogic-chat-tools"><button type="button" data-ai>Activar IA local (descarga opcional)</button>',
    '<small data-ai-status>Comandos directos sin descarga. La IA requiere WebGPU y memoria gráfica; nunca ejecuta cambios.</small></div>',
    '<form class="framelogic-chat-form"><label class="framelogic-chat-label" for="framelogic-chat-input">Instrucción</label>',
    '<div class="framelogic-chat-compose"><input id="framelogic-chat-input" maxlength="500" autocomplete="off" placeholder="Copia esta pieza 4 veces cada 1500 mm en X" required />',
    '<button type="submit">Enviar</button></div></form></section>',
  ].join("");
  const dock = getOrCreateAssistantDock();
  dock.prepend(root);
  const updateDockLayout = () => syncAssistantDockLayout(dock);
  updateDockLayout();
  window.addEventListener("resize", updateDockLayout);
  const layoutTimer = window.setInterval(updateDockLayout, 800);

  const toggle = root.querySelector<HTMLButtonElement>(".framelogic-chat-toggle")!;
  const panel = root.querySelector<HTMLElement>(".framelogic-chat-panel")!;
  const close = root.querySelector<HTMLButtonElement>("[data-close]")!;
  const messages = root.querySelector<HTMLElement>(".framelogic-chat-messages")!;
  const form = root.querySelector<HTMLFormElement>(".framelogic-chat-form")!;
  const field = root.querySelector<HTMLInputElement>("#framelogic-chat-input")!;
  const pieceSelect = root.querySelector<HTMLSelectElement>("#framelogic-chat-piece")!;
  const selectionStatus = root.querySelector<HTMLElement>(".framelogic-chat-selection-status")!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const aiButton = root.querySelector<HTMLButtonElement>("[data-ai]")!;
  const aiStatus = root.querySelector<HTMLElement>("[data-ai-status]")!;
  const dispatch = createOperationDispatcher(core.automation, summary => window.confirm(
    "¿Confirmas el cambio en FrameLogic?\n\n"
    + JSON.stringify(summary, null, 2)
    + "\n\nPuedes deshacerlo desde el historial CAD."
  ));

  let ai: LocalEngine | undefined;
  let loadingAi = false;
  let pendingButton: HTMLButtonElement | undefined;
  let disposed = false;
  let busy = false;
  // A manual picker choice is an explicit override, until the user selects another
  // PieceInstance in the viewport. Empty picker always follows the live CAD selection.
  let manuallyChosenPieceId: string | null = null;
  let lastViewerPieceIds = core.getCadSelectionState().pieceIds.join("\u0000");
  pieceSelect.onchange = () => {
    manuallyChosenPieceId = pieceSelect.value || null;
    updateSelectionStatus();
  };

  function currentTarget() {
    return resolveChatPieceTarget(getPieces(core).refs, core.getCadSelectionState(), manuallyChosenPieceId);
  }

  function updateSelectionStatus(): void {
    const target = currentTarget();
    selectionStatus.textContent = target.status;
    selectionStatus.title = target.issue || target.status;
  }

  function refreshPiecePicker(): void {
    const pieces = getPieces(core).refs;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Usar selección del modelo";
    pieceSelect.replaceChildren(placeholder);
    for (const piece of pieces) {
      const option = document.createElement("option");
      option.value = piece.id;
      option.textContent = piece.name + " · " + piece.id.slice(0, 8);
      pieceSelect.append(option);
    }
    // Never convert an automatic viewport selection into a sticky picker override.
    pieceSelect.value = manuallyChosenPieceId && pieces.some(piece => piece.id === manuallyChosenPieceId)
      ? manuallyChosenPieceId : "";
    updateSelectionStatus();
  }

  const unsubscribeSelection = core.subscribeCadSelection(state => {
    const viewerIds = state.pieceIds.join("\u0000");
    if (viewerIds !== lastViewerPieceIds) {
      lastViewerPieceIds = viewerIds;
      manuallyChosenPieceId = null;
    }
    refreshPiecePicker();
  });

  function appendMessage(role: "user" | "assistant", content: string): void {
    const box = document.createElement("div");
    box.className = "framelogic-chat-message framelogic-chat-message-" + role;
    box.textContent = content;
    messages.append(box);
    messages.scrollTop = messages.scrollHeight;
  }

  function invalidatePreview(): void {
    if (pendingButton) pendingButton.disabled = true;
    pendingButton = undefined;
  }

  const help = [
    "Puedes escribir:",
    "• «Lista las piezas» o «Resumen del modelo».",
    "• «Muestra los ejes de esta pieza» (selecciona una pieza).",
    "• «Copia esta pieza 4 veces cada 1500 mm en X».",
    "• «Mueve esta pieza 200 mm en -Y».",
    "• «Deshacer» y «Rehacer» (con autorización).",
    "Las direcciones son ejes LOCALES; nunca suponemos cuál es el longitudinal.",
    "Siempre se prepara una propuesta antes de modificar el modelo.",
    "Si hay piezas con el mismo nombre, selecciónala en el visor.",
  ].join("\n");

  function showPreview(value: unknown): void {
    const preview = value as { id?: string; operation?: string; sourceId?: string;
      targets?: Array<{ position: { x: number; y: number; z: number } }> };
    if (!preview.id || !Array.isArray(preview.targets)) throw new Error("El motor no devolvió una propuesta válida.");
    invalidatePreview();
    appendMessage("assistant", "Propuesta preparada (sin cambios):\n"
      + "Operación: " + preview.operation + "\nOrigen: " + preview.sourceId + "\n"
      + preview.targets.map((t, i) => String(i + 1) + ". ("
        + t.position.x.toFixed(2) + ", " + t.position.y.toFixed(2) + ", "
        + t.position.z.toFixed(2) + ") mm").join("\n")
      + "\nCaduca en 2 minutos. Revisa las posiciones.");
    const actions = document.createElement("div");
    actions.className = "framelogic-chat-preview-actions";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Revisar y aplicar";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    actions.append(apply, cancel);
    messages.append(actions);
    messages.scrollTop = messages.scrollHeight;
    pendingButton = apply;
    cancel.onclick = () => {
      invalidatePreview();
      actions.remove();
      appendMessage("assistant", "Propuesta descartada; no hubo cambios.");
    };
    apply.onclick = async () => {
      if (disposed || apply.disabled) return;
      apply.disabled = true;
      cancel.disabled = true;
      try {
        const answer = await dispatch("confirm_operation", { proposalId: preview.id! });
        if (!answer.ok) throw new Error(answer.error || "No se pudo aplicar");
        appendMessage("assistant", "Cambio aplicado con aprobación. Instancias afectadas:\n"
          + JSON.stringify(answer.data?.affectedIds ?? [], null, 2)
          + "\nPuedes escribir «deshacer».");
      } catch (error) {
        appendMessage("assistant", "La propuesta no se aplicó: " + String(error instanceof Error ? error.message : error));
      } finally {
        invalidatePreview();
        actions.remove();
      }
    };
  }

  async function answerWithAi(question: string): Promise<void> {
    if (!ai) {
      appendMessage("assistant", "Escribe «ayuda» para ver los comandos o activa la IA local para preguntas libres.");
      return;
    }
    // The model sees only a small read-only snapshot; AI text never becomes executable CAD instructions.
    const snapshot = getPieces(core).lines.slice(0, 40).join("\n");
    const info = core.automation.getModelInfo();
    const answer = await ai.chat.completions.create({
      messages: [
        { role: "system", content: "Eres un asistente de FrameLogic CAD. Responde brevemente en español. NO tienes acceso a herramientas y NO puedes modificar el modelo. Para copiar o mover, recomienda comandos con dirección explícita, cantidad y mm. Datos actuales (solo lectura): " + info.instances + " instancias, " + info.definitions + " definiciones, unidades mm.\n" + snapshot },
        { role: "user", content: question },
      ],
      max_tokens: 300,
      temperature: 0.2,
    });
    appendMessage("assistant", answer.choices[0]?.message.content?.trim() || "La IA no generó una respuesta.");
  }

  async function handleCommand(input: string): Promise<void> {
    const { refs, lines } = getPieces(core);
    refreshPiecePicker();
    const target = currentTarget();
    const command = parseLocalChatCommand(input, refs, target.ids);
    switch (command.kind) {
      case "help": appendMessage("assistant", help); return;
      case "list":
        appendMessage("assistant", lines.length ? "Piezas (" + lines.length + "):\n" + lines.join("\n") : "El modelo no tiene piezas.");
        return;
      case "info": {
        const info = core.automation.getModelInfo();
        appendMessage("assistant", "Modelo: " + info.instances + " instancias, " + info.definitions
          + " definiciones. Unidades: " + info.units + ". Undo: " + (info.canUndo ? "sí" : "no")
          + "; Redo: " + (info.canRedo ? "sí" : "no") + ".");
        return;
      }
      case "axes": {
        const axes = core.automation.getPieceAxes(command.id);
        appendMessage("assistant", "Ejes de " + command.id
          + ":\nX " + JSON.stringify(axes.x) + "\nY " + JSON.stringify(axes.y)
          + "\nZ " + JSON.stringify(axes.z)
          + "\nReferencias: " + axes.references.length + ". No se supone un eje longitudinal.");
        return;
      }
      case "snaps": {
        const snaps = core.automation.listPieceSnaps(command.id);
        appendMessage("assistant", snaps.length ? "SNAPs de " + command.id + ":\n" + JSON.stringify(snaps, null, 2)
          : "La pieza no tiene SNAPs persistentes.");
        return;
      }
      case "piece": {
        const piece = core.automation.getPiece(command.id);
        appendMessage("assistant", "Pieza: " + (piece.instance.name || piece.definition.name)
          + "\nID: " + piece.instance.id + "\nDefinición: " + piece.definition.id
          + "\nPosición: " + JSON.stringify(piece.instance.transform.position));
        return;
      }
      case "select": {
        const result = await dispatch("select_pieces", { ids: [command.id] });
        appendMessage("assistant", result.ok ? "Pieza seleccionada." : "Selección cancelada: " + result.error);
        return;
      }
      case "undo":
      case "redo": {
        const result = await dispatch(command.kind, {});
        appendMessage("assistant", result.ok
          ? (command.kind === "undo" ? "Deshacer: " : "Rehacer: ") + (result.data?.changed ? "cambio realizado." : "sin cambios pendientes.")
          : "No se ejecutó: " + result.error);
        return;
      }
      case "prepare": {
        const result = await dispatch("prepare_operation", { request: command.request });
        if (!result.ok) throw new Error(result.error || "Error de preparación.");
        showPreview(result.data);
        return;
      }
      case "unknown":
        if (ai && command.message.startsWith("No reconozco")) await answerWithAi(input);
        else appendMessage("assistant", command.message.startsWith("Selecciona exactamente una pieza")
          ? target.issue || command.message : command.message);
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    if (busy || disposed) return;
    const text = field.value.trim();
    if (!text) return;
    field.value = "";
    appendMessage("user", text);
    busy = true;
    send.disabled = true;
    void handleCommand(text).catch(error => {
      appendMessage("assistant", "Error: " + String(error instanceof Error ? error.message : error));
    }).finally(() => { busy = false; send.disabled = false; });
  };

  // Prevent editor's M/Escape/Ctrl shortcuts while writing to the chat input.
  root.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape" && !panel.hidden) {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    }
  });
  root.addEventListener("pointerdown", event => event.stopPropagation());
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) { refreshPiecePicker(); updateDockLayout(); field.focus(); }
  };
  close.onclick = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  };

  aiButton.onclick = async () => {
    if (loadingAi || ai || disposed) return;
    if (!("gpu" in navigator)) {
      aiStatus.textContent = "WebGPU no está disponible; el chat por comandos funciona igualmente.";
      return;
    }
    if (!window.confirm("La IA local descargará un modelo abierto de aproximadamente 1 GB en este equipo. No se cobra por tokens ni por API. ¿Descargar?")) return;
    loadingAi = true;
    aiButton.disabled = true;
    aiStatus.textContent = "Cargando el motor WebLLM…";
    try {
      // Official CDN distribution; no large AI runtime or model in the initial CAD bundle.
      const webllm = await import(/* @vite-ignore */ WEBLLM_CDN) as {
        CreateMLCEngine(id: string, options: { initProgressCallback: (report: { text: string; progress: number }) => void }): Promise<LocalEngine>;
      };
      const loaded = await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: report => {
          if (!disposed) aiStatus.textContent = "IA local: " + Math.round(report.progress * 100) + "% · " + report.text;
        },
      });
      if (disposed) { await loaded.unload?.(); return; }
      ai = loaded;
      aiStatus.textContent = "IA local activa. Responde preguntas; nunca ejecuta cambios CAD.";
      aiButton.textContent = "IA local activa";
      appendMessage("assistant", "IA local cargada. Puedes preguntar sobre tu modelo; los movimientos siguen requiriendo un comando explícito.");
    } catch (error) {
      aiButton.disabled = false;
      aiStatus.textContent = "WebLLM no se pudo cargar: " + String(error instanceof Error ? error.message : error)
        + ". El modo de comandos sigue funcionando.";
    } finally {
      loadingAi = false;
    }
  };

  appendMessage("assistant", "Chat integrado listo, sin VS Code. Escribe «ayuda» para ver comandos. La IA local es opcional y solo se descarga si tú lo autorizas.");
  return () => {
    disposed = true;
    invalidatePreview();
    window.removeEventListener("resize", updateDockLayout);
    window.clearInterval(layoutTimer);
    unsubscribeSelection();
    void ai?.unload?.();
    root.remove();
    releaseAssistantDock(dock);
  };
}
