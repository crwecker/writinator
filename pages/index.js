import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Editor from "../components/editor";

const Home = () => {
  const [currentQuest, setCurrentQuest] = useState({ wordsToWin: 50 });
  const [progress, setProgress] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  const onWordCountChange = (count) => {
    setWordCount(count);
  };

  useEffect(() => {
    setProgress(Math.floor((wordCount / currentQuest.wordsToWin) * 100));
  }, [wordCount]);

  const onCurrentQuestChange = (newQuest) => {
    setCurrentQuest(newQuest);
  };

  return (
    <div className="container">
      <Head>
        <title>Create Next App</title>
        <meta name="writinator" content="Writinating" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <section class="section"></section>

      <main>
        <div class="tile is-ancestor">
          <div class="tile is-parent is-narrow">
            <article class="tile is-child notification is-success">
              <aside class="menu">
                <h2>
                  <Link href="/quest-picker">Quest Picker</Link>
                </h2>
              </aside>
            </article>
          </div>
          <div class="tile is-vertical is-10" styles={{ height: '500px'}}>
            <div class="tile is-parent" styles={{ height: '500px'}}>
              <article class="tile is-child notification is-info" styles={{ height: '500px'}}>
                <Editor onWordCountChange={onWordCountChange} />
              </article>
            </div>
            <div class="tile">
              <div class="tile is-parent is-vertical">
                <article class="tile is-child notification is-info">
                  <progress class="progress is-success" value={progress} max="100">
                    {progress}
                  </progress>
                  <h6>
                    {" "}
                    {progress}% to Goal ({wordCount} of{" "}
                    {currentQuest.wordsToWin} words){" "}
                  </h6>
                </article>
              </div>
              <div class="tile is-parent">
                <article class="tile is-child notification is-info">
                  <figure class="image is-4by3">
                    <img src="https://bulma.io/images/placeholders/640x480.png" />
                  </figure>
                </article>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer class="footer has-background-black"></footer>
    </div>
  );
};

export default Home;
