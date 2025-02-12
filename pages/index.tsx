import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Editor from '../src/components/editor/Editor'
import { useAppContext } from '../src/state'
import Image from 'next/image'
import Menu from '../src/components/menu/Menu'

interface NaturalImageProps {
  src: string
  height: number
}

const NaturalImage = ({ src, height }: NaturalImageProps) => {
  const [ratio, setRatio] = useState(16 / 9)
  return (
    <div style={{ height: height, position: 'relative' }}>
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        style={{ 
          objectFit: 'contain',
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  )
}

const Home = () => {
  const { quest: currentQuest } = useAppContext()
  const [progress, setProgress] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const [isGameHidden, setIsGameHidden] = useState(false)
  const [questBarHeight, setQuestBarHeight] = useState(400)
  const [editorHeight, setEditorHeight] = useState<number | string>(700)
  const [currentQuestWon, setCurrentQuestWon] = useState(false)
  const [path, setPath] = useState(
    `https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:128/${currentQuest?.questImage}`,
  )
  const [backgroundPath, setBackgroundPath] = useState(
    `https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:128/${currentQuest?.questImage}`,
  )

  const onWordCountChange = (count: number) => {
    setWordCount(count)
  }

  useEffect(() => {
    setEditorHeight(isGameHidden ? '100vh' : 700)
  }, [isGameHidden])

  useEffect(() => {
    setProgress(Math.floor((wordCount / currentQuest?.wordsToWin) * 100))
  }, [wordCount])

  useEffect(() => {
    if (currentQuestWon) {
      alert('WooooHoooo!')
      setPath(`https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:0/${currentQuest?.questImage}`)
    }
  }, [currentQuestWon])

  useEffect(() => {
    // 0-100 - 0
    // 101-200 - 1
    // 201-300 - 2
    const pixelations = [128, 64, 32, 16, 8, 4, 2, 0]
    const currentPix = Math.floor(progress / 100)
    const pixLevel = pixelations[currentPix] || 0
    const pixBackgroundLevel = pixelations[currentPix - 1] || 0
    console.log('Pix Level', pixLevel)
    if (currentPix >= 8) {
      setCurrentQuestWon(true)
    } else {
      if (currentQuestWon) setCurrentQuestWon(false)
      setPath(`https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:${pixLevel}/${currentQuest?.questImage}`)
      const pixBackground = pixBackgroundLevel
        ? `https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:${pixBackgroundLevel}/${currentQuest?.questImage}`
        : '/solid-dark-grey-background.jpg'
      setBackgroundPath(pixBackground)
    }
  }, [progress])

  const cloudinaryBase = (questImage) => {
    console.log(path)
    return path
  }
  const ref = useRef(null)
  useLayoutEffect(() => {
    console.log("REF", ref.current.clientHeight)
    setQuestBarHeight(ref.current.clientHeight)
  }, [ref.current])

  console.log("progress % 100", progress % 100)
  return (
    <>
      <Head>
        <title>Writinator</title>
        <meta name="writinator" content="Writinating" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{ height: '100vh', maxHeight: '100vh', backgroundColor: 'blue'}}>
        <main>
          <div className="tile">
            <div className="tile is-vertical is-12">
              <div className="editor-wrapper" style={{ height: editorHeight }}>
                <Editor onWordCountChange={onWordCountChange} editorHeight={editorHeight} />
                <div className="progress-wrapper" onClick={() => setIsGameHidden((was) => !was)}>
                  {!currentQuestWon && (
                    <div>
                      <progress className="progress is-info is-small" value={progress % 100} max="100">
                        {progress}
                      </progress>
                      <p className="progress-value has-text-black">
                        {wordCount} of {currentQuest?.wordsToWin} words ({progress}%)
                      </p>
                    </div>
                  )}
                  {currentQuestWon && (
                    <div>
                      <progress className="progress is-success is-small" value={100} max="100">
                        {progress}
                      </progress>
                      <p className="progress-value has-text-black">
                        {wordCount} of {currentQuest?.wordsToWin} words ({progress}%)
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div 
                className="tile is-parent" 
                style={{ 
                  display: isGameHidden ? 'none' : 'flex', 
                  margin: 10,
                  height: 200
                }} 
                ref={ref}
              >
                <Link href="/quests/questPicker" className="quest-link" style={{ height: '100%', flex: 1 }}>
                  <NaturalImage src={currentQuest?.poster} height={200} />
                </Link>
                <div style={{ flex: 1, position: 'relative', marginLeft: 10 }}>
                  <figure className="image" style={{ height: '100%' }}>
                    <NaturalImage src={backgroundPath} height={200} />
                  </figure>
                  <div
                    style={{
                      height: currentQuestWon ? '100%' : `${progress % 100}%`,
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      overflow: 'hidden'
                    }}
                  >
                    <figure className="image" style={{ height: '100%' }}>
                      <NaturalImage src={path} height={200} />
                    </figure>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <a>
            <div className="progress-wrapper" onClick={() => setIsGameHidden((was) => !was)} />
          </a>
        </main>
        <footer className="footer has-background-black"></footer>
      </div>
    </>
  )
}

export default Home
