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
  winningMessage?: string
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
      // ... rest of the quests
    ],
  },
  // ... rest of the quest arcs
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