// Module-level toast store — used by both the hook and the container component.

export interface Toast {
  id: string
  amount: number
  source?: string
  exiting: boolean
}

type Listener = () => void

let toasts: Toast[] = []
const listeners = new Set<Listener>()

function emitChange() {
  for (const l of listeners) l()
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToastsSnapshot(): Toast[] {
  return toasts
}

let idCounter = 0

export function addToast(amount: number, source?: string) {
  const id = `toast-${Date.now()}-${idCounter++}`
  toasts = [...toasts, { id, amount, source, exiting: false }]
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
