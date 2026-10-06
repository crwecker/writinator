import { Compartment, Prec, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { syntaxHighlighting } from '@codemirror/language'
import { oneDarkHighlightStyle, oneDarkTheme } from '@codemirror/theme-one-dark'
import { useCosmeticsStore } from '../stores/cosmeticsStore'
import { useGameSettingsStore } from '../stores/gameSettingsStore'
import { getCursorStyle, getEditorFont, getEditorTheme, type CursorShape, type FontCosmetic } from './cosmetics'
import { keySoundsOn, playKeyClick } from './sound'

/**
 * CodeMirror side of the Armory cosmetics. `editorCosmeticsExtension()` sits
 * where `oneDark` used to in the editor's extensions and provides:
 * - the One Dark chrome + highlighting (chrome dropped for light themes),
 * - color theme + caret style at highest precedence (beats the base theme),
 * - the bought font (ahead of the regular font compartment, so it wins),
 * - typewriter key sounds.
 */
export const cosmeticLookCompartment = new Compartment()
export const cosmeticFontCompartment = new Compartment()
/** One Dark's editor chrome for dark looks; dropped for light ones (Parchment). */
export const cosmeticBaseCompartment = new Compartment()

function cosmeticBase(themeId: string): Extension {
  return getEditorTheme(themeId).colors?.light ? [] : oneDarkTheme
}

const DEFAULT_CARET = 'var(--color-opal-100, #6ee7b7)'
const CARET = `var(--wt-caret, ${DEFAULT_CARET})`

function cursorRules(shape: CursorShape): Record<string, Record<string, string>> {
  switch (shape) {
    case 'line':
      return {}
    case 'block':
      return {
        '.cm-cursor': { borderLeftWidth: '0', width: '0.55em', backgroundColor: CARET, opacity: '0.55' },
      }
    case 'underline':
      return {
        '.cm-cursor': { borderLeftWidth: '0', width: '0.6em', borderBottom: `2px solid ${CARET}` },
      }
    case 'glow':
      return {
        '.cm-cursor': {
          borderLeftWidth: '2px',
          borderLeftColor: CARET,
          boxShadow: `0 0 6px 1px ${CARET}, 0 0 14px 2px ${CARET}`,
        },
      }
  }
}

/** Theme colors + caret shape for the given cosmetic ids. */
export function cosmeticLook(themeId: string, cursorId: string): Extension {
  const theme = getEditorTheme(themeId)
  const cursor = getCursorStyle(cursorId)
  const parts: Extension[] = []
  const c = theme.colors
  if (c) {
    parts.push(
      EditorView.theme(
        {
          '&': { backgroundColor: c.bg, color: c.text, '--wt-caret': c.caret },
          '.cm-content': { caretColor: c.caret },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.caret },
          '.cm-placeholder': { color: c.muted },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, & .cm-selectionBackground': {
            backgroundColor: `${c.selection} !important`,
          },
          '.cm-selectionMatch': { backgroundColor: `${c.selection} !important` },
          '.cm-md-code': { backgroundColor: c.codeBg },
          '.cm-activeLine': { backgroundColor: 'transparent' },
        },
        { dark: !c.light },
      ),
    )
  }
  const rules = cursorRules(cursor.shape)
  if (Object.keys(rules).length > 0) parts.push(EditorView.theme(rules))
  return Prec.highest(parts)
}

// ---------------------------------------------------------------------------
// Fonts — fetched from Google Fonts only when a bought font is chosen.
// ---------------------------------------------------------------------------

function fontHref(font: FontCosmetic): string {
  return `https://fonts.googleapis.com/css2?family=${font.family.replace(/ /g, '+')}:${font.axes}&display=swap`
}

export function loadCosmeticFont(font: FontCosmetic): void {
  if (typeof document === 'undefined') return
  if (document.head.querySelector(`link[data-cosmetic-font="${font.id}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = fontHref(font)
  link.dataset.cosmeticFont = font.id
  document.head.appendChild(link)
}

/** The chosen bought font (loading it), or nothing for the regular font setting. */
export function cosmeticFont(fontId: string | null): Extension {
  const font = getEditorFont(fontId)
  if (!font || !useCosmeticsStore.getState().isOwned(font.id)) return []
  loadCosmeticFont(font)
  return EditorView.theme({ '.cm-content': { fontFamily: font.cssFamily } })
}

// ---------------------------------------------------------------------------
// Key sounds
// ---------------------------------------------------------------------------

const keySounds = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return
  if (!update.transactions.some((tr) => tr.isUserEvent('input.type'))) return
  if (!keySoundsOn()) return
  playKeyClick(useGameSettingsStore.getState().sound.volume)
})

/** Add to the editor's extensions; reflects the current cosmetics. */
export function editorCosmeticsExtension(): Extension {
  const { editorTheme, cursorStyle, editorFont } = useCosmeticsStore.getState()
  return [
    // Replaces `oneDark` (theme + highlighting) at the same spot in the editor's extensions.
    cosmeticBaseCompartment.of(cosmeticBase(editorTheme)),
    syntaxHighlighting(oneDarkHighlightStyle),
    cosmeticLookCompartment.of(cosmeticLook(editorTheme, cursorStyle)),
    cosmeticFontCompartment.of(cosmeticFont(editorFont)),
    keySounds,
  ]
}

/** Reconfigure the editor whenever cosmetics change. Returns an unsubscribe. */
export function syncEditorCosmetics(getView: () => EditorView | null): () => void {
  return useCosmeticsStore.subscribe((state, prev) => {
    const view = getView()
    if (!view) return
    const effects = []
    if (state.editorTheme !== prev.editorTheme || state.cursorStyle !== prev.cursorStyle) {
      effects.push(cosmeticLookCompartment.reconfigure(cosmeticLook(state.editorTheme, state.cursorStyle)))
      effects.push(cosmeticBaseCompartment.reconfigure(cosmeticBase(state.editorTheme)))
    }
    if (state.editorFont !== prev.editorFont || state.owned !== prev.owned) {
      effects.push(cosmeticFontCompartment.reconfigure(cosmeticFont(state.editorFont)))
    }
    if (effects.length > 0) view.dispatch({ effects })
  })
}
