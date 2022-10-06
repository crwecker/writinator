import { createContext, useContext, useState } from 'react';

export interface Quest {
  author: string
  created: string
  title: string
  poster: string
  description: string
  questImage: string
  direction?: string
  wordsToWin?: number
}

export interface QuestArc {
  title: string
  quests: Quest[]
}

export const defaultQuestArcs: QuestArc[] = [
  {
    title: "Strange Pet",
    quests: [
      {
        author: "Ruby Mae",
        created: "3 Sep 2022",
        title: "Egg",
        poster: "https://res.cloudinary.com/dku43ldks/image/upload/v1662353342/writinator/Ruby/digging.png",
        description:
          "Ruby was digging in her backyard one day and came across the most beautiful colored rock. Her life would never be the same!",
        questImage: "/v1662353577/writinator/Ruby/unicorn_dragon_egg.jpg",
        direction: "TTB",
        wordsToWin: 50,
      },
      {
        author: "Ruby Mae",
        created: "3 Sep 2022",
        title: "Cracks",
        poster: "https://res.cloudinary.com/dku43ldks/image/upload/v1662353342/writinator/Ruby/hatching.png",
        description:
          "Ruby kept the rock on her dresser and it started to wiggle! 'What is inside?' Ruby said.",
        questImage: "/v1662353342/writinator/Ruby/baby_unicorn_dragon.png",
        direction: "TTB",
        wordsToWin: 100,
      },
      {
        author: "Ruby Mae",
        created: "4 Sep 2022",
        title: "Baby Unicorn Dragon",
        poster: "https://res.cloudinary.com/dku43ldks/image/upload/v1662353343/writinator/Ruby/person_and_egg.png",
        description:
          "rock on her dresser and it started to wiggle! 'What is inside?' Ruby said.",
        questImage: "/v1662353342/writinator/Ruby/its_a_toddler.png",
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
        poster: "https://res.cloudinary.com/dku43ldks/image/upload/v1665022782/writinator/Paintings/claude_monet.jpg",
        description: "",
        questImage: "/v1665022782/writinator/Paintings/monet.jpg",
        direction: "TTB",
        wordsToWin: 1000,
      },
      {
        author: "Alene Kristianne",
        created: "3 Sep 2022",
        title: "Cracks",
        poster: "https://res.cloudinary.com/dku43ldks/image/upload/v1665022782/writinator/Paintings/claude_monet_2.jpg",
        description: "",
        questImage: "/v1665022782/writinator/Paintings/woman.jpg",
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
        poster: "https://res.cloudinary.com/dku43ldks/image/upload/v1665024668/writinator/Paintings/dragon.jpg",
        description: "We are under attack",
        questImage: "/v1665024668/writinator/Paintings/goblin.jpg",
        direction: "TTB",
        wordsToWin: 200,
      },
    ],
  },
];

type AppContextInterface = {
  quest: Quest,
  setQuest: (quest: Quest) => void
}

const AppContext = createContext<AppContextInterface>(null);

export function AppWrapper({ children }) {

  const [quest, setQuest] = useState<Quest>(defaultQuestArcs[0].quests[0])

  return (
    <AppContext.Provider value={{quest, setQuest}}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextInterface {
  return useContext(AppContext);
}
