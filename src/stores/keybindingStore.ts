import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'

export type ActionName =
  | 'toggleTypewriter'
  | 'toggleFileTree'
  | 'saveToDisk'
  | 'closeBook'
  | 'snapshotHistory'
  | 'toggleRenderMode'
  | 'toggleCharacterPanel'
  | 'toggleNotesPanel'
  | 'insertStatMarker'
  | 'insertNote'
  | 'exportBook'
  | 'findInBook'
  | 'openFile'
  | 'toggleVim'

export interface KeyCombo {
  key: string  // e.g. 'f', 's', 'h'
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export type KeyMap = Partial<Record<ActionName, KeyCombo>>

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

export const ACTION_LABELS: Record<ActionName, string> = {
  toggleTypewriter: 'Toggle typewriter mode',
  toggleFileTree: 'Toggle file tree',
  saveToDisk: 'Save to disk',
  closeBook: 'Open New Book',
  snapshotHistory: 'Snapshot history',
  toggleRenderMode: 'Cycle Presentation',
  toggleCharacterPanel: 'Toggle Character Panel',
  toggleNotesPanel: 'Toggle Notes Panel',
  insertStatMarker: 'Insert stat change',
  insertNote: 'Insert Note',
  exportBook: 'Export book',
  findInBook: 'Find in book',
  openFile: 'Open file',
  toggleVim: 'Toggle VIM mode',
}

export const DEFAULT_KEYMAP: KeyMap = {
  toggleTypewriter: { key: 'm', ctrl: true, shift: true },
  toggleFileTree: { key: 'b', ctrl: true },
  saveToDisk: { key: 's', ctrl: true },
  closeBook: { key: 'o', ctrl: true },
  snapshotHistory: { key: 'h', ctrl: true, shift: true },
  toggleRenderMode: { key: 'p', ctrl: true, shift: true },
  toggleCharacterPanel: { key: 'c', ctrl: true, shift: true },
  toggleNotesPanel: { key: 'j', ctrl: true, shift: true },
  insertStatMarker: { key: '.', ctrl: true, shift: true },
  insertNote: { key: 'n', ctrl: true, shift: true },
  exportBook: { key: 'e', ctrl: true, shift: true },
  findInBook: { key: 'f', ctrl: true, shift: true },
  toggleVim: { key: 'v', ctrl: true, alt: true },
}

export function comboToString(combo: KeyCombo): string {
  const mod = isMac ? '\u2318' : 'Ctrl'
  const parts: string[] = []
  if (combo.ctrl) parts.push(mod)
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push(isMac ? '\u2325' : 'Alt')
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key)
  return parts.join('+')
}

// Unshifted character for punctuation/digit/letter keys, by physical key. Used
// as a fallback when Shift or (mac) Option has rewritten e.key — e.g.
// Ctrl+Shift+. reports '>' and Cmd+Opt+V reports '√' on a US layout.
const CODE_TO_KEY: Record<string, string> = {
  Period: '.',
  Comma: ',',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
}

function keyFromCode(code: string): string | null {
  if (code in CODE_TO_KEY) return CODE_TO_KEY[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  return null
}

/**
 * A binding's `ctrl` means the platform's primary modifier: Cmd on mac, Ctrl
 * elsewhere. The other one must not be held, so mac Ctrl-combos (VIM's Ctrl-O,
 * Ctrl-B, …) never trigger app shortcuts.
 */
function primaryModifier(e: KeyboardEvent, mac: boolean): { primary: boolean; other: boolean } {
  return mac
    ? { primary: e.metaKey, other: e.ctrlKey }
    : { primary: e.ctrlKey, other: e.metaKey }
}

export function matchesEvent(combo: KeyCombo, e: KeyboardEvent, mac = isMac): boolean {
  const wantsCtrl = combo.ctrl ?? false
  const wantsShift = combo.shift ?? false
  const wantsAlt = combo.alt ?? false
  const { primary, other } = primaryModifier(e, mac)
  if (other) return false
  if (primary !== wantsCtrl) return false
  if (e.shiftKey !== wantsShift) return false
  if (e.altKey !== wantsAlt) return false
  const want = combo.key.toLowerCase()
  // e.key first so non-QWERTY layouts keep working; physical key as fallback.
  if (e.key.toLowerCase() === want) return true
  return keyFromCode(e.code) === want
}

export function comboFromEvent(e: KeyboardEvent, mac = isMac): KeyCombo | null {
  const key = e.key
  // Ignore bare modifier keys
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(key)) return null
  const { primary, other } = primaryModifier(e, mac)
  // The non-primary control key can't be represented in a binding.
  if (other) return null
  // Record the unshifted / un-Option'd key so the binding matches later.
  const normalized = (e.shiftKey || e.altKey) && key.length === 1
    ? keyFromCode(e.code) ?? key.toLowerCase()
    : key.toLowerCase()
  return {
    key: normalized,
    ...(primary ? { ctrl: true } : {}),
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
  }
}

/**
 * Global shortcuts must not steal keys the editor already handled
 * (defaultPrevented), and while VIM mode is on, plain Ctrl-combos typed in the
 * editor belong to VIM (Ctrl-O jump back, Ctrl-B page up, …).
 */
export function shouldSkipGlobalShortcut(
  e: KeyboardEvent,
  ctx: { vimMode: boolean; inEditor: boolean },
): boolean {
  if (e.defaultPrevented) return true
  if (ctx.vimMode && ctx.inEditor && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) return true
  return false
}

interface KeybindingState {
  keymap: KeyMap
  setBinding: (action: ActionName, combo: KeyCombo) => void
  resetAll: () => void
}

const localforageStorage = localforageJSONStorage<KeybindingState>()

export const useKeybindingStore = create<KeybindingState>()(
  persist(
    (set) => ({
      keymap: { ...DEFAULT_KEYMAP },
      setBinding: (action: ActionName, combo: KeyCombo) =>
        set((state) => ({
          keymap: { ...state.keymap, [action]: combo },
        })),
      resetAll: () => set({ keymap: { ...DEFAULT_KEYMAP } }),
    }),
    {
      name: 'writinator-keybindings',
      version: 2,
      storage: localforageStorage,
      partialize: (state) => ({ keymap: state.keymap }) as unknown as KeybindingState,
      // v2: P and E were swapped (P → presentation, E → export), and publishStorylet
      // was removed. Reset to defaults on upgrade so the new shortcuts take effect
      // cleanly rather than colliding with pre-existing user bindings.
      migrate: (_persisted, version) => {
        if (version < 2) return { keymap: { ...DEFAULT_KEYMAP } } as unknown as KeybindingState
        return _persisted as KeybindingState
      },
      // Merge persisted keymap over defaults so new actions added in later
      // versions receive their default bindings without requiring a reset.
      merge: (persisted, current) => {
        const p = persisted as Partial<KeybindingState> | undefined
        return {
          ...current,
          keymap: { ...DEFAULT_KEYMAP, ...(p?.keymap ?? {}) },
        }
      },
    }
  )
)
