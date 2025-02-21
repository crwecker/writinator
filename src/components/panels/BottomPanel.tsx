import Link from 'next/link'
import { NaturalImage } from '../NaturalImage'
import { useState, useCallback, useEffect } from 'react'

interface BottomPanelProps {
  visible: boolean
  setVisible: (visible: boolean) => void
  height: number
  setHeight: (height: number) => void
  progress: number
  wordCount: number
  currentQuest: any
  currentQuestWon: boolean
  path: string
  backgroundPath: string
}

export const BottomPanel = ({ 
  visible, 
  setVisible, 
  height, 
  setHeight,
  progress,
  wordCount,
  currentQuest,
  currentQuestWon,
  path,
  backgroundPath
}: BottomPanelProps) => {
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [startHeight, setStartHeight] = useState(height)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const delta = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(800, startHeight + delta));
      setHeight(newHeight);
    }
  }, [isDragging, startY, startHeight, setHeight])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div 
      style={{ height: visible ? `${height}px` : '5px' }}
      className={`${visible ? '' : 'transition-height'} bg-app-panel duration-300 border-t border-app-border relative`}
    >
      <div 
        className="absolute top-0 left-0 right-0 h-[5px] cursor-ns-resize bg-app-border z-10"
        onMouseDown={(e) => {
          setStartY(e.clientY)
          setStartHeight(height)
          setIsDragging(true)
        }}
      />
      <div 
        onClick={() => setVisible(!visible)}
        className={`absolute bottom-0 left-0 right-0 ${visible ? 'h-[30px]' : 'h-[5px]'} cursor-pointer flex items-center justify-center bg-app-panel border-b border-app-border z-10 transition-height duration-300`}
      >
        {visible && '↓'}
      </div>
      {visible && (
        <div 
          style={{ height: 'calc(100% - 30px)' }}
          className="p-2 flex flex-col"
        >
          <div className="progress-wrapper">
            {!currentQuestWon && (
              <div>
                <progress className="progress is-info is-small" value={progress % 100} max="100">
                  {progress}
                </progress>
                <p className="progress-value text-black">
                  {wordCount} of {currentQuest?.wordsToWin} words ({progress}%)
                </p>
              </div>
            )}
            {currentQuestWon && (
              <div>
                <progress className="progress is-success is-small" value={100} max="100">
                  {progress}
                </progress>
                <p className="progress-value text-black">
                  {wordCount} of {currentQuest?.wordsToWin} words ({progress}%)
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2.5 flex-1">
            <Link href="/quests/questPicker" className="quest-link h-full flex-1">
              <NaturalImage src={currentQuest?.poster} height={'100%'} />
            </Link>
            <div className="flex-1 relative">
              <figure className="image h-full">
                <NaturalImage src={backgroundPath} height={'100%'} />
              </figure>
              <div
                style={{ height: currentQuestWon ? '100%' : `${progress % 100}%` }}
                className="absolute left-0 top-0 right-0 overflow-hidden"
              >
                <figure className="image h-full">
                  <NaturalImage src={path} height={'100%'} />
                </figure>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 