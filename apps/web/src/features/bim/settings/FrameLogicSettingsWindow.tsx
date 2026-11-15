import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FrameLogicCatalogSettings } from "./FrameLogicCatalogSettings";
import { mayUnlockSettings } from "./settingsEditorGate";
import {
  applyFrameLogicPreferences,
  DEFAULT_FRAMELOGIC_PREFERENCES,
  FRAMELOGIC_OPEN_SETTINGS_EVENT,
  loadFrameLogicPreferences,
  saveFrameLogicPreferences,
  SETTINGS_SECTIONS,
  type FrameLogicPreferences,
  type SettingsSectionId,
} from "./frameLogicPreferences";
import "./frameLogicSettings.css";

type BooleanSetting = Exclude<keyof FrameLogicPreferences, "schemaVersion">;

interface PreferenceToggleProps {
  readonly name: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}

function PreferenceToggle({ name, description, checked, disabled, onChange }: PreferenceToggleProps) {
  return (
    <label className="fl-settings-field">
      <span>
        <strong>{name}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

/**
 * One settings window across Model Space, Paper Space and future editors.
 * Native toolbar buttons dispatch a browser event; this React component owns
 * the accessible dialog and stores only user-level preferences, not project data.
 */
export function FrameLogicSettingsWindow() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("GENERAL");
  const [preferences, setPreferences] = useState<FrameLogicPreferences>(() => {
    try {
      return loadFrameLogicPreferences(window.localStorage);
    } catch {
      return { ...DEFAULT_FRAMELOGIC_PREFERENCES };
    }
  });
  const [storageWarning, setStorageWarning] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockFormOpen, setUnlockFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const catalogDirtyRef = useRef(false);
  const onCatalogDirty = useCallback((value: boolean) => {
    catalogDirtyRef.current = value;
  }, []);

  const requestClose = () => {
    if (catalogDirtyRef.current && !window.confirm(
      "La base de datos tiene cambios sin guardar. ¿Cerrar y descartarlos?",
    )) return;
    setOpen(false);
  };

  useEffect(() => {
    const show = () => {
      previousFocus.current = document.activeElement instanceof HTMLElement
        ? document.activeElement : null;
      catalogDirtyRef.current = false;
      setActiveSection("GENERAL");
      setUnlocked(false);
      setUnlockFormOpen(false);
      setUsername("");
      setPassword("");
      setUnlockError("");
      setOpen(true);
    };
    window.addEventListener(FRAMELOGIC_OPEN_SETTINGS_EVENT, show);
    return () => window.removeEventListener(FRAMELOGIC_OPEN_SETTINGS_EVENT, show);
  }, []);

  useEffect(() => {
    applyFrameLogicPreferences(document.documentElement, preferences);
    let saved = false;
    try {
      saved = saveFrameLogicPreferences(window.localStorage, preferences);
    } catch {
      // Browsers in restricted/private contexts may block even localStorage access.
    }
    setStorageWarning(!saved);
  }, [preferences]);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset["framelogicSettingsOpen"] = "true";
    const focusTarget = dialogRef.current?.querySelector<HTMLElement>(
      'button[data-framelogic-settings-section="GENERAL"]');
    focusTarget?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!catalogDirtyRef.current || window.confirm(
          "La base de datos tiene cambios sin guardar. ¿Cerrar y descartarlos?",
        )) setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const enabled = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
      )].filter((element) => element.getClientRects().length > 0);
      if (!enabled.length) return;
      const first = enabled[0]!;
      const last = enabled[enabled.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Intercept ESC ahead of CAD hotkeys without changing model handlers.
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = originalOverflow;
      delete document.documentElement.dataset["framelogicSettingsOpen"];
      previousFocus.current?.focus();
    };
  }, [open]);

  const update = (key: BooleanSetting, checked: boolean) => {
    if (!unlocked) return;
    setPreferences((current) => ({ ...current, [key]: checked }));
  };

  const toggleEditorLock = () => {
    if (unlocked) {
      setUnlocked(false);
      setUnlockFormOpen(false);
      setUsername("");
      setPassword("");
      return;
    }
    setUsername("");
    setPassword("");
    setUnlockError("");
    setUnlockFormOpen(true);
  };

  const acceptUnlock = () => {
    if (!mayUnlockSettings(username, password)) {
      setUnlockError("Por ahora, deja usuario y contraseña vacíos y pulsa Aceptar.");
      return;
    }
    setUnlocked(true);
    setUnlockFormOpen(false);
    setUsername("");
    setPassword("");
    setUnlockError("");
  };

  if (!open) return null;

  return createPortal(
    <div className="fl-settings-backdrop"
      data-framelogic-settings-backdrop="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}>
      <div className="fl-settings-window" role="dialog" aria-modal="true"
        aria-labelledby="framelogic-settings-title" ref={dialogRef}
        data-framelogic-settings-window="true"
        data-framelogic-settings-active={activeSection}
        onPointerDown={(event) => event.stopPropagation()}>
        <header className="fl-settings-header">
          <div>
            <span className="fl-settings-eyebrow">PREFERENCIAS DE APLICACIÓN</span>
            <h2 id="framelogic-settings-title">Configuración de FrameLogic</h2>
          </div>
          <div className="fl-settings-header-actions">
            <button type="button" className="fl-settings-global-lock"
              data-framelogic-settings-global-lock="true"
              aria-label={unlocked ? "Bloquear edición de configuración" : "Desbloquear edición de configuración"}
              aria-expanded={unlockFormOpen}
              title={unlocked ? "Edición habilitada: bloquear" : "Solo lectura: desbloquear"}
              onClick={toggleEditorLock}>
              <span aria-hidden="true">{unlocked ? "🔓" : "🔒"}</span>
              <span>{unlocked ? "Edición" : "Solo lectura"}</span>
            </button>
            <button type="button" className="fl-settings-close"
              title="Cerrar configuración" aria-label="Cerrar configuración"
              onClick={requestClose}>×</button>
          </div>
        </header>
        {unlockFormOpen && (
          <form className="fl-settings-unlock-panel"
            aria-label="Desbloquear edición de toda la configuración"
            onSubmit={(event) => { event.preventDefault(); acceptUnlock(); }}>
            <strong>Acceso de editor (toda la configuración)</strong>
            <p>Acceso provisional: usuario y contraseña vacíos. No es seguridad real.</p>
            <label>Usuario
              <input type="text" value={username} autoComplete="off"
                onChange={(event) => setUsername(event.currentTarget.value)} />
            </label>
            <label>Contraseña
              <input type="password" value={password} autoComplete="off"
                onChange={(event) => setPassword(event.currentTarget.value)} />
            </label>
            {unlockError && <span className="fl-settings-unlock-error" role="alert">{unlockError}</span>}
            <div className="fl-settings-unlock-actions">
              <button type="button" onClick={() => setUnlockFormOpen(false)}>Cancelar</button>
              <button type="submit">Aceptar</button>
            </div>
          </form>
        )}
        <div className="fl-settings-layout">
          <nav className="fl-settings-nav" aria-label="Secciones de configuración">
            {SETTINGS_SECTIONS.map(({ id, title }) => (
              <button key={id} type="button"
                data-framelogic-settings-section={id}
                className={activeSection === id ? "is-active" : ""}
                aria-current={activeSection === id ? "page" : undefined}
                onClick={() => setActiveSection(id)}>{title}</button>
            ))}
          </nav>
          <main className="fl-settings-content">
            <h3>{SETTINGS_SECTIONS.find((tab) => tab.id === activeSection)?.title}</h3>
            <p className="fl-settings-intro">
              {SETTINGS_SECTIONS.find((tab) => tab.id === activeSection)?.description}
            </p>
            {activeSection === "GENERAL" && (
              <>
                <div className="fl-settings-info">
                  <strong>Centro de configuración</strong>
                  <p>El candado de la cabecera controla la edición de todas las pestañas. Las preferencias se aplican inmediatamente y se conservan en este navegador.
                    No modifican la geometría del proyecto ni se guardan todavía en archivos .flproject.</p>
                </div>
                <div className="fl-settings-info">
                  <strong>Secciones ampliables</strong>
                  <p>Podremos incorporar nuevas pestañas para unidades, snaps, acotación,
                    vistas, exportaciones y automatización cuando cada opción esté conectada
                    al motor correspondiente.</p>
                </div>
                <button type="button" className="fl-settings-reset"
                  disabled={!unlocked}
                  onClick={() => {
                    if (!unlocked) return;
                    if (!window.confirm("¿Restaurar las preferencias de interfaz predeterminadas?")) return;
                    setPreferences({ ...DEFAULT_FRAMELOGIC_PREFERENCES });
                  }}>Restaurar valores predeterminados</button>
              </>
            )}
            {activeSection === "INTERFACE" && (
              <>
                <PreferenceToggle name="Barras de herramientas compactas"
                  description="Reduce espacios y tamaños de los controles superiores."
                  checked={preferences.compactRibbon}
                  disabled={!unlocked}
                  onChange={(value) => update("compactRibbon", value)} />
                <PreferenceToggle name="Reducir animaciones de interfaz"
                  description="Suprime transiciones decorativas, sin modificar el movimiento del modelo 3D."
                  checked={preferences.reduceMotion}
                  disabled={!unlocked}
                  onChange={(value) => update("reduceMotion", value)} />
              </>
            )}
            {activeSection === "MODEL" && (
              <PreferenceToggle name="Mostrar cubo de vistas"
                description="Muestra u oculta el cubo de orientación, sin cambiar la cámara."
                checked={preferences.showViewCube}
                disabled={!unlocked}
                onChange={(value) => update("showViewCube", value)} />
            )}
            {activeSection === "PAPER" && (
              <PreferenceToggle name="Mostrar los cuatro puntos del detalle circular"
                description="Controla la visibilidad de los grips de edición N/E/S/O. No cambia el PDF exportado."
                checked={preferences.showCircularDetailGrips}
                disabled={!unlocked}
                onChange={(value) => update("showCircularDetailGrips", value)} />
            )}
            <div hidden={activeSection !== "DATABASE"}>
              <FrameLogicCatalogSettings unlocked={unlocked} onDirtyChange={onCatalogDirty} />
            </div>
          </main>
        </div>
        <footer className="fl-settings-footer">
          <span>{unlocked ? "🔓 Edición habilitada" : "🔒 Solo lectura"} · {storageWarning
            ? "Las preferencias no se pueden guardar en este navegador."
            : "Preferencias de interfaz guardadas en este navegador."}</span>
          <button type="button" onClick={requestClose}>Cerrar</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
