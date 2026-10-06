import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { useCustomPictureStore } from '../../stores/customPictureStore'
import { noteImageSource, useProgressionStore } from '../../stores/progressionStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { getQuestImage, type QuestImage } from '../../lib/questArt'
import { GALLERY_SETS, type PictureSource } from '../../lib/gallerySets'

function themeSource(theme: string): PictureSource {
  return GALLERY_SETS.find((s) => s.source === theme)?.source ?? 'nature'
}

/**
 * The picture for a new quest: the writer's own picture when one was chosen
 * for the next quest (used once), otherwise an Unsplash photo in the current
 * theme, with generated art as the fallback.
 */
export async function chooseQuestImage(): Promise<QuestImage> {
  const choice = useProgressionStore.getState().pictureChoice
  if (choice.kind === 'custom') {
    useProgressionStore.getState().setPictureChoice({ kind: 'theme' })
    const picture = useCustomPictureStore.getState().pictures.find((p) => p.id === choice.pictureId)
    if (picture) {
      return { url: picture.dataUrl, width: picture.width, height: picture.height, artTitle: picture.name }
    }
  }
  const theme = useGameSettingsStore.getState().imageTheme
  const image = await getQuestImage(() => fetchRandomImage(theme))
  if (image.unsplashId) noteImageSource(image.url, themeSource(theme))
  return image
}
