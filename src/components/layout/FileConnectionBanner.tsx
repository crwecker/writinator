import {
  getHandleState,
  restoreStoredFileHandleFromRecents,
  openFile,
} from '../../lib/fileSystem'
import { useIsFileLocked } from '../../lib/fileLock'
import { useStoryletStore } from '../../stores/storyletStore'
import { useRecentFilesStore } from '../../stores/recentFilesStore'
import { showToast } from '../../stores/genericToastStore'

// requestPermission is a Chrome-only extension to the File System Access API
// not yet in the TypeScript lib types.
interface FileSystemHandleWithPermission extends FileSystemFileHandle {
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

export function FileConnectionBanner() {
  const locked = useIsFileLocked()
  const recentFiles = useRecentFilesStore((s) => s.recentFiles)

  // Banner state matches editor lock state 1:1 so they can never disagree.
  if (!locked) return null

  const handleState = getHandleState()
  const mostRecent = recentFiles.length > 0 ? recentFiles[0] : null

  async function handleConnect() {
    if (!useStoryletStore.getState().book) return
    try {
      const parsed = await openFile()
      if (!parsed) return
      await useStoryletStore.getState().loadFile(parsed)
      useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
      showToast('Connected to file.', 'success')
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

  const bannerClass =
    'w-full bg-amber-900/40 border-b border-amber-500/60 text-amber-100 text-sm px-4 py-2 flex items-center justify-between shrink-0'

  // Reconnect variant: no current handle, recent file available
  if (!handleState.hasHandle && mostRecent) {
    return (
      <div className={bannerClass} role="alert">
        <span>
          <span className="font-semibold text-amber-300">Read-only —</span>{' '}
          reconnect to <span className="font-medium text-amber-50">{mostRecent.name}</span> to edit.
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void handleReconnect() }}
            className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-medium px-3 py-1 rounded text-xs transition-colors"
          >
            Reconnect
          </button>
          <button
            onClick={() => { void handleConnect() }}
            className="text-amber-200 hover:text-amber-50 px-3 py-1 rounded text-xs transition-colors"
          >
            Open different file…
          </button>
        </div>
      </div>
    )
  }

  // Untethered variant: no handle, no recents — always visible
  return (
    <div className={bannerClass} role="alert">
      <span>
        <span className="font-semibold text-amber-300">Read-only —</span>{' '}
        not saved to a file. Connect to start editing.
      </span>
      <button
        onClick={() => { void handleConnect() }}
        className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-medium px-3 py-1 rounded text-xs transition-colors"
      >
        Connect to file…
      </button>
    </div>
  )
}
