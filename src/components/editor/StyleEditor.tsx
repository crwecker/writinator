import { useState, useEffect, useRef } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import type { TextStyle, HeadingStyle, NamedStyle } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

function TextStyleFields({
  label,
  style,
  onChange,
}: {
  label: string
  style: TextStyle | undefined
  onChange: (patch: TextStyle) => void
}) {
  return (
    <div className="space-y-2">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-[10px] text-gray-500">Font family</span>
          <input
            type="text"
            value={style?.fontFamily ?? ''}
            onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
            placeholder="'Lora', serif"
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-gray-500">Font size (px)</span>
          <input
            type="number"
            min={10}
            max={48}
            value={style?.fontSize ?? ''}
            onChange={(e) => onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="16"
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-gray-500">Line height</span>
          <input
            type="number"
            min={1.0}
            max={3.0}
            step={0.1}
            value={style?.lineHeight ?? ''}
            onChange={(e) => onChange({ lineHeight: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="1.75"
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-gray-500">Color</span>
          <input
            type="text"
            value={style?.color ?? ''}
            onChange={(e) => onChange({ color: e.target.value || undefined })}
            placeholder="#E6E6E6"
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
          />
        </label>
        <label className="space-y-0.5 col-span-2">
          <span className="text-[10px] text-gray-500">Letter spacing</span>
          <input
            type="text"
            value={style?.letterSpacing ?? ''}
            onChange={(e) => onChange({ letterSpacing: e.target.value || undefined })}
            placeholder="0.02em"
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
          />
        </label>
      </div>
    </div>
  )
}

function HeadingStyleFields({
  label,
  style,
  onChange,
}: {
  label: string
  style: HeadingStyle | undefined
  onChange: (patch: HeadingStyle) => void
}) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div>
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors w-full text-left py-1"
      >
        <span className="text-[8px]">{collapsed ? '\u25B6' : '\u25BC'}</span>
        {label}
      </button>
      {!collapsed && (
        <div className="space-y-2 mt-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font family</span>
              <input
                type="text"
                value={style?.fontFamily ?? ''}
                onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
                placeholder="'Lora', serif"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font size (px)</span>
              <input
                type="number"
                min={10}
                max={48}
                value={style?.fontSize ?? ''}
                onChange={(e) => onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="24"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Line height</span>
              <input
                type="number"
                min={1.0}
                max={3.0}
                step={0.1}
                value={style?.lineHeight ?? ''}
                onChange={(e) => onChange({ lineHeight: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="1.3"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font weight</span>
              <select
                value={style?.fontWeight ?? ''}
                onChange={(e) => onChange({ fontWeight: e.target.value || undefined })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              >
                <option value="">Default</option>
                <option value="400">400</option>
                <option value="500">500</option>
                <option value="600">600</option>
                <option value="700">700</option>
                <option value="800">800</option>
                <option value="900">900</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Color</span>
              <input
                type="text"
                value={style?.color ?? ''}
                onChange={(e) => onChange({ color: e.target.value || undefined })}
                placeholder="#E6E6E6"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Letter spacing</span>
              <input
                type="text"
                value={style?.letterSpacing ?? ''}
                onChange={(e) => onChange({ letterSpacing: e.target.value || undefined })}
                placeholder="0.02em"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

function NamedStyleFields({
  name,
  style,
  onChange,
  onRename,
  onDelete,
}: {
  name: string
  style: NamedStyle
  onChange: (patch: NamedStyle) => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [collapsed, setCollapsed] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(name)

  const commitRename = () => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== name) {
      onRename(trimmed)
    } else {
      setNameValue(name)
    }
    setEditingName(false)
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors flex-1 text-left py-1"
        >
          <span className="text-[8px]">{collapsed ? '\u25B6' : '\u25BC'}</span>
          {editingName ? null : name}
        </button>
        {editingName ? (
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setNameValue(name); setEditingName(false) }
            }}
            autoFocus
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
          />
        ) : (
          <button
            onClick={() => { setNameValue(name); setEditingName(true) }}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            title="Rename"
          >
            Rename
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
          title="Delete"
        >
          Delete
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-2 mt-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font family</span>
              <input
                type="text"
                value={style?.fontFamily ?? ''}
                onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
                placeholder="'Lora', serif"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font size (px)</span>
              <input
                type="number"
                min={10}
                max={48}
                value={style?.fontSize ?? ''}
                onChange={(e) => onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="16"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Line height</span>
              <input
                type="number"
                min={1.0}
                max={3.0}
                step={0.1}
                value={style?.lineHeight ?? ''}
                onChange={(e) => onChange({ lineHeight: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="1.75"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font weight</span>
              <select
                value={style?.fontWeight ?? ''}
                onChange={(e) => onChange({ fontWeight: e.target.value || undefined })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              >
                <option value="">Default</option>
                <option value="400">400</option>
                <option value="500">500</option>
                <option value="600">600</option>
                <option value="700">700</option>
                <option value="800">800</option>
                <option value="900">900</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Font style</span>
              <select
                value={style?.fontStyle ?? ''}
                onChange={(e) => onChange({ fontStyle: e.target.value || undefined })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              >
                <option value="">Default</option>
                <option value="normal">Normal</option>
                <option value="italic">Italic</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Text decoration</span>
              <select
                value={style?.textDecoration ?? ''}
                onChange={(e) => onChange({ textDecoration: e.target.value || undefined })}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              >
                <option value="">None</option>
                <option value="underline">Underline</option>
                <option value="line-through">Line-through</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Color</span>
              <input
                type="text"
                value={style?.color ?? ''}
                onChange={(e) => onChange({ color: e.target.value || undefined })}
                placeholder="#E6E6E6"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-gray-500">Background</span>
              <input
                type="text"
                value={style?.backgroundColor ?? ''}
                onChange={(e) => onChange({ backgroundColor: e.target.value || undefined })}
                placeholder="#333333"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="space-y-0.5 col-span-2">
              <span className="text-[10px] text-gray-500">Letter spacing</span>
              <input
                type="text"
                value={style?.letterSpacing ?? ''}
                onChange={(e) => onChange({ letterSpacing: e.target.value || undefined })}
                placeholder="0.02em"
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export function StyleEditor({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const documentStyles = useDocumentStore((s) => s.documentStyles)
  const updateDocumentStyles = useDocumentStore((s) => s.updateDocumentStyles)
  const clearDocumentStyles = useDocumentStore((s) => s.clearDocumentStyles)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-50 w-[320px] max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Document Styles</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* Body text */}
        <TextStyleFields
          label="Body text"
          style={documentStyles?.body}
          onChange={(patch) => updateDocumentStyles({ body: { ...documentStyles?.body, ...patch } })}
        />

        {/* Headings */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Headings</span>
          <div className="space-y-1 pl-1 border-l border-gray-800">
            <HeadingStyleFields
              label="H1"
              style={documentStyles?.h1}
              onChange={(patch) => updateDocumentStyles({ h1: { ...documentStyles?.h1, ...patch } })}
            />
            <HeadingStyleFields
              label="H2"
              style={documentStyles?.h2}
              onChange={(patch) => updateDocumentStyles({ h2: { ...documentStyles?.h2, ...patch } })}
            />
            <HeadingStyleFields
              label="H3"
              style={documentStyles?.h3}
              onChange={(patch) => updateDocumentStyles({ h3: { ...documentStyles?.h3, ...patch } })}
            />
          </div>
        </div>

        {/* Blockquote */}
        <TextStyleFields
          label="Blockquote"
          style={documentStyles?.blockquote}
          onChange={(patch) => updateDocumentStyles({ blockquote: { ...documentStyles?.blockquote, ...patch } })}
        />

        {/* Code */}
        <TextStyleFields
          label="Code"
          style={documentStyles?.code}
          onChange={(patch) => updateDocumentStyles({ code: { ...documentStyles?.code, ...patch } })}
        />

        {/* Named Styles */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Named Styles</span>
            <button
              onClick={() => {
                const existing = documentStyles?.namedStyles ?? {}
                let idx = 1
                while (existing[`style-${idx}`]) idx++
                const newName = `style-${idx}`
                updateDocumentStyles({
                  namedStyles: { ...existing, [newName]: {} },
                })
              }}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              + Add Style
            </button>
          </div>
          <div className="space-y-1 pl-1 border-l border-gray-800">
            {Object.entries(documentStyles?.namedStyles ?? {}).map(([name, style]) => (
              <NamedStyleFields
                key={name}
                name={name}
                style={style}
                onChange={(patch) => {
                  const existing = documentStyles?.namedStyles ?? {}
                  updateDocumentStyles({
                    namedStyles: { ...existing, [name]: { ...style, ...patch } },
                  })
                }}
                onRename={(newName) => {
                  const existing = documentStyles?.namedStyles ?? {}
                  if (newName === name || existing[newName]) return
                  const { [name]: removed, ...rest } = existing
                  updateDocumentStyles({
                    namedStyles: { ...rest, [newName]: style },
                  })
                }}
                onDelete={() => {
                  const existing = documentStyles?.namedStyles ?? {}
                  const { [name]: removed, ...rest } = existing
                  useDocumentStore.getState().setDocumentStyles({
                    ...documentStyles,
                    namedStyles: rest,
                  })
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-700">
        <button
          onClick={clearDocumentStyles}
          className="w-full px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 rounded transition-colors"
        >
          Clear All Styles
        </button>
      </div>
    </div>
  )
}
