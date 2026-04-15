import { useState, useSyncExternalStore } from 'react'
import {
  subscribeHandle,
  getHandleState,
  restoreStoredFileHandleFromRecents,
  openFile,
} from '../../lib/fileSystem'
import { useStoryletStore } from '../../stores/storyletStore'
import { useRecentFilesStore } from '../../stores/recentFilesStore'
import { showToast } from '../../stores/genericToastStore'

// requestPermission is a Chrome-only extension to the File System Access API
// not yet in the TypeScript lib types.
interface FileSystemHandleWithPermission extends FileSystemFileHandle {
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

export function FileConnectionBanner() {
  const [reconnectDismissed, setReconnectDismissed] = useState(false)

  const handleState = useSyncExternalStore(subscribeHandle, getHandleState)
  const book = useStoryletStore((s) => s.book)
  const recentFiles = useRecentFilesStore((s) => s.recentFiles)

  // No book loaded — banner is only for active book context
  if (!book) return null

  // Already connected and permission granted — hide banner
  if (handleState.hasHandle && handleState.permission === 'granted') return null

  const mostRecent = recentFiles.length > 0 ? recentFiles[0] : null

  // Reconnect dismissed for this session
  if (reconnectDismissed && mostRecent) return null

  async function handleConnect() {
    if (!book) return
    try {
      const parsed = await openFile()
      if (!parsed) return
      await useStoryletStore.getState().loadFile(parsed)
      useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
      showToast(`Connected to file — your previous work saved as an orphan snapshot.`, 'success')
    } catch (err) {
      console.error('Failed to connect file:', err)
      showToast('Failed to open file. See console for details.', 'warning')
    }
  }

  async function handleReconnect() {
    if (!mostRecent) return
    const handleWithPermission = mostRecent.handle as FileSystemHandleWithPermission | null
    if (!handleWithPermission || typeof handleWithPermission.requestPermission !== 'function') {
      showToast('Saved file reference is no longer valid — please reconnect manually.', 'warning')
      useRecentFilesStore.getState().removeRecent(mostRecent.name)
      return
    }
    try {
      const permission = await handleWithPermission.requestPermission({ mode: 'readwrite' })
      if (permission === 'granted') {
        const ok = await restoreStoredFileHandleFromRecents()
        if (!ok) {
          showToast('Reconnect completed but the handle could not be restored.', 'warning')
        }
      } else {
        showToast('Permission was not granted.', 'warning')
      }
    } catch (err) {
      console.error('Failed to reconnect file handle:', err)
      showToast('Failed to reconnect file. See console for details.', 'warning')
    }
  }

  // Reconnect variant: no current handle but there's a recent file
  if (!handleState.hasHandle && mostRecent) {
    return (
      <div className="w-full bg-gray-800 border-b border-gray-700 text-gray-200 text-sm px-4 py-2 flex items-center justify-between shrink-0">
        <span className="text-gray-400">
          Reconnect to <span className="text-gray-200 font-medium">{mostRecent.name}</span>?
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void handleReconnect() }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition-colors"
          >
            Reconnect
          </button>
          <button
            onClick={() => setReconnectDismissed(true)}
            className="text-gray-500 hover:text-gray-300 px-3 py-1 rounded text-xs transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  // Untethered variant: no handle, no recents — always visible
  return (
    <div className="w-full bg-gray-800 border-b border-gray-700 text-gray-200 text-sm px-4 py-2 flex items-center justify-between shrink-0">
      <span className="text-gray-400">
        Not saved to a file — changes live only in browser storage.
      </span>
      <button
        onClick={() => { void handleConnect() }}
        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition-colors"
      >
        Connect to file…
      </button>
    </div>
  )
}
