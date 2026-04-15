import { useSyncExternalStore } from 'react'
import {
  subscribeGenericToasts,
  getGenericToastsSnapshot,
  type GenericToast as GenericToastType,
} from '../../stores/genericToastStore'

function ToastItem({ toast }: { toast: GenericToastType }) {
  const accentClass =
    toast.kind === 'success'
      ? 'border-green-400'
      : toast.kind === 'warning'
        ? 'border-amber-400'
        : 'border-blue-400'

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-gray-800 px-4 py-2 shadow-lg pointer-events-none transition-opacity duration-300 ${accentClass} ${toast.exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      <span className="text-gray-200 text-sm">{toast.message}</span>
    </div>
  )
}

export function GenericToast() {
  const toasts = useSyncExternalStore(subscribeGenericToasts, getGenericToastsSnapshot)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
