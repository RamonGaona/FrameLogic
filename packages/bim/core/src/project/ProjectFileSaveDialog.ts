/**
 * Browser-owned save dialog. The browser chooses the folder and provides
 * its native same-name replacement warning before returning a file handle.
 * FrameLogic adds a second confirmation when the target already has bytes,
 * and never opens a writable stream until the user approves replacement.
 */
export interface ProjectWritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
export interface ProjectFileHandle {
  readonly name: string;
  getFile(): Promise<{ readonly size: number }>;
  createWritable(): Promise<ProjectWritableFile>;
}
export interface ProjectSavePickerOptions {
  suggestedName: string;
  types: readonly {
    description: string;
    accept: Record<string, string[]>;
  }[];
  excludeAcceptAllOption: boolean;
}
export interface ProjectSaveDialogHost {
  showSaveFilePicker?(options: ProjectSavePickerOptions): Promise<ProjectFileHandle>;
  confirm(message: string): boolean;
}

export type ProjectSaveDialogResult =
  | { readonly status: "saved"; readonly fileName: string }
  | { readonly status: "cancelled" }
  | { readonly status: "unsupported" };

export function isPickerAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function fileNameToProjectName(fileName: string): string {
  return fileName.replace(/\.flproject$/i, "").trim() || "FrameLogic Project";
}

export async function saveProjectWithDialog(
  host: ProjectSaveDialogHost,
  suggestedName: string,
  createBlob: (chosenFileName: string) => Blob,
): Promise<ProjectSaveDialogResult> {
  // Must invoke the picker synchronously within the actual user click:
  // any await before this line may lose the browser's transient activation.
  if (!host.showSaveFilePicker) return { status: "unsupported" };
  let handle: ProjectFileHandle;
  try {
    handle = await host.showSaveFilePicker({
      suggestedName,
      types: [{
        description: "Proyecto FrameLogic (.flproject)",
        accept: { "application/json": [".flproject"] },
      }],
      excludeAcceptAllOption: true,
    });
  } catch (error) {
    if (isPickerAbort(error)) return { status: "cancelled" };
    throw error;
  }

  // Some browsers create an empty placeholder for a new file. A nonempty
  // file is definitely existing content and must not be silently replaced.
  let existingSize = 0;
  try {
    existingSize = (await handle.getFile()).size;
  } catch (error) {
    if (!(error instanceof Error && error.name === "NotFoundError")) throw error;
  }
  if (existingSize > 0 && !host.confirm(
    `El archivo "${handle.name}" ya existe y contiene datos. ¿Deseas reemplazarlo? Esta operación sobrescribirá su contenido.`,
  )) {
    return { status: "cancelled" };
  }

  // Build project only after the user selected the actual target and approved
  // overwrite. Opening/writing streams before this point can truncate data.
  const blob = createBlob(handle.name);
  const stream = await handle.createWritable();
  try {
    await stream.write(blob);
    await stream.close();
  } catch (error) {
    try { await stream.abort?.(); } catch { /* Preserve the original error. */ }
    throw error;
  }
  return { status: "saved", fileName: handle.name };
}
