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
      width={250}
      height={200 / ratio}
      layout="fixed" // you can use "responsive", "fill" or the default "intrinsic"
      onLoadingComplete={({ naturalWidth, naturalHeight }) =>
        setRatio(naturalWidth / naturalHeight)
      }
    />
  );
};

const Home = () => {
  const [currentQuest] = useAppContext();
  const [progress, setProgress] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  const onWordCountChange = (count) => {
    setWordCount(count);
  };

  useEffect(() => {
    setProgress(Math.floor((wordCount / currentQuest?.wordsToWin) * 100));
  }, [wordCount]);

  return (
    <div>
      <Head>
        <title>Create Next App</title>
        <meta name="writinator" content="Writinating" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <div className="tile">
          <div className="tile is-vertical is-12">
            <Editor onWordCountChange={onWordCountChange} />
            <progress className="progress is-info" value={progress} max="100">
              {progress}
            </progress>
            <div>{wordCount} of {currentQuest?.wordsToWin} words ({progress}%)</div>
            <div className="tile is-parent">
              <Link href="/quest-picker">
                <a>
                  <NaturalImage src={currentQuest?.poster} />
                </a>
              </Link>
              <div style={{ maxHeight: `${progress}%`, overflow: "hidden" }}>
                <figure className="image">
                  <NaturalImage src={currentQuest?.questImage} />
                </figure>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="footer has-background-black"></footer>
    </div>
  );
};

export default Home;
