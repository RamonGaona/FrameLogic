import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  readonly onChange: (checked: boolean) => void;
}

function PreferenceToggle({ name, description, checked, onChange }: PreferenceToggleProps) {
  return (
    <label className="fl-settings-field">
      <span>
        <strong>{name}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked}
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
  const [preferences, setPreferences] = useState<FrameLogicPreferences>(() =>
    loadFrameLogicPreferences(window.localStorage));
  const [storageWarning, setStorageWarning] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => {
      previousFocus.current = document.activeElement instanceof HTMLElement
        ? document.activeElement : null;
      setActiveSection("GENERAL");
      setOpen(true);
    };
    window.addEventListener(FRAMELOGIC_OPEN_SETTINGS_EVENT, show);
    return () => window.removeEventListener(FRAMELOGIC_OPEN_SETTINGS_EVENT, show);
  }, []);

  useEffect(() => {
    applyFrameLogicPreferences(document.documentElement, preferences);
    if (!saveFrameLogicPreferences(window.localStorage, preferences)) {
      setStorageWarning(true);
    } else {
      setStorageWarning(false);
    }
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
        setOpen(false);
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
    setPreferences((current) => ({ ...current, [key]: checked }));
  };

  if (!open) return null;

  return createPortal(
    <div className="fl-settings-backdrop"
      data-framelogic-settings-backdrop="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
      <div className="fl-settings-window" role="dialog" aria-modal="true"
        aria-labelledby="framelogic-settings-title" ref={dialogRef}
        data-framelogic-settings-window="true"
        onPointerDown={(event) => event.stopPropagation()}>
        <header className="fl-settings-header">
          <div>
            <span className="fl-settings-eyebrow">PREFERENCIAS DE APLICACIÓN</span>
            <h2 id="framelogic-settings-title">Configuración de FrameLogic</h2>
          </div>
          <button type="button" className="fl-settings-close"
            title="Cerrar configuración" aria-label="Cerrar configuración"
            onClick={() => setOpen(false)}>×</button>
        </header>
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
                  <p>Las preferencias se aplican inmediatamente y se conservan en este navegador.
                    No modifican la geometría del proyecto ni se guardan todavía en archivos .flproject.</p>
                </div>
                <div className="fl-settings-info">
                  <strong>Secciones ampliables</strong>
                  <p>Podremos incorporar nuevas pestañas para unidades, snaps, acotación,
                    vistas, exportaciones y automatización cuando cada opción esté conectada
                    al motor correspondiente.</p>
                </div>
                <button type="button" className="fl-settings-reset"
                  onClick={() => {
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
                  onChange={(value) => update("compactRibbon", value)} />
                <PreferenceToggle name="Reducir animaciones de interfaz"
                  description="Suprime transiciones decorativas, sin modificar el movimiento del modelo 3D."
                  checked={preferences.reduceMotion}
                  onChange={(value) => update("reduceMotion", value)} />
              </>
            )}
            {activeSection === "MODEL" && (
              <PreferenceToggle name="Mostrar cubo de vistas"
                description="Muestra u oculta el cubo de orientación, sin cambiar la cámara."
                checked={preferences.showViewCube}
                onChange={(value) => update("showViewCube", value)} />
            )}
            {activeSection === "PAPER" && (
              <PreferenceToggle name="Mostrar los cuatro puntos del detalle circular"
                description="Controla la visibilidad de los grips de edición N/E/S/O. No cambia el PDF exportado."
                checked={preferences.showCircularDetailGrips}
                onChange={(value) => update("showCircularDetailGrips", value)} />
            )}
          </main>
        </div>
        <footer className="fl-settings-footer">
          <span>{storageWarning
            ? "No se pudo guardar en este navegador; los cambios solo durarán en esta sesión."
            : "Cambios aplicados y guardados automáticamente en este navegador."}</span>
          <button type="button" onClick={() => setOpen(false)}>Cerrar</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
