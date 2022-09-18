import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Editor from "../components/editor";
import { useAppContext } from "../context/state";
import Image from "next/image";
import Menu from "../components/menu";

const NaturalImage = (props) => {
  const [ratio, setRatio] = useState(16 / 9); // default to 16:9

  return (
    <Image
      {...props}
      // set the dimension (affected by layout)
      width={400}
      height={400 / ratio}
      layout="fixed" // you can use "responsive", "fill" or the default "intrinsic"
      onLoadingComplete={({ naturalWidth, naturalHeight }) => {
        setRatio(naturalWidth / naturalHeight)
      }}
    />
  );
};

const Home = () => {
  const [currentQuest] = useAppContext();
  const [progress, setProgress] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [isGameHidden, setIsGameHidden] = useState(false)
  const [editorHeight, setEditorHeight] = useState(700)
  const [currentQuestWon, setCurrentQuestWon] = useState(false)
  // const [pixLevel, setPixLevel] = useState(128)
  const [path, setPath] = useState(`https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:128/${currentQuest?.questImage}`)
  const [backgroundPath, setBackgroundPath] = useState(`https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:128/${currentQuest?.questImage}`)

  const onWordCountChange = (count) => {
    setWordCount(count);
  };

  useEffect(() => {
    setEditorHeight(isGameHidden ? '100vh' : 700 )
  }, [isGameHidden])

  useEffect(() => {
    setProgress(Math.floor((wordCount / currentQuest?.wordsToWin) * 100));
  }, [wordCount]);

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
    const currentPix = Math.floor(progress/100)
    const pixLevel = pixelations[currentPix] || 0
    const pixBackgroundLevel = pixelations[currentPix - 1] || 0
    // '/solid-dark-grey-background.jpg'
    // setPixLevel(pixelations[Math.floor(progress/100)])
    console.log("Pix Level", pixLevel)
    if (currentPix >= 8) {
      setCurrentQuestWon(true)
    } else {
      if (currentQuestWon) setCurrentQuestWon(false)
      setPath(`https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:${pixLevel}/${currentQuest?.questImage}`)
      const pixBackground = pixBackgroundLevel ? `https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:${pixBackgroundLevel}/${currentQuest?.questImage}` : '/solid-dark-grey-background.jpg' 
      setBackgroundPath(pixBackground)
    }
  }, [progress])
  
  // Pixelation -> 128, 64, 32, 16, 8, 4, 2, 0
  const cloudinaryBase = (questImage) => {
    console.log(path)
    return path
  }

  return (
    <>
      <Head>
        <title>Create Next App</title>
        <meta name="writinator" content="Writinating" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

    <div style={{ height: '100vh', maxHeigh: '100vh' }}>
      <main>
        <div className="tile">
          <div className="tile is-vertical is-12">
            <div className="editor-wrapper" style={{ height: editorHeight }}>
              <Editor onWordCountChange={onWordCountChange} editorHeight={editorHeight} />
            <a>
              {!currentQuestWon &&
                <div class="progress-wrapper" onClick={() => setIsGameHidden(was => !was)}>
                  <progress class="progress is-info is-small" value={progress % 100} max="100">{progress}</progress>
                  <p class="progress-value has-text-black">{wordCount} of {currentQuest?.wordsToWin} words ({progress}%)</p>
                </div>
              }
              {currentQuestWon &&
                <div class="progress-wrapper" onClick={() => setIsGameHidden(was => !was)}>
                  <progress class="progress is-success is-small" value={100} max="100">{progress}</progress>
                  <p class="progress-value has-text-black">{wordCount} of {currentQuest?.wordsToWin} words ({progress}%)</p>
                </div>
              }
            </a>
            </div>
            <div className="tile is-parent" style={{ display: isGameHidden ? 'none' : 'flex', margin: 10 }}>
              <Link href="/quest-picker">
                <a>
                  <NaturalImage src={currentQuest?.poster} />
                </a>
              </Link>
              <div style={{ maxHeight: '100%', position: 'relative', marginLeft: 10 }}>
                <figure className="image">
                  <NaturalImage src={backgroundPath} />
                </figure>
                <div style={{ maxHeight: currentQuestWon ? '100%' : `${progress % 100}%`, overflow: "hidden", position: 'absolute', left: 0, top: 0, borderBottom: '1px solid #777' }}>
                  <figure className="image">
                    <NaturalImage src={path} />
                  </figure>
                </div>
              </div>
            </div>
          </div>
        </div>
        <a><div class="progress-wrapper" onClick={() => setIsGameHidden(was => !was)} /></a>
      </main>
      <footer className="footer has-background-black">
      </footer>
    </div>
    </>
  );
};

export default Home;
