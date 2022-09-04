import Image from "next/image";

const QuestCard = ({quest}) => {
  console.log('quest poster', quest?.poster)
  return (
    <div className="card">
    <div className="card-image">
      <figure className="image is-4by3">
        <Image
            src={quest?.poster}
            alt={quest?.title}
            layout="fill"
        />
        {/* <img src="https://bulma.io/images/placeholders/1280x960.png" alt="Placeholder image"> */}
      </figure>
    </div>
    <div className="card-content">
      <div className="content is-4">
        {quest?.description}
        <div>{quest?.wordsToWin} Words Needed</div>
        <div>Submitted by {quest?.author}, {quest?.created}</div>
      </div>
    </div>
  </div>
  );
}

export default QuestCard
