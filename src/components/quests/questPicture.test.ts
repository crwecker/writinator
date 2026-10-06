import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseQuestImage } from './questPicture'
import { useProgressionStore } from '../../stores/progressionStore'
import { useCustomPictureStore } from '../../stores/customPictureStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { fetchRandomImage } from '../../lib/unsplash'

vi.mock('../../lib/unsplash', () => ({ fetchRandomImage: vi.fn(), loadImage: vi.fn() }))

beforeEach(() => {
  useProgressionStore.setState({ ...useProgressionStore.getInitialState(), _hasHydrated: true }, true)
  useCustomPictureStore.setState({ pictures: [] })
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  vi.mocked(fetchRandomImage).mockReset().mockResolvedValue({
    id: 'p1', url: 'https://images.unsplash.com/p1', width: 800, height: 600, photographer: 'A', photographerUrl: 'u', downloadLocationUrl: 'd',
  })
})

describe('choosing the picture for a quest', () => {
  it('fetches an Unsplash photo in the current theme and remembers the theme', async () => {
    useGameSettingsStore.getState().setImageTheme('space')
    const image = await chooseQuestImage()
    expect(fetchRandomImage).toHaveBeenCalledWith('space')
    expect(image.unsplashId).toBe('p1')
    expect(useProgressionStore.getState().sourceByUrl[image.url]).toBe('space')
  })

  it('uses the writer\'s own picture once, then goes back to the theme', async () => {
    const id = useCustomPictureStore.getState().addPicture({ name: 'Cover', dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 8 })
    useProgressionStore.getState().setPictureChoice({ kind: 'custom', pictureId: id })
    const image = await chooseQuestImage()
    expect(image.url).toBe('data:image/jpeg;base64,AAAA')
    expect(image.width).toBe(10)
    expect(fetchRandomImage).not.toHaveBeenCalled()
    expect(useProgressionStore.getState().pictureChoice).toEqual({ kind: 'theme' })
  })

  it('falls back to the theme when the chosen picture was removed', async () => {
    useProgressionStore.getState().setPictureChoice({ kind: 'custom', pictureId: 'gone' })
    const image = await chooseQuestImage()
    expect(image.unsplashId).toBe('p1')
  })
})
