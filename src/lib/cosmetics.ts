import type { ItemRarity } from '../types'

/**
 * Cosmetics: coin sinks that change how the app looks or sounds, never the
 * rules. Ownership and selection live in `cosmeticsStore`.
 */
export type CosmeticKind = 'theme' | 'cursor' | 'frame' | 'font' | 'sound'

export interface BaseCosmetic {
  id: string
  kind: CosmeticKind
  name: string
  description: string
  price: number
  rarity: ItemRarity
  icon: string
}

export interface EditorThemeColors {
  /** Writing-surface background. */
  bg: string
  text: string
  /** Placeholder and markdown punctuation. */
  muted: string
  caret: string
  selection: string
  /** Inline code background. */
  codeBg: string
  /** Light surfaces need CodeMirror's light base theme. */
  light: boolean
}

export interface EditorThemeCosmetic extends BaseCosmetic {
  kind: 'theme'
  /** null = the app's built-in look. */
  colors: EditorThemeColors | null
  /** Swatch for the store tile. */
  swatch: [string, string]
}

export type CursorShape = 'line' | 'block' | 'underline' | 'glow'

export interface CursorCosmetic extends BaseCosmetic {
  kind: 'cursor'
  shape: CursorShape
}

export interface FrameCosmetic extends BaseCosmetic {
  kind: 'frame'
  /** Full literal Tailwind classes for the gallery picture border. */
  className: string
}

export interface FontCosmetic extends BaseCosmetic {
  kind: 'font'
  /** Google Fonts family name (loaded at runtime only when selected). */
  family: string
  /** css2 axis spec, e.g. "ital,wght@0,400;0,700;1,400". */
  axes: string
  /** CSS font-family value. */
  cssFamily: string
}

export type SoundId = 'typewriter' | 'rain' | 'fire' | 'tavern'
/** Background soundscapes (everything but key sounds). */
export type AmbientId = Exclude<SoundId, 'typewriter'>

export const AMBIENT_IDS: AmbientId[] = ['rain', 'fire', 'tavern']

export interface SoundCosmetic extends BaseCosmetic {
  kind: 'sound'
  sound: SoundId
  /** Key sounds play while typing; ambient loops in the background. */
  type: 'keys' | 'ambient'
}

export type Cosmetic = EditorThemeCosmetic | CursorCosmetic | FrameCosmetic | FontCosmetic | SoundCosmetic

export const DEFAULT_THEME_ID = 'theme-guild'
export const DEFAULT_CURSOR_ID = 'cursor-line'
export const DEFAULT_FRAME_ID = 'frame-oak'

export const EDITOR_THEMES: EditorThemeCosmetic[] = [
  {
    id: DEFAULT_THEME_ID,
    kind: 'theme',
    name: 'Guild Slate',
    description: 'The familiar dark writing desk.',
    price: 0,
    rarity: 'common',
    icon: '🪨',
    colors: null,
    swatch: ['#3C3C3C', '#96c0b7'],
  },
  {
    id: 'theme-parchment',
    kind: 'theme',
    name: 'Parchment',
    description: 'Warm cream paper and iron-gall ink.',
    price: 300,
    rarity: 'uncommon',
    icon: '📜',
    colors: {
      bg: '#f2e8cf',
      text: '#3a2e1f',
      muted: '#8c7b5e',
      caret: '#8b4513',
      selection: 'rgba(139, 69, 19, 0.22)',
      codeBg: 'rgba(58, 46, 31, 0.08)',
      light: true,
    },
    swatch: ['#f2e8cf', '#8b4513'],
  },
  {
    id: 'theme-midnight-ink',
    kind: 'theme',
    name: 'Midnight Ink',
    description: 'Deep blue-black, like a well of fresh ink.',
    price: 300,
    rarity: 'uncommon',
    icon: '🖋️',
    colors: {
      bg: '#0f1424',
      text: '#d6ddef',
      muted: '#66708c',
      caret: '#8fb3ff',
      selection: 'rgba(143, 179, 255, 0.25)',
      codeBg: 'rgba(143, 179, 255, 0.10)',
      light: false,
    },
    swatch: ['#0f1424', '#8fb3ff'],
  },
  {
    id: 'theme-forest',
    kind: 'theme',
    name: 'Forest',
    description: 'Moss and pine for long woodland chapters.',
    price: 400,
    rarity: 'rare',
    icon: '🌲',
    colors: {
      bg: '#16221a',
      text: '#d8e6d2',
      muted: '#6f8a72',
      caret: '#9bd18b',
      selection: 'rgba(155, 209, 139, 0.25)',
      codeBg: 'rgba(155, 209, 139, 0.10)',
      light: false,
    },
    swatch: ['#16221a', '#9bd18b'],
  },
  {
    id: 'theme-ember',
    kind: 'theme',
    name: 'Ember',
    description: 'Hearth-glow browns with a coal-orange caret.',
    price: 400,
    rarity: 'rare',
    icon: '🔥',
    colors: {
      bg: '#22150f',
      text: '#f0dccb',
      muted: '#8f705c',
      caret: '#ff9a52',
      selection: 'rgba(255, 154, 82, 0.25)',
      codeBg: 'rgba(255, 154, 82, 0.10)',
      light: false,
    },
    swatch: ['#22150f', '#ff9a52'],
  },
]

export const CURSOR_STYLES: CursorCosmetic[] = [
  { id: DEFAULT_CURSOR_ID, kind: 'cursor', name: 'Quill Line', description: 'A thin line caret.', price: 0, rarity: 'common', icon: '│', shape: 'line' },
  { id: 'cursor-block', kind: 'cursor', name: 'Block Caret', description: 'A soft block, like an old terminal.', price: 150, rarity: 'uncommon', icon: '▮', shape: 'block' },
  { id: 'cursor-underline', kind: 'cursor', name: 'Underline Caret', description: 'Sits beneath the next letter.', price: 150, rarity: 'uncommon', icon: '▁', shape: 'underline' },
  { id: 'cursor-glow', kind: 'cursor', name: 'Glowing Caret', description: 'A caret that glows like a candle wick.', price: 250, rarity: 'rare', icon: '✦', shape: 'glow' },
]

export const GALLERY_FRAMES: FrameCosmetic[] = [
  { id: DEFAULT_FRAME_ID, kind: 'frame', name: 'Oak Frame', description: 'Plain dark oak.', price: 0, rarity: 'common', icon: '🖼️', className: 'border-4 border-amber-950' },
  { id: 'frame-dark-wood', kind: 'frame', name: 'Dark Walnut', description: 'A thick, nearly black walnut frame.', price: 200, rarity: 'uncommon', icon: '🪵', className: 'border-[6px] border-[#2a1a10] shadow-[inset_0_0_0_1px_rgba(120,72,30,0.6)]' },
  { id: 'frame-silver', kind: 'frame', name: 'Silver Filigree', description: 'Polished silver for your best pictures.', price: 300, rarity: 'rare', icon: '🥈', className: 'border-4 border-slate-300 ring-1 ring-slate-500' },
  { id: 'frame-gold-leaf', kind: 'frame', name: 'Gold Leaf', description: 'Gilded edges fit for a royal gallery.', price: 400, rarity: 'epic', icon: '🥇', className: 'border-4 border-amber-400 ring-2 ring-amber-700' },
]

export const EDITOR_FONTS: FontCosmetic[] = [
  { id: 'font-eb-garamond', kind: 'font', name: 'EB Garamond', description: 'A classic old-style book face.', price: 250, rarity: 'uncommon', icon: '𝔊', family: 'EB Garamond', axes: 'ital,wght@0,400;0,700;1,400', cssFamily: "'EB Garamond', serif" },
  { id: 'font-crimson-pro', kind: 'font', name: 'Crimson Pro', description: 'A crisp, bookish serif for long reading.', price: 250, rarity: 'uncommon', icon: 'C', family: 'Crimson Pro', axes: 'ital,wght@0,400;0,700;1,400', cssFamily: "'Crimson Pro', serif" },
  { id: 'font-literata', kind: 'font', name: 'Literata', description: 'Designed for e-books; calm on screen.', price: 250, rarity: 'uncommon', icon: 'L', family: 'Literata', axes: 'ital,wght@0,400;0,700;1,400', cssFamily: "'Literata', serif" },
  { id: 'font-plex-mono', kind: 'font', name: 'Plex Mono (iA-style)', description: 'The typeface iA Writer’s fonts grew from — focused, typewriter-like.', price: 250, rarity: 'uncommon', icon: 'M', family: 'IBM Plex Mono', axes: 'ital,wght@0,400;0,700;1,400', cssFamily: "'IBM Plex Mono', monospace" },
]

export const SOUNDS: SoundCosmetic[] = [
  { id: 'sound-typewriter', kind: 'sound', name: 'Typewriter Keys', description: 'A soft mechanical click as you type.', price: 300, rarity: 'uncommon', icon: '⌨️', sound: 'typewriter', type: 'keys' },
  { id: 'sound-rain', kind: 'sound', name: 'Rain on the Roof', description: 'Gentle, steady rainfall.', price: 350, rarity: 'rare', icon: '🌧️', sound: 'rain', type: 'ambient' },
  { id: 'sound-fire', kind: 'sound', name: 'Crackling Hearth', description: 'A low fire with the odd crackle.', price: 350, rarity: 'rare', icon: '🪵', sound: 'fire', type: 'ambient' },
  { id: 'sound-tavern', kind: 'sound', name: 'Tavern Hum', description: 'A warm, distant murmur of a busy inn.', price: 350, rarity: 'rare', icon: '🍺', sound: 'tavern', type: 'ambient' },
]

export const COSMETICS: Cosmetic[] = [...EDITOR_THEMES, ...CURSOR_STYLES, ...GALLERY_FRAMES, ...EDITOR_FONTS, ...SOUNDS]

export function getCosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id)
}

export function getEditorTheme(id: string): EditorThemeCosmetic {
  return EDITOR_THEMES.find((t) => t.id === id) ?? EDITOR_THEMES[0]
}

export function getCursorStyle(id: string): CursorCosmetic {
  return CURSOR_STYLES.find((c) => c.id === id) ?? CURSOR_STYLES[0]
}

export function getGalleryFrame(id: string): FrameCosmetic {
  return GALLERY_FRAMES.find((f) => f.id === id) ?? GALLERY_FRAMES[0]
}

export function getEditorFont(id: string | null): FontCosmetic | undefined {
  return id === null ? undefined : EDITOR_FONTS.find((f) => f.id === id)
}

export function getSoundBySoundId(sound: SoundId): SoundCosmetic | undefined {
  return SOUNDS.find((s) => s.sound === sound)
}
