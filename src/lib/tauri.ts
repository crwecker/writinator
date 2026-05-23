/**
 * Tauri runtime adapter. All Tauri plugin imports are dynamic so that the
 * web bundle never references `@tauri-apps/*` modules. Code paths in this
 * module must be reachable only after a true `isTauri()` check.
 */

const FILE_EXTENSION = '.writinator'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface TauriSaveDialogOptions {
  suggestedName: string
}

export async function showTauriSaveDialog(
  opts: TauriSaveDialogOptions
): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const result = await save({
    defaultPath: opts.suggestedName,
    filters: [{ name: 'Writinator Book', extensions: ['writinator'] }],
  })
  return result ?? null
}

export async function showTauriOpenDialog(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const result = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Writinator Book', extensions: ['writinator'] }],
  })
  if (result === null) return null
  // result is string when multiple:false
  return typeof result === 'string' ? result : null
}

export async function readTauriTextFile(path: string): Promise<string> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  return readTextFile(path)
}

export async function writeTauriTextFile(path: string, contents: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  await writeTextFile(path, contents)
}

export async function tauriFileExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(path)
  } catch {
    return false
  }
}

export async function tauriFileMtime(path: string): Promise<number | null> {
  try {
    const { stat } = await import('@tauri-apps/plugin-fs')
    const info = await stat(path)
    const mtime = info.mtime
    if (!mtime) return null
    return mtime instanceof Date ? mtime.getTime() : new Date(mtime).getTime()
  } catch {
    return null
  }
}

/** Returns the file's basename for display, e.g. "/Users/x/my-book.writinator" → "my-book.writinator" */
export function tauriBasename(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/'
  const tail = path.split(sep).pop() ?? path
  return tail || path
}

/** Strips the .writinator extension from a basename for use as a book title. */
export function stripWritinatorExt(name: string): string {
  return name.endsWith(FILE_EXTENSION) ? name.slice(0, -FILE_EXTENSION.length) : name
}
