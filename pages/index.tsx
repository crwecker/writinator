import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Editor from '../components/editor'
import { useAppContext } from '../context/state'
import Image from 'next/image'
import Menu from '../components/menu'

interface NaturalImageProps {
  src: string
  height: number
}
const NaturalImage = ({ src, height }: NaturalImageProps) => {
  const [ratio, setRatio] = useState(16 / 9) // default to 16:9

  return (
    <Image
      src={src}
      width={height / ratio}
      height={height}
      layout="fixed" // you can use "responsive", "fill" or the default "intrinsic"
      onLoadingComplete={({ naturalWidth, naturalHeight }) => {
        if (naturalHeight > 0 && naturalWidth > 0) setRatio(naturalHeight / naturalWidth)
      }}
    />
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

  return (
    <>
      <Head>
        <title>Create Next App</title>
        <meta name="writinator" content="Writinating" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden' }}>
        <main>
          <div className="tile">
            <div className="tile is-vertical is-12">
              <div className="editor-wrapper" style={{ height: editorHeight }}>
                <Editor onWordCountChange={onWordCountChange} editorHeight={editorHeight} />
                <a>
                  {!currentQuestWon && (
                    <div className="progress-wrapper" onClick={() => setIsGameHidden((was) => !was)}>
                      <progress className="progress is-info is-small" value={progress % 100} max="100">
                        {progress}
                      </progress>
                      <p className="progress-value has-text-black">
                        {wordCount} of {currentQuest?.wordsToWin} words ({progress}%)
                      </p>
                    </div>
                  )}
                  {currentQuestWon && (
                    <div className="progress-wrapper" onClick={() => setIsGameHidden((was) => !was)}>
                      <progress className="progress is-success is-small" value={100} max="100">
                        {progress}
                      </progress>
                      <p className="progress-value has-text-black">
                        {wordCount} of {currentQuest?.wordsToWin} words ({progress}%)
                      </p>
                    </div>
                  )}
                </a>
              </div>
              <div className="tile is-parent" style={{ display: isGameHidden ? 'none' : 'flex', margin: 10}} ref={ref}>
                <Link href="/quests/questPicker">
                  <a>
                    <NaturalImage src={currentQuest?.poster} height={questBarHeight} />
                  </a>
                </Link>
                <div style={{ maxHeight: '100%', position: 'relative', marginLeft: 10 }}>
                  <figure className="image">
                    <NaturalImage src={backgroundPath} height={questBarHeight} />
                  </figure>
                  <div
                    style={{
                      maxHeight: currentQuestWon ? '100%' : `${progress % 100}%`,
                      overflow: 'hidden',
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      borderBottom: '1px solid #777',
                    }}
                  >
                    <figure className="image">
                      <NaturalImage src={path} height={questBarHeight} />
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
