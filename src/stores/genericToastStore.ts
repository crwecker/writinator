// Module-level generic toast store — no React dependency.
// Mirror of src/components/quests/rewardToastStore.ts

export type ToastKind = 'info' | 'success' | 'warning'

export interface GenericToast {
  id: string
  message: string
  kind: ToastKind
  exiting: boolean
}

type Listener = () => void

let toasts: GenericToast[] = []
const listeners = new Set<Listener>()

function emitChange() {
  for (const l of listeners) l()
}

export function subscribeGenericToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getGenericToastsSnapshot(): GenericToast[] {
  return toasts
}

let idCounter = 0

export function showToast(message: string, kind: ToastKind = 'info'): void {
  const id = `generic-toast-${Date.now()}-${idCounter++}`
  toasts = [...toasts, { id, message, kind, exiting: false }]
  emitChange()

  // Begin exit animation after 2.7 s, fully remove at 3 s
  setTimeout(() => {
    toasts = toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    emitChange()
  }, 2700)

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emitChange()
  }, 3000)
}
