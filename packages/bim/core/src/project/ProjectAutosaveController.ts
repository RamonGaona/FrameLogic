import type {
  FrameLogicProjectPackage,
} from "./FrameLogicProjectPackageController";

export interface ProjectAutosaveControllerOptions {
  readonly container: HTMLElement;
  readonly createProjectPackage: (
    name?: string,
  ) => FrameLogicProjectPackage;
  readonly restoreProjectPackage: (
    project: FrameLogicProjectPackage,
  ) => Promise<void>;
}

interface AutosaveRecord {
  readonly id: "latest";
  readonly savedAt: string;
  readonly project: FrameLogicProjectPackage;
}

const DATABASE_NAME =
  "framelogic-project-recovery";
const DATABASE_VERSION =
  1;
const STORE_NAME =
  "autosaves";
const AUTOSAVE_INTERVAL_MS =
  10_000;
const BEFORE_UNLOAD_GRACE_MS =
  15_000;

/**
 * Recuperación local de proyecto para cierres/reinicios inesperados.
 *
 * Se usa IndexedDB en vez de localStorage porque los paquetes FrameLogic
 * pueden contener STEP/IFC y crecer varios MB. El .flproject sigue siendo
 * el guardado explícito/portable del usuario; este controlador solo mantiene
 * una copia de recuperación local del navegador.
 */
export class ProjectAutosaveController {
  private readonly options:
    ProjectAutosaveControllerOptions;
  private readonly status:
    HTMLSpanElement;
  private readonly timer:
    number;
  private lastSuccessfulAutosave =
    0;
  private lastSerialized =
    "";
  private saving =
    false;
  private disposed =
    false;

  constructor(
    options:
      ProjectAutosaveControllerOptions,
  ) {
    this.options =
      options;
    this.status =
      this.createStatus(
        options.container,
      );

    this.timer =
      window.setInterval(
        () => {
          void this.autosave();
        },
        AUTOSAVE_INTERVAL_MS,
      );

    window.addEventListener(
      "beforeunload",
      this.handleBeforeUnload,
    );
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    window.addEventListener(
      "pagehide",
      this.handlePageHide,
    );

    window.setTimeout(
      () => {
        void this.offerRecovery();
      },
      0,
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed =
      true;
    window.clearInterval(
      this.timer,
    );
    window.removeEventListener(
      "beforeunload",
      this.handleBeforeUnload,
    );
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    window.removeEventListener(
      "pagehide",
      this.handlePageHide,
    );
    this.status.remove();
  }

  async autosave(): Promise<void> {
    if (
      this.disposed
      || this.saving
    ) {
      return;
    }

    this.saving =
      true;
    try {
      const project =
        this.options
          .createProjectPackage(
            "FrameLogic Autosave",
          );

      if (!hasRecoverableContent(project)) {
        this.status.textContent =
          "Autoguardado: listo";
        return;
      }

      const serialized =
        JSON.stringify(project);
      if (
        serialized
        === this.lastSerialized
      ) {
        this.lastSuccessfulAutosave =
          Date.now();
        this.status.textContent =
          "Autoguardado: al día";
        return;
      }

      this.status.textContent =
        "Autoguardando…";
      await writeAutosave({
        id: "latest",
        savedAt:
          new Date().toISOString(),
        project,
      });
      this.lastSerialized =
        serialized;
      this.lastSuccessfulAutosave =
        Date.now();
      this.status.textContent =
        "Autoguardado: al día";
    }
    catch (
      error
    ) {
      console.warn(
        "FrameLogic autosave failed:",
        error,
      );
      this.status.textContent =
        "Autoguardado: pendiente";
    }
    finally {
      this.saving =
        false;
    }
  }

  private async offerRecovery():
    Promise<void> {
    try {
      const record =
        await readAutosave();
      if (
        !record
        || !hasRecoverableContent(
          record.project,
        )
      ) {
        return;
      }

      const date =
        new Date(
          record.savedAt,
        );
      const label =
        Number.isNaN(
          date.getTime(),
        )
          ? record.savedAt
          : date.toLocaleString();

      const restore =
        window.confirm(
          `Se encontró una recuperación automática de FrameLogic (${label}).\n\n¿Deseas recuperar ese proyecto?`,
        );

      if (!restore) {
        await clearAutosave();
        this.lastSerialized =
          "";
        this.status.textContent =
          "Autoguardado: listo";
        return;
      }

      this.status.textContent =
        "Recuperando…";
      await this.options
        .restoreProjectPackage(
          record.project,
        );
      this.lastSerialized =
        JSON.stringify(
          record.project,
        );
      this.lastSuccessfulAutosave =
        Date.now();
      this.status.textContent =
        "Recuperado · autoguardado activo";
    }
    catch (
      error
    ) {
      console.warn(
        "FrameLogic recovery failed:",
        error,
      );
      this.status.textContent =
        "Autoguardado: pendiente";
    }
  }

  private readonly handleVisibilityChange =
    (): void => {
      if (
        document.visibilityState
        === "hidden"
      ) {
        void this.autosave();
      }
    };

  private readonly handlePageHide =
    (): void => {
      void this.autosave();
    };

  private readonly handleBeforeUnload =
    (
      event:
        BeforeUnloadEvent,
    ): void => {
      /*
       * Si el último autoguardado es reciente no molestamos al usuario.
       * Si todavía no hubo uno exitoso, o lleva demasiado tiempo pendiente,
       * el navegador muestra su aviso nativo de cambios sin guardar.
       */
      if (
        this.lastSuccessfulAutosave > 0
        && Date.now()
          - this.lastSuccessfulAutosave
          <= BEFORE_UNLOAD_GRACE_MS
      ) {
        return;
      }

      try {
        const project =
          this.options
            .createProjectPackage(
              "FrameLogic Recovery Check",
            );
        if (!hasRecoverableContent(project)) {
          return;
        }
      }
      catch {
        return;
      }

      event.preventDefault();
      event.returnValue =
        "";
    };

  private createStatus(
    container:
      HTMLElement,
  ):
    HTMLSpanElement {
    const status =
      document.createElement("span");
    status.textContent =
      "Autoguardado: activo";
    status.title =
      "FrameLogic guarda una copia de recuperación local en este navegador.";
    Object.assign(
      status.style,
      {
        alignSelf: "center",
        padding: "0 4px",
        color: "#b9c8d1",
        whiteSpace: "nowrap",
        font: "11px system-ui, sans-serif",
      },
    );

    const projectBar =
      container.querySelector<HTMLElement>(
        '[data-framelogic-project-toolbar="true"]',
      );
    if (projectBar) {
      projectBar.append(status);
    }
    else {
      Object.assign(
        status.style,
        {
          position: "absolute",
          left: "16px",
          top: "84px",
          zIndex: "122",
        },
      );
      container.append(status);
    }
    return status;
  }
}

function hasRecoverableContent(
  project:
    FrameLogicProjectPackage,
): boolean {
  return (
    project.pieceDefinitions.length > 0
    || project.pieceInstances.length > 0
    || project.cadLines.length > 0
    || project.cadPoints.length > 0
    || project.geometrySources.length > 0
    || project.referenceSources.length > 0
  );
}

function openDatabase():
  Promise<IDBDatabase> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const request =
        window.indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION,
        );
      request.onupgradeneeded =
        () => {
          const database =
            request.result;
          if (
            !database.objectStoreNames
              .contains(
                STORE_NAME,
              )
          ) {
            database.createObjectStore(
              STORE_NAME,
              {
                keyPath: "id",
              },
            );
          }
        };
      request.onsuccess =
        () => resolve(
          request.result,
        );
      request.onerror =
        () => reject(
          request.error
          ?? new Error(
            "No se pudo abrir IndexedDB.",
          ),
        );
    },
  );
}

async function writeAutosave(
  record:
    AutosaveRecord,
): Promise<void> {
  const database =
    await openDatabase();
  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readwrite",
          );
        transaction.objectStore(
          STORE_NAME,
        ).put(record);
        transaction.oncomplete =
          () => resolve();
        transaction.onerror =
          () => reject(
            transaction.error,
          );
        transaction.onabort =
          () => reject(
            transaction.error,
          );
      },
    );
  }
  finally {
    database.close();
  }
}

async function readAutosave():
  Promise<AutosaveRecord | null> {
  const database =
    await openDatabase();
  try {
    return await new Promise<
      AutosaveRecord | null
    >(
      (
        resolve,
        reject,
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readonly",
          );
        const request =
          transaction.objectStore(
            STORE_NAME,
          ).get("latest");
        request.onsuccess =
          () => resolve(
            (request.result
              as AutosaveRecord
              | undefined)
            ?? null,
          );
        request.onerror =
          () => reject(
            request.error,
          );
      },
    );
  }
  finally {
    database.close();
  }
}

async function clearAutosave():
  Promise<void> {
  const database =
    await openDatabase();
  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readwrite",
          );
        transaction.objectStore(
          STORE_NAME,
        ).delete("latest");
        transaction.oncomplete =
          () => resolve();
        transaction.onerror =
          () => reject(
            transaction.error,
          );
        transaction.onabort =
          () => reject(
            transaction.error,
          );
      },
    );
  }
  finally {
    database.close();
  }
}
