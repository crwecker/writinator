import { useState, useEffect } from "react";
import QuestCard from "./quest-card";
import Link from "next/link";
import { useAppContext } from "../../context/state"
import { useRouter } from "next/router";
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
        // questImage: "https://res.cloudinary.com/dku43ldks/image/upload/e_pixelate:100/v1662353577/writinator/unicorn_dragon_egg.jpg",
        questImage: "/unicorn_dragon_egg.jpg",
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
      {
        author: "Ruby Mae",
        created: "4 Sep 2022",
        title: "Baby Unicorn Dragon",
        poster: "/person_and_egg.png",
        description:
          "rock on her dresser and it started to wiggle! 'What is inside?' Ruby said.",
        questImage: "/its_a_toddler.png",
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
  const router = useRouter()
  const [questArcs, setQuestArcs] = useState(data);
  const [currentQuest, setCurrentQuest] = useAppContext()
  useEffect(() => { 
    setQuestArcs(data);
  }, [data]);

  const onQuestCardClicked = (quest) => {
    setCurrentQuest(quest)
    router.push('/')
  }
  return (
    <div>
      <div>Current Quest {currentQuest?.title}</div>
      <Link href="/">Back to home</Link>
      <h1 className="">Quest Picker</h1>
      <div className="columns">
        {questArcs.map((questArc, i) => (
          <div className="column is-one-fifth" key={i + questArc.title}>
            {questArc.quests.map((quest, i) => (
              <div>
                <QuestCard quest={quest} onQuestCardClicked={onQuestCardClicked} key={i + quest.title} />
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