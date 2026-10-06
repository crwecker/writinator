import { PIXEL_LEVELS } from '../../stores/imageRevealStore'
import type { ImageRevealSession } from '../../types'
import { CelebrationCanvas } from './ImageRevealCanvases'
import { PhotographerCredit } from './ImageRevealWidgets'

interface ImageRevealResultProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
  onDone: () => void
}

/**
 * Overlay for a session that just ended: "Quest Complete!" / "Time's Up!" for
 * timed quests, "Image Revealed!" for untimed ones.
 */
export function ImageRevealResult({ session, image, onDone }: ImageRevealResultProps) {
  return (
    <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
      <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden">
        {session.timeMinutes === undefined ? (
          <RevealedBody session={session} image={image} />
        ) : session.result === 'failure' ? (
          <TimedFailureBody session={session} image={image} />
        ) : (
          <TimedSuccessBody session={session} image={image} />
        )}
        <button
          onClick={onDone}
          className="w-full py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}

interface BodyProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
}

function RevealedBody({ session, image }: BodyProps) {
  return (
    <div className="p-3">
      <div className="text-center mb-2">
        <h3 className="text-lg font-bold text-emerald-400">Image Revealed!</h3>
        <p className="text-gray-400 text-xs mt-0.5">
          {session.wordGoal.toLocaleString()} words written
        </p>
      </div>
      <CelebrationCanvas session={session} image={image} />
      <PhotographerCredit session={session} />
      {session.coinsEarned !== undefined && session.coinsEarned > 0 && (
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-xl">&#x1FA99;</span>
          <span className="text-amber-400 font-medium text-sm">+{session.coinsEarned} coins</span>
        </div>
      )}
    </div>
  )
}

function TimedSuccessBody({ session, image }: BodyProps) {
  // Reveal from the clearest level — the image is fully earned.
  const revealed: ImageRevealSession = { ...session, currentLevel: PIXEL_LEVELS.length - 1 }
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-lg font-bold text-emerald-400">Quest Complete!</h3>
      </div>
      <CelebrationCanvas session={revealed} image={image} />
      {session.photographer && (
        <p className="text-center text-gray-500 text-[10px]">
          Photo by{' '}
          {session.photographerUrl ? (
            <a href={session.photographerUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 underline">
              {session.photographer}
            </a>
          ) : session.photographer}{' '}
          on Unsplash
        </p>
      )}
      <div className="flex items-center justify-center gap-2">
        <span className="text-xl">&#x1FA99;</span>
        <span className="text-emerald-400 font-medium text-sm">+{session.coinsEarned ?? 0} coins</span>
      </div>
    </div>
  )
}

function TimedFailureBody({ session, image }: BodyProps) {
  const coinsEarned = session.coinsEarned ?? 0
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="text-center">
        <h3 className="text-lg font-bold text-orange-400">Time&rsquo;s Up!</h3>
      </div>
      {image && (
        <img
          src={session.imageUrl}
          alt="Partial quest image"
          className="w-[280px] h-[280px] mx-auto rounded object-cover bg-gray-800 opacity-50"
          crossOrigin="anonymous"
        />
      )}
      <p className="text-center text-gray-400 text-xs">
        {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()} words
      </p>
      {coinsEarned > 0 && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-xl">&#x1FA99;</span>
          <span className="text-amber-400 font-medium text-sm">+{coinsEarned} partial coins</span>
        </div>
      )}
    </div>
  )
}
