import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import * as localforage from 'localforage'

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Clear any stale data from previous app versions (TipTap era)
    // that might have incompatible data formats
    async function init() {
      try {
        const raw = await localforage.getItem('writinator-document')
        if (raw) {
          // Check if data is from old format (TipTap JSONContent)
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          const book = parsed?.state?.book
          // Support both old `chapters` and new `documents` field names
          const docs = book?.documents ?? book?.chapters
          if (docs?.some((d: Record<string, unknown>) => d.content && typeof d.content !== 'string')) {
            console.warn('Clearing incompatible data from previous app version')
            await localforage.removeItem('writinator-document')
            await localforage.removeItem('writinator-editor')
          }
        }
      } catch {
        // If parsing fails, clear corrupt data
        await localforage.removeItem('writinator-document')
        await localforage.removeItem('writinator-editor')
      }
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return null
  return <AppShell />
}
