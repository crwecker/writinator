import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Minimal React render harness (no @testing-library in this project).
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface Rendered {
  container: HTMLDivElement
  root: Root
  rerender: (ui: ReactNode) => void
  unmount: () => void
}

export function render(ui: ReactNode): Rendered {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(ui))
  return {
    container,
    root,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}
