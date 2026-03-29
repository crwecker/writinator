export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'REPLACE'

interface VimStatusLineProps {
  mode: VimMode
}

const modeColors: Record<string, string> = {
  NORMAL: 'bg-blue-400 text-gray-950',
  INSERT: 'bg-opal-100 text-gray-950',
  VISUAL: 'bg-coral-100 text-gray-950',
  REPLACE: 'bg-coral-100 text-gray-950',
}

export default function VimStatusLine({ mode }: VimStatusLineProps) {
  const colors = modeColors[mode] ?? modeColors.NORMAL
  return (
    <span className={`rounded px-2 py-0.5 font-mono font-bold text-xs ${colors}`}>
      -- {mode} --
    </span>
  )
}
