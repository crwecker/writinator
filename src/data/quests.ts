import type { QuestArc } from '../types'

export const questArcs: QuestArc[] = [
  {
    id: 'first-steps',
    title: 'First Steps',
    description: 'Warm up your writing muscles with small, achievable goals.',
    quests: [
      {
        id: 'the-spark',
        title: 'The Spark',
        description: 'Every story begins with a single word. Write 50 to fan the flame.',
        image: '/quests/spark.svg',
        wordsToWin: 50,
        winningMessage: 'The spark catches! Your story has begun.',
      },
      {
        id: 'kindling',
        title: 'Kindling',
        description: 'Keep the fire going. 150 words to build some heat.',
        image: '/quests/kindling.svg',
        wordsToWin: 150,
        winningMessage: 'The fire crackles to life. You\'re warming up nicely.',
      },
      {
        id: 'campfire',
        title: 'Campfire',
        description: 'Now we\'re cooking. 300 words to keep the story burning.',
        image: '/quests/campfire.svg',
        wordsToWin: 300,
        winningMessage: 'A roaring campfire! Others are drawn to your warmth.',
      },
    ],
  },
  {
    id: 'the-journey',
    title: 'The Journey',
    description: 'Longer quests for when you\'re ready to push further.',
    quests: [
      {
        id: 'dawn-march',
        title: 'Dawn March',
        description: 'Set out at first light. 500 words before the sun climbs high.',
        image: '/quests/dawn.svg',
        wordsToWin: 500,
        winningMessage: 'The road stretches ahead, but you\'ve found your stride.',
      },
      {
        id: 'through-the-forest',
        title: 'Through the Forest',
        description: 'The path twists and turns. Write 1,000 words to find your way.',
        image: '/quests/forest.svg',
        wordsToWin: 1000,
        winningMessage: 'You emerge from the trees into golden light. Well done, traveler.',
      },
      {
        id: 'the-summit',
        title: 'The Summit',
        description: 'The peak is in sight. 2,000 words to reach the top.',
        image: '/quests/summit.svg',
        wordsToWin: 2000,
        winningMessage: 'You stand at the summit! The world spreads below you.',
      },
    ],
  },
  {
    id: 'epic-tales',
    title: 'Epic Tales',
    description: 'For the truly dedicated. These quests demand serious commitment.',
    quests: [
      {
        id: 'chapter-sprint',
        title: 'Chapter Sprint',
        description: 'Write a full chapter\'s worth — 3,000 words in one quest.',
        image: '/quests/sprint.svg',
        wordsToWin: 3000,
        winningMessage: 'A complete chapter! You are a force of nature.',
      },
      {
        id: 'marathon',
        title: 'The Marathon',
        description: 'The ultimate test. 5,000 words. No shortcuts.',
        image: '/quests/marathon.svg',
        wordsToWin: 5000,
        winningMessage: 'LEGENDARY! 5,000 words conquered. You are unstoppable.',
      },
    ],
  },
]
