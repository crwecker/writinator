import { useState, useEffect, useRef, useMemo } from 'react'
import type { EditorView } from '@codemirror/view'
import { useStoryletStore } from '../../stores/storyletStore'
import { compileQuery, computeReplacePreview, searchBook } from '../../lib/bookSearch'
import { snapshotBook } from '../../stores/snapshotStore'
import type {
  ReplacePreview,
  ReplaceScope,
  SearchOptions,
  StoryletSearchResult,
} from '../../types'
import { ReplacePreviewModal } from './ReplacePreviewModal'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
}

export function FindInBook({ open, onClose, editorView }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setActiveStorylet = useStoryletStore((s) => s.setActiveStorylet)

  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [scope, setScope] = useState<ReplaceScope>('book')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previews, setPreviews] = useState<ReplacePreview[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Debounce query (150ms)
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(handle)
  }, [query])

  // Autofocus on open
  useEffect(() => {
    if (open) {
      // Defer to next tick so the panel is mounted before focusing
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Click outside to close — but ignore clicks while preview modal is open
  // (the modal sits at z-[60] above this panel and clicking it shouldn't dismiss find).
  useEffect(() => {
    if (!open || previewOpen) return
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose, previewOpen])

  // Clear stale success message whenever query/replacement/scope changes
  useEffect(() => {
    setSuccessMessage(null)
  }, [query, replacement, scope, caseSensitive, wholeWord, regex])

  const options = useMemo<SearchOptions>(() => ({
    query: debouncedQuery,
    caseSensitive,
    wholeWord,
    regex,
  }), [debouncedQuery, caseSensitive, wholeWord, regex])

  // Treat empty query as "no query entered" — never compile or search.
  const hasQuery = debouncedQuery.length > 0

  const compileError = useMemo<string | null>(() => {
    if (!hasQuery) return null
    const compiled = compileQuery(options)
    return 'error' in compiled ? compiled.error : null
  }, [options, hasQuery])

  const results = useMemo<StoryletSearchResult[]>(() => {
    if (!book || !hasQuery || compileError) return []
    return searchBook(book, options)
  }, [book, options, hasQuery, compileError])

  const totalMatches = useMemo(
    () => results.reduce((sum, r) => sum + r.matches.length, 0),
    [results]
  )

  function handleOpenPreview() {
    if (!book || !hasQuery || compileError) return
    const computed = computeReplacePreview(
      book,
      options,
      replacement,
      scope,
      scope === 'storylet' ? activeStoryletId ?? undefined : undefined,
    )
    setPreviews(computed)
    setSuccessMessage(null)
    setPreviewOpen(true)
  }

  async function handleConfirmReplace() {
    if (submitting) return
    const currentBook = useStoryletStore.getState().book
    if (!currentBook) return
    setSubmitting(true)
    try {
      await snapshotBook(currentBook, 'bulkReplace')
      const result = useStoryletStore.getState().replaceAllInBook(
        options,
        replacement,
        scope,
        scope === 'storylet' ? activeStoryletId ?? undefined : undefined,
      )
      setPreviewOpen(false)
      setPreviews([])
      setSuccessMessage(
        `Replaced ${result.matchesReplaced} ${result.matchesReplaced === 1 ? 'match' : 'matches'} in ${result.storyletsChanged} ${result.storyletsChanged === 1 ? 'storylet' : 'storylets'}. Snapshot saved.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleJump(storyletId: string, start: number) {
    if (!editorView) return
    if (storyletId !== activeStoryletId) {
      setActiveStorylet(storyletId)
      setTimeout(() => {
        const v = editorView
        if (!v) return
        const len = v.state.doc.length
        const pos = Math.min(start, len)
        v.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
        v.focus()
      }, 30)
    } else {
      const len = editorView.state.doc.length
      const pos = Math.min(start, len)
      editorView.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
      editorView.focus()
    }
  }

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-50 w-[380px] max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Find in book</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* Search controls */}
      <div className="px-4 py-3 border-b border-gray-700 flex flex-col gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the whole book..."
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500 w-full"
        />
        <div className="flex items-center gap-1.5">
          <ToggleButton
            active={caseSensitive}
            onClick={() => setCaseSensitive((v) => !v)}
            title="Case sensitive"
            label="Aa"
          />
          <ToggleButton
            active={wholeWord}
            onClick={() => setWholeWord((v) => !v)}
            title="Whole word"
            label="\b"
          />
          <ToggleButton
            active={regex}
            onClick={() => setRegex((v) => !v)}
            title="Regular expression"
            label=".*"
          />
        </div>
        {compileError && (
          <div className="text-xs text-red-400 mt-1">{compileError}</div>
        )}
        {hasQuery && !compileError && (
          <div className="text-xs text-gray-500 mt-1">
            {totalMatches} {totalMatches === 1 ? 'match' : 'matches'} in {results.length} {results.length === 1 ? 'storylet' : 'storylets'}
          </div>
        )}
      </div>

      {/* Replace controls */}
      <div className="px-4 py-3 border-b border-gray-700 flex flex-col gap-2">
        <input
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replace with..."
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500 w-full"
        />
        <div className="flex items-center gap-1.5">
          <div className="flex bg-gray-800 rounded overflow-hidden border border-gray-700 text-[11px]">
            <button
              type="button"
              onClick={() => setScope('storylet')}
              disabled={!activeStoryletId}
              className={`px-2 py-1 transition-colors ${
                scope === 'storylet'
                  ? 'bg-emerald-700 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Replace only in the active storylet"
            >
              This storylet
            </button>
            <button
              type="button"
              onClick={() => setScope('book')}
              className={`px-2 py-1 transition-colors ${
                scope === 'book'
                  ? 'bg-emerald-700 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title="Replace in every storylet"
            >
              Whole book
            </button>
          </div>
          <button
            type="button"
            onClick={handleOpenPreview}
            disabled={!hasQuery || !!compileError || results.length === 0}
            className="ml-auto px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            Replace
          </button>
        </div>
        {successMessage && (
          <div className="text-xs text-emerald-400 mt-1">
            {successMessage}{' '}
            <span className="text-gray-500">Open History to revert.</span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!hasQuery ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            Type a query to search the whole book.
          </div>
        ) : compileError ? null : results.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No matches.
          </div>
        ) : (
          results.map((group) => (
            <div key={group.storyletId} className="border-b border-gray-800">
              <div className="px-4 py-1.5 bg-gray-800/50 text-[11px] font-medium text-gray-400 uppercase tracking-wider sticky top-0">
                {group.storyletName}
                <span className="ml-2 text-gray-600 normal-case tracking-normal">
                  {group.matches.length}
                </span>
              </div>
              {group.matches.map((m, idx) => {
                const [hi, hj] = m.matchIndexInSnippet
                const before = m.lineSnippet.slice(0, hi)
                const hit = m.lineSnippet.slice(hi, hj)
                const after = m.lineSnippet.slice(hj)
                return (
                  <button
                    key={`${m.start}-${idx}`}
                    onClick={() => handleJump(group.storyletId, m.start)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-800 border-b border-gray-800 transition-colors text-xs text-gray-400 font-mono whitespace-pre-wrap break-words"
                  >
                    <span className="text-gray-500">{before}</span>
                    <span className="bg-yellow-500/30 text-yellow-100 rounded px-0.5">{hit}</span>
                    <span className="text-gray-500">{after}</span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>

      <ReplacePreviewModal
        open={previewOpen}
        onClose={() => {
          if (!submitting) setPreviewOpen(false)
        }}
        onConfirm={() => void handleConfirmReplace()}
        previews={previews}
        submitting={submitting}
      />
    </div>
  )
}

interface ToggleButtonProps {
  active: boolean
  onClick: () => void
  title: string
  label: string
}

function ToggleButton({ active, onClick, title, label }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
        active
          ? 'bg-emerald-700 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  )
}
