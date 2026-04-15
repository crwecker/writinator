import { useRecentFilesStore } from '../../stores/recentFilesStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { openFile, setStoredFileHandle, parseFileJSON } from '../../lib/fileSystem'
import type { RecentFile } from '../../types'

// requestPermission is a Chrome-only extension to the File System Access API
// not yet in the TypeScript lib types.
interface FileSystemHandleWithPermission extends FileSystemFileHandle {
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6 2h4a1 1 0 0 1 1 1H5a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 4.5h12v1H13l-.8 7.2A1 1 0 0 1 11.2 14H4.8a1 1 0 0 1-1-.3L3 5.5H2v-1Zm2.06 1 .74 6.5h6.4l.74-6.5H4.06Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function LandingPage() {
  const recentFiles = useRecentFilesStore((s) => s.recentFiles)

  async function handleCreateBook() {
    useStoryletStore.getState().createBook('Untitled Book')
  }

  async function handleOpenFile() {
    try {
      const result = await openFile()
      if (result !== null) {
        await useStoryletStore.getState().loadFile(result)
        useStoryletStore.getState().setLastSaved(result.saveCounter, Date.now())
      }
    } catch {
      // swallow user-cancel errors
    }
  }

  async function handleOpenRecent(file: RecentFile) {
    try {
      const handleWithPermission = file.handle as FileSystemHandleWithPermission
      if (typeof handleWithPermission.requestPermission !== 'function') {
        throw new Error('Recent file handle is invalid (dead reference)')
      }
      const permission = await handleWithPermission.requestPermission({ mode: 'readwrite' })
      if (permission !== 'granted') {
        console.warn('Permission not granted for file:', file.name)
        return
      }
      const fileData = await file.handle.getFile()
      const text = await fileData.text()
      const parsed = parseFileJSON(text)
      if (!parsed) throw new Error('Could not parse file')
      setStoredFileHandle(file.handle)
      useRecentFilesStore.getState().addRecent({
        handle: file.handle,
        name: file.name,
        lastOpenedAt: Date.now(),
      })
      await useStoryletStore.getState().loadFile(parsed)
      useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
    } catch (err) {
      console.error('Failed to open recent file:', err)
      useRecentFilesStore.getState().removeRecent(file.name)
    }
  }

  function handleRemoveRecent(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    useRecentFilesStore.getState().removeRecent(name)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg-darker text-gray-200 animate-fade-in">
      <div className="max-w-md w-full px-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold">Writinator</h1>
          <p className="text-gray-400 text-lg">Write your book.</p>
        </div>

        <div className="space-y-3">
          <button
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            onClick={handleCreateBook}
          >
            Create New Book
          </button>
          <button
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            onClick={handleOpenFile}
          >
            Open Book from Disk
          </button>
        </div>

        {recentFiles.length > 0 && (
          <div className="pt-2">
            <p className="text-gray-500 text-xs uppercase font-medium tracking-wider mb-2">
              Recent
            </p>
            <div>
              {recentFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between gap-3 p-3 rounded hover:bg-bg-dark transition-colors cursor-pointer group"
                  onClick={() => { void handleOpenRecent(file) }}
                >
                  <div className="min-w-0">
                    <p className="text-gray-200 truncate text-sm">{file.name}</p>
                    <p className="text-gray-500 text-xs">{formatRelativeTime(file.lastOpenedAt)}</p>
                  </div>
                  <button
                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => handleRemoveRecent(e, file.name)}
                    aria-label={`Remove ${file.name} from recents`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
