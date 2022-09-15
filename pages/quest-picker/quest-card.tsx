import { useState } from "react";
import Image from "next/image";
import { useAppContext } from "../../context/state";

const NaturalImage = (props) => {
  const [ratio, setRatio] = useState(16/9) // default to 16:9

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
  )
}

const QuestCard = ({ quest, onQuestCardClicked }) => {
  const [currentQuest] = useAppContext();
  const isCurrent = currentQuest == quest;
  // TODO: Currently each card renders twice, and rerenders after each click
  // Should definitely go about the isCurrent a different way :)
  return (
    <div
      className="card is-clickable"
      onClick={() => onQuestCardClicked(quest)}
    >
      <div className="card-image">
        <figure className="image">
          <NaturalImage
            src={quest?.poster}
            alt={quest?.title}
            layout="responsive"
          />
        </figure>
      </div>
      <div
        className={
          isCurrent ? "card-content has-background-primary" : "card-content"
        }
      >
        <div className="content is-4">
          {quest?.description}
          {isCurrent}
          <div>{quest?.wordsToWin} Words Needed</div>
          <div>
            Submitted by {quest?.author}, {quest?.created}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestCard;
