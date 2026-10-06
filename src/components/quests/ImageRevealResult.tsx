import { useState } from 'react'
import { Loader2, Repeat } from 'lucide-react'
import { PIXEL_LEVELS } from '../../stores/imageRevealStore'
import type { ImageRevealSession } from '../../types'
import { CelebrationCanvas } from './ImageRevealCanvases'
import { PhotographerCredit } from './ImageRevealWidgets'
import { CoinAmount, GuildButton } from './QuestUi'
import { formatMinutes } from './questStyles'
import { chosenMinutes, startChainQuest } from './useAcceptQuest'
import { scaleCoins } from '../../lib/questRewards'

interface ImageRevealResultProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
  onDone: () => void
}

/**
 * Overlay for a session that just ended: "Quest Complete!" / "Time's Up!" for
 * timed quests, "Image Revealed!" for untimed ones — with a one-click
 * "Another 500?" that starts the same quest again.
 */
export function ImageRevealResult({ session, image, onDone }: ImageRevealResultProps) {
  return (
    <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
      <div className="w-80 overflow-hidden rounded-xl border border-amber-900/60 bg-stone-950 shadow-2xl">
        {session.timeMinutes === undefined ? (
          <RevealedBody session={session} image={image} />
        ) : session.result === 'failure' ? (
          <TimedFailureBody session={session} image={image} />
        ) : (
          <TimedSuccessBody session={session} image={image} />
        )}
        <ResultActions session={session} onDone={onDone} />
      </div>
    </div>
  )
}

function ResultActions({ session, onDone }: { session: ImageRevealSession; onDone: () => void }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const minutes = chosenMinutes(session)

  async function chain() {
    if (starting) return
    setStarting(true)
    setError(null)
    try {
      await startChainQuest(session)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the quest.')
      setStarting(false)
    }
  }

  return (
    <div className="border-t border-stone-800 p-2">
      {error && <p className="mb-2 px-1 text-xs text-red-300">{error}</p>}
      <div className="flex items-center gap-2">
        <GuildButton
          className="flex-1"
          onClick={() => void chain()}
          disabled={starting}
          title={`Start another ${session.wordGoal.toLocaleString()}-word quest${minutes !== undefined ? ` with ${formatMinutes(minutes)} on the clock` : ''}`}
        >
          {starting ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
          Another {session.wordGoal.toLocaleString()}?
          {minutes !== undefined && <span className="text-xs font-medium opacity-75">({formatMinutes(minutes)})</span>}
        </GuildButton>
        <GuildButton variant="ghost" onClick={onDone}>
          Done
        </GuildButton>
      </div>
    </div>
  )
}

interface BodyProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
}

/** Everything a successful quest paid: the session's coins plus its board reward. */
function totalPaid(session: ImageRevealSession): number {
  // The board pays its reward scaled by the difficulty preset (scaleCoins).
  return (session.coinsEarned ?? 0) + (session.result === 'success' ? scaleCoins(session.boardCoins ?? 0) : 0)
}

function Heading({ title, tone, session }: { title: string; tone: string; session: ImageRevealSession }) {
  return (
    <div className="text-center">
      <h3 className={`font-serif text-xl font-bold ${tone}`}>{title}</h3>
      {session.title && <p className="font-serif text-sm text-amber-100">{session.title}</p>}
    </div>
  )
}

function RevealedBody({ session, image }: BodyProps) {
  const coins = totalPaid(session)
  return (
    <div className="flex flex-col gap-2 p-3">
      <Heading title="Image Revealed!" tone="text-emerald-300" session={session} />
      <p className="-mt-1 text-center text-xs text-stone-400">{session.wordGoal.toLocaleString()} words written</p>
      <CelebrationCanvas session={session} image={image} />
      <PhotographerCredit session={session} />
      {coins > 0 && (
        <div className="flex justify-center">
          <CoinAmount amount={`+${coins.toLocaleString()} coins`} className="text-sm font-semibold" />
        </div>
      )}
    </div>
  )
}

function TimedSuccessBody({ session, image }: BodyProps) {
  // Reveal from the clearest level — the image is fully earned.
  const revealed: ImageRevealSession = { ...session, currentLevel: PIXEL_LEVELS.length - 1 }
  return (
    <div className="flex flex-col gap-3 p-3">
      <Heading title="Quest Complete!" tone="text-emerald-300" session={session} />
      <CelebrationCanvas session={revealed} image={image} />
      <PhotographerCredit session={session} />
      <div className="flex justify-center">
        <CoinAmount amount={`+${totalPaid(session).toLocaleString()} coins`} className="text-sm font-semibold" />
      </div>
    </div>
  )
}

function TimedFailureBody({ session, image }: BodyProps) {
  const coinsEarned = session.coinsEarned ?? 0
  return (
    <div className="flex flex-col gap-3 p-3">
      <Heading title="Time’s Up!" tone="text-orange-300" session={session} />
      {image && (
        <img
          src={session.imageUrl}
          alt="Partial quest image"
          className="mx-auto h-[280px] w-[280px] rounded bg-stone-800 object-cover opacity-50"
          crossOrigin="anonymous"
        />
      )}
      <p className="text-center text-xs text-stone-400">
        {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()} words
      </p>
      {coinsEarned > 0 && (
        <div className="flex justify-center">
          <CoinAmount amount={`+${coinsEarned.toLocaleString()} partial coins`} className="text-sm font-semibold" />
        </div>
      )}
    </div>
  )
}
