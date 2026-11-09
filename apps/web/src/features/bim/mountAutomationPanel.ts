import { connectAutomationBridge, type PrecisionBimCoreInstance } from "@framelogic/bim-core";
import { getOrCreateAssistantDock, releaseAssistantDock } from "./assistantDockLayout";

/** One explicit session per viewport; no credentials in localStorage or URLs. */
export function mountAutomationPanel(core: Pick<PrecisionBimCoreInstance, "automation">) {
  const root = document.createElement("div");
  root.className = "framelogic-mcp-root";
  root.innerHTML = `<button class="framelogic-mcp-toggle" type="button" aria-label="Abrir conexión MCP">MCP</button>
    <dialog aria-label="Conexión MCP" style="width:min(480px,calc(100vw - 40px));max-height:85vh;overflow:auto;padding:24px;border:1px solid #64748b;border-radius:12px;background:#172033;color:#f1f5f9;font:14px system-ui">
      <form method="dialog"><button style="float:right" aria-label="Cerrar panel">Cerrar</button></form>
      <h2 style="margin:0 0 12px">Conectar un agente MCP</h2>
      <p>El agente podrá consultar el modelo de esta pestaña. Cada modificación requiere tu aprobación. Mantén FrameLogic abierto.</p>
      <form data-connect>
        <label style="display:block;margin:14px 0">Servidor HTTPS<br><input name="server" type="url" required placeholder="https://framelogic-mcp.…workers.dev" style="width:100%;box-sizing:border-box;margin-top:6px;padding:8px"></label>
        <label style="display:block;margin:14px 0">Clave de acceso al servidor<br><input name="key" type="password" required autocomplete="off" style="width:100%;box-sizing:border-box;margin-top:6px;padding:8px"></label>
        <button type="submit">Crear conexión</button>
      </form>
      <p role="status" aria-live="polite">Sin conexión. Requiere un servidor MCP desplegado.</p>
      <section data-session hidden>
        <p>Configura estos datos en un cliente compatible con MCP por HTTP y cabecera Authorization. Son privados y caducan en una hora.</p>
        <label>URL MCP<input data-url readonly style="width:100%;box-sizing:border-box;margin:6px 0;padding:8px"></label>
        <label>Authorization<input data-token type="password" readonly style="width:100%;box-sizing:border-box;margin:6px 0;padding:8px"></label>
        <button data-copy type="button">Copiar configuración</button>
        <button data-stop type="button">Desconectar y revocar</button>
      </section>
      <p style="font-size:12px;color:#cbd5e1">MCP experimental · No incluye un chat ni un proveedor de IA.</p>
    </dialog>`;
  const dock = getOrCreateAssistantDock();
  dock.append(root);
  const dialog = root.querySelector("dialog")!;
  const form = root.querySelector<HTMLFormElement>("[data-connect]")!;
  const serverInput = form.elements.namedItem("server") as HTMLInputElement;
  const keyInput = form.elements.namedItem("key") as HTMLInputElement;
  const status = root.querySelector<HTMLElement>("[role=status]")!;
  const section = root.querySelector<HTMLElement>("[data-session]")!;
  const urlInput = root.querySelector<HTMLInputElement>("[data-url]")!;
  const tokenInput = root.querySelector<HTMLInputElement>("[data-token]")!;
  const submit = form.querySelector("button")!;
  let active: { base: string; browserToken: string; agentToken: string } | undefined;
  let disconnect: (() => void) | undefined;
  let disposed = false;
  let connecting = false;
  const abort = new AbortController();
  root.querySelector("button")!.onclick = () => dialog.showModal();
  const revoke = async (session: NonNullable<typeof active>) => {
    const response = await fetch(`${session.base}/close`, { method: "POST", headers: { Authorization: `Bearer ${session.browserToken}` }, keepalive: true });
    if (!response.ok && response.status !== 410) throw new Error("No se pudo revocar en el servidor");
  };
  const stop = async () => {
    disconnect?.(); disconnect = undefined;
    const session = active; active = undefined;
    section.hidden = true; form.hidden = false;
    urlInput.value = ""; tokenInput.value = "";
    status.textContent = "Desconectado.";
    if (session) {
      try { await revoke(session); }
      catch { status.textContent = "Desconectado del modelo. No se pudo confirmar la revocación remota; la clave caducará en una hora."; }
    }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (connecting || active) return;
    connecting = true; submit.disabled = true;
    try {
      const url = new URL(serverInput.value.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Introduce solo el origen HTTPS del servidor.");
      status.textContent = "Creando sesión…";
      const response = await fetch(`${url.origin}/sessions`, { method: "POST", headers: { Authorization: `Bearer ${keyInput.value.trim()}` }, signal: abort.signal });
      if (!response.ok) throw new Error(`No se pudo crear la sesión (${response.status}). Revisa la dirección y la clave.`);
      const data = await response.json() as { id: string; browserToken: string; agentToken: string };
      if (!/^[a-f0-9-]{36}$/.test(data.id) || !/^[a-f0-9]{64}$/.test(data.browserToken) || !/^[a-f0-9]{64}$/.test(data.agentToken)) throw new Error("Respuesta inválida del servidor");
      active = { base: `${url.origin}/sessions/${data.id}`, browserToken: data.browserToken, agentToken: data.agentToken };
      if (disposed) { await stop(); return; }
      keyInput.value = "";
      urlInput.value = `${active.base}/mcp`; tokenInput.value = `Bearer ${active.agentToken}`;
      section.hidden = false; form.hidden = true;
      status.textContent = "Conectando con el modelo…";
      disconnect = connectAutomationBridge(core.automation, active.browserToken,
        summary => window.confirm("¿Aprobar esta acción en FrameLogic?\n" + JSON.stringify(summary, null, 2)), active.base,
        (state, message) => {
          status.textContent = state === "connected" ? "Conectado. Listo para recibir solicitudes del agente." : state === "error"
            ? `Conexión interrumpida: ${message}. Revisa el modelo antes de repetir una acción. Desconecta y crea otra sesión.` : "Desconectado.";
        });
    } catch (error) { if (!disposed) status.textContent = error instanceof Error ? error.message : String(error); }
    finally { connecting = false; submit.disabled = false; }
  };
  root.querySelector<HTMLButtonElement>("[data-stop]")!.onclick = () => void stop();
  root.querySelector<HTMLButtonElement>("[data-copy]")!.onclick = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ mcpServers: { framelogic: { url: `${active.base}/mcp`, headers: { Authorization: `Bearer ${active.agentToken}` } } } }, null, 2));
      status.textContent = "Configuración copiada. Compártela solo con tu cliente MCP.";
    } catch { status.textContent = "No se pudo copiar. Selecciona y copia los campos manualmente."; tokenInput.type = "text"; }
  };
  return () => { disposed = true; abort.abort(); void stop(); dialog.close(); root.remove(); releaseAssistantDock(dock); };
}
