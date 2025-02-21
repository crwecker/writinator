import { useEffect, useState } from 'react'
import Head from 'next/head'
import Editor, { editorTheme, onError, ParagraphNode } from '../src/components/editor/Editor'
import { useAppContext } from '../src/state'
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { LeftPanel } from '../src/components/panels/LeftPanel'
import { RightPanel } from '../src/components/panels/RightPanel'
import { BottomPanel } from '../src/components/panels/BottomPanel'

const Home = () => {
  const { quest: currentQuest } = useAppContext()
  const [progress, setProgress] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300)
  const [currentQuestWon, setCurrentQuestWon] = useState(false)
  const [path, setPath] = useState(
    `https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:128/${currentQuest?.questImage}`,
  )
  const [backgroundPath, setBackgroundPath] = useState(
    `https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:128/${currentQuest?.questImage}`,
  )
  const [leftPanelVisible, setLeftPanelVisible] = useState(true)
  const [rightPanelVisible, setRightPanelVisible] = useState(true)
  const [bottomPanelVisible, setBottomPanelVisible] = useState(true)
  const [editorStateData, setEditorStateData] = useState()

  const onWordCountChange = (count: number) => {
    setWordCount(count)
  }

  useEffect(() => {
    setProgress(Math.floor((wordCount / (currentQuest?.wordsToWin || 1)) * 100))
  }, [currentQuest, wordCount])

  useEffect(() => {
    if (currentQuestWon) {
      if (typeof window !== 'undefined') {
        window.alert('WooooHoooo!')
      }
      setPath(`https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:0/${currentQuest?.questImage}`)
    }
  }, [currentQuestWon, currentQuest?.questImage])

  useEffect(() => {
    const pixelations = [128, 64, 32, 16, 8, 4, 2, 0]
    const currentPix = Math.floor(progress / 100)
    const pixLevel = pixelations[currentPix] || 0
    const pixBackgroundLevel = pixelations[currentPix - 1] || 0
    
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
  }, [currentQuest?.questImage, currentQuestWon, progress])

  const initialConfig = {
    namespace: "MyEditor",
    theme: editorTheme,
    onError,
    nodes: [ParagraphNode],
  };

  return (
    <>
      <Head>
        <title>Writinator</title>
        <meta name="writinator" content="Writinating" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <LexicalComposer initialConfig={initialConfig}>
        <div className="h-screen max-h-screen flex overflow-hidden bg-app-bg">
          <LeftPanel 
            visible={leftPanelVisible}
            setVisible={setLeftPanelVisible}
            editorStateData={editorStateData}
          />

          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-hidden bg-app-editor">
              <Editor 
                onWordCountChange={onWordCountChange} 
              />
            </div>

            <BottomPanel 
              visible={bottomPanelVisible}
              setVisible={setBottomPanelVisible}
              height={bottomPanelHeight}
              setHeight={setBottomPanelHeight}
              progress={progress}
              wordCount={wordCount}
              currentQuest={currentQuest}
              currentQuestWon={currentQuestWon}
              path={path}
              backgroundPath={backgroundPath}
            />
          </div>

          <RightPanel 
            visible={rightPanelVisible}
            setVisible={setRightPanelVisible}
          />
        </div>
      </LexicalComposer>
    </>
  )
}

export default Home
