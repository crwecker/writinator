import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'

export type ActionName =
  | 'toggleTypewriter'
  | 'toggleFileTree'
  | 'saveToDisk'
  | 'closeBook'
  | 'snapshotHistory'
  | 'toggleRenderMode'

export interface KeyCombo {
  key: string  // e.g. 'f', 's', 'h'
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export type KeyMap = Record<ActionName, KeyCombo>

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

export const ACTION_LABELS: Record<ActionName, string> = {
  toggleTypewriter: 'Toggle typewriter mode',
  toggleFileTree: 'Toggle file tree',
  saveToDisk: 'Save to disk',
  closeBook: 'Close Book',
  snapshotHistory: 'Snapshot history',
  toggleRenderMode: 'Toggle source/rendered',
}

export const DEFAULT_KEYMAP: KeyMap = {
  toggleTypewriter: { key: 'f', ctrl: true, shift: true },
  toggleFileTree: { key: 'b', ctrl: true },
  saveToDisk: { key: 's', ctrl: true },
  closeBook: { key: 'o', ctrl: true },
  snapshotHistory: { key: 'h', ctrl: true, shift: true },
  toggleRenderMode: { key: 'e', ctrl: true, shift: true },
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

export function matchesEvent(combo: KeyCombo, e: KeyboardEvent): boolean {
  const wantsCtrl = combo.ctrl ?? false
  const wantsShift = combo.shift ?? false
  const wantsAlt = combo.alt ?? false
  const hasCtrl = e.ctrlKey || e.metaKey
  if (hasCtrl !== wantsCtrl) return false
  if (e.shiftKey !== wantsShift) return false
  if (e.altKey !== wantsAlt) return false
  return e.key.toLowerCase() === combo.key.toLowerCase()
}

export function comboFromEvent(e: KeyboardEvent): KeyCombo | null {
  const key = e.key
  // Ignore bare modifier keys
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(key)) return null
  return {
    key: key.toLowerCase(),
    ...(e.ctrlKey || e.metaKey ? { ctrl: true } : {}),
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
  }
}

interface KeybindingState {
  keymap: KeyMap
  setBinding: (action: ActionName, combo: KeyCombo) => void
  resetAll: () => void
}

const localforageStorage = createJSONStorage<KeybindingState>(() => ({
  getItem: async (name: string) => {
    const value = await localforage.getItem<string>(name)
    return value
  },
  setItem: async (name: string, value: string) => {
    await localforage.setItem(name, value)
  },
  removeItem: async (name: string) => {
    await localforage.removeItem(name)
  },
}))

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
      storage: localforageStorage,
      partialize: (state) => ({ keymap: state.keymap }) as unknown as KeybindingState,
    }
  )
)
