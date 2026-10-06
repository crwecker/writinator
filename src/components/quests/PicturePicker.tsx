import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ImagePlus, Loader2, X } from 'lucide-react'
import { IMAGE_THEMES, useGameSettingsStore, type ImageTheme } from '../../stores/gameSettingsStore'
import { useCustomPictureStore } from '../../stores/customPictureStore'
import { useProgressionStore } from '../../stores/progressionStore'
import { downscalePicture } from '../../lib/customPicture'

/**
 * "Picture: Theme ▾ / Your picture" — what the next quest reveals. Themes
 * fetch from Unsplash; your own picture (cover art, a portrait…) is used once.
 */
export function PicturePicker() {
  const theme = useGameSettingsStore((s) => s.imageTheme)
  const choice = useProgressionStore((s) => s.pictureChoice)
  const pictures = useCustomPictureStore((s) => s.pictures)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const chosen = choice.kind === 'custom' ? pictures.find((p) => p.id === choice.pictureId) : undefined

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const pic = await downscalePicture(file)
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My picture'
      const id = useCustomPictureStore.getState().addPicture({ name, ...pic })
      useProgressionStore.getState().setPictureChoice({ kind: 'custom', pictureId: id })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that picture.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-900/50 bg-stone-950/75 px-3 py-2 text-sm" data-testid="picture-picker">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-500/80">Next picture</span>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Picture theme</span>
        <select
          value={theme}
          onChange={(e) => {
            useGameSettingsStore.getState().setImageTheme(e.target.value as ImageTheme)
            useProgressionStore.getState().setPictureChoice({ kind: 'theme' })
          }}
          className={`appearance-none rounded-lg border bg-stone-900 py-1 pl-2.5 pr-7 text-sm outline-none transition-colors focus:border-amber-500 ${
            chosen ? 'border-stone-700 text-stone-400' : 'border-amber-700/60 text-amber-100'
          }`}
        >
          {IMAGE_THEMES.map((t) => (
            <option key={t.query} value={t.query}>
              {t.label}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2 text-stone-400" />
      </label>
      <span className="text-xs text-stone-500">or</span>
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors ${
            chosen ? 'border-amber-600 bg-amber-500/10 text-amber-100' : 'border-stone-700 bg-stone-900 text-stone-300 hover:border-amber-600'
          }`}
        >
          {chosen ? (
            <img src={chosen.dataUrl} alt="" className="h-5 w-7 rounded-sm object-cover" />
          ) : (
            <ImagePlus size={14} />
          )}
          {chosen ? chosen.name : 'Your picture'}
        </button>
        {open && (
          <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-amber-800/50 bg-stone-900 p-3 shadow-2xl">
            <p className="mb-2 text-xs text-stone-400">Reveal a picture of your own in the next quest — cover art, a character portrait, a map.</p>
            {pictures.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {pictures.map((p) => {
                  const active = chosen?.id === p.id
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          useProgressionStore.getState().setPictureChoice({ kind: 'custom', pictureId: p.id })
                          setOpen(false)
                        }}
                        title={p.name}
                        className={`block aspect-[4/3] w-full overflow-hidden rounded-md border-2 ${active ? 'border-amber-400' : 'border-stone-700 hover:border-amber-600'}`}
                      >
                        <img src={p.dataUrl} alt={p.name} className="h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() => {
                          useCustomPictureStore.getState().removePicture(p.id)
                          if (active) useProgressionStore.getState().setPictureChoice({ kind: 'theme' })
                        }}
                        className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-stone-950 p-0.5 text-stone-400 ring-1 ring-stone-700 hover:text-red-300 group-hover:block"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-1 text-xs font-semibold text-stone-950 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                Upload a picture
              </button>
              {chosen && (
                <button
                  type="button"
                  onClick={() => {
                    useProgressionStore.getState().setPictureChoice({ kind: 'theme' })
                    setOpen(false)
                  }}
                  className="text-xs text-stone-400 hover:text-stone-200"
                >
                  Use the theme
                </button>
              )}
            </div>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </div>
        )}
      </div>
      {chosen && <span className="text-xs text-stone-400">Your next quest reveals “{chosen.name}”.</span>}
    </div>
  )
}
