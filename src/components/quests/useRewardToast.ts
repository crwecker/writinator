import { addToast } from './rewardToastStore'

export function useRewardToast() {
  return {
    showReward(amount: number, source?: string) {
      addToast(amount, source)
    },
  }
}
