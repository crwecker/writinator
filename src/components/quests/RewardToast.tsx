import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Coins } from 'lucide-react'
import { subscribeToasts, getToastsSnapshot } from './rewardToastStore'
import type { Toast } from './rewardToastStore'

// ── Individual toast item ────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Double rAF ensures initial off-screen state is painted before transition
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      })
    })
    return () => cancelAnimationFrame(raf1)
  }, [])

  return (
    <div
      ref={ref}
      style={{
        opacity: toast.exiting ? 0 : undefined,
        transform: toast.exiting ? 'translateY(8px)' : undefined,
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
      className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-gray-900 px-4 py-2 shadow-lg"
    >
      <Coins size={14} className="text-amber-400 shrink-0" />
      <span className="text-amber-400 font-medium tabular-nums text-sm">
        +{toast.amount} coins
      </span>
      {toast.source && (
        <span className="text-gray-500 text-xs ml-1 border-l border-gray-700 pl-2">
          {toast.source}
        </span>
      )}
    </div>
  )
}

// ── Container component ──────────────────────────────────────────────────────

export function RewardToast() {
  const currentToasts = useSyncExternalStore(subscribeToasts, getToastsSnapshot)

  if (currentToasts.length === 0) return null

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {currentToasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
