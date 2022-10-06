import { useState, useEffect } from "react";
import QuestCard from "./questCard";
import Link from "next/link";
import { useAppContext, Quest, defaultQuestArcs } from "../../context/state";
import { useRouter } from "next/router";

const QuestPicker = () => {
  const router = useRouter();
  const questArcs = defaultQuestArcs;
  const { quest: currentQuest, setQuest: setCurrentQuest } = useAppContext();

  const onQuestCardClicked = (quest: Quest) => {
    setCurrentQuest(quest);
    router.push("/");
  };
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
                <QuestCard
                  quest={quest}
                  onQuestCardClicked={onQuestCardClicked}
                  key={i + quest.title}
                />
                <br />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuestPicker;
