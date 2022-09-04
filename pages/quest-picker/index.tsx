import { useState, useEffect } from "react";
import QuestCard from "./quest-card";
import Link from "next/link";
const data = [
  {
    title: "Strange Pet",
    quests: [
      {
        author: "Ruby Mae",
        created: "3 Sep 2022",
        title: "Egg",
        poster: "/digging.png",
        description:
          "Ruby was digging in her backyard one day and came across the most beautiful colored rock. Her life would never be the same!",
        questImage: "/unicorn_dragon_egg.png",
        direction: "TTB",
        wordsToWin: 50,
      },
      {
        author: "Ruby Mae",
        created: "3 Sep 2022",
        title: "Cracks",
        poster: "/hatching.png",
        description:
          "Ruby kept the rock on her dresser and it started to wiggle! 'What is inside?' Ruby said.",
        questImage: "/baby_unicorn_dragon.png",
        direction: "TTB",
        wordsToWin: 100,
      },
    ],
  },
  {
    title: "A Picture is Worth 1000 Words",
    quests: [
      {
        author: "Alene Kristianne",
        created: "3 Sep 2022",
        title: "Monet",
        poster: "/claude_monet.jpeg",
        description: "",
        questImage: "/monet.jpg",
        direction: "TTB",
        wordsToWin: 1000,
      },
      {
        author: "Alene Kristianne",
        created: "3 Sep 2022",
        title: "Cracks",
        poster: "/claude_monet_2.jpg",
        description: "",
        questImage: "/woman.jpg",
        direction: "TTB",
        wordsToWin: 1000,
      },
    ],
  },
  {
    title: "Defend the Village",
    quests: [
      {
        author: "Daniel Ross",
        created: "3 Sep 2022",
        title: "Goblins!",
        poster: "/burninate.png",
        description: "We are under attack",
        questImage: "/unicorn_dragon_egg.png",
        direction: "TTB",
        wordsToWin: 200,
      },
    ],
  },
];

const QuestPicker = () => {
  const [questArcs, setQuestArcs] = useState(data);

  useEffect(() => {
    
    setQuestArcs(data);
  }, [data]);
  return (
    <div>
      <Link href="/">Back to home</Link>
      <h1 className="">Quest Picker</h1>
      <div className="columns">
        {questArcs.map((questArc, i) => (
          <div className="column" key={i + questArc.title}>
            {questArc.quests.map((quest, i) => (
              <div>
                <QuestCard quest={quest} key={i + quest.title} />
                <br />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default QuestPicker