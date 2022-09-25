import { createContext, useContext, useState } from 'react';

const defaultQuest = {
  author: "Ruby Mae",
  created: "3 Sep 2022",
  title: "Egg",
  poster: "/digging.png",
  description:
    "Ruby was digging in her backyard one day and came across the most beautiful colored rock. Her life would never be the same!",
  questImage: "v1662353577/writinator/unicorn_dragon_egg.jpg",
  wordsToWin: 50,
}

interface Quest {
  author: string
  created: string
  title: string
  poster: string
  description: string
  questImage: string
  wordsToWin: number
}

type AppContextInterface = [
  quest: Quest,
  setQuest: (quest: Quest) => void
]

// interface AppContextInterface extends Tuple<QuestUseState>{}


const AppContext = createContext<AppContextInterface[] | null>(null);

export function AppWrapper({ children }) {

  const [quest, setQuest] = useState<Quest>(defaultQuest)

  return (
    <AppContext.Provider value={[quest, setQuest]}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
