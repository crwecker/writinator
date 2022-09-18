import { createContext, useContext, useState } from 'react';

const AppContext = createContext();
const defaultQuest = {
  author: "Ruby Mae",
  created: "3 Sep 2022",
  title: "Egg",
  poster: "/digging.png",
  description:
    "Ruby was digging in her backyard one day and came across the most beautiful colored rock. Her life would never be the same!",
  questImage: "v1662353577/writinator/unicorn_dragon_egg.jpg",
  direction: "TTB",
  wordsToWin: 50,
}

export function AppWrapper({ children }) {
  const [quest, setQuest] = useState(defaultQuest)

  return (
    <AppContext.Provider value={[quest, setQuest]}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}