import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'

/** The writer's own pictures for quests (per writer, localforage only). */
export interface CustomPicture {
  id: string
  name: string
  /** Downscaled JPEG data URL (see lib/customPicture). */
  dataUrl: string
  width: number
  height: number
  addedAt: string
}

export const MAX_CUSTOM_PICTURES = 12

interface CustomPictureState {
  pictures: CustomPicture[]
  /** Adds a picture (dropping the oldest past the cap) and returns its id. */
  addPicture: (picture: Omit<CustomPicture, 'id' | 'addedAt'>, now?: number) => string
  removePicture: (id: string) => void
}

export const useCustomPictureStore = create<CustomPictureState>()(
  persist(
    (set) => ({
      pictures: [],
      addPicture: (picture, now = Date.now()) => {
        const id = crypto.randomUUID()
        set((s) => ({
          pictures: [...s.pictures, { ...picture, id, addedAt: new Date(now).toISOString() }].slice(-MAX_CUSTOM_PICTURES),
        }))
        return id
      },
      removePicture: (id) => {
        set((s) => ({ pictures: s.pictures.filter((p) => p.id !== id) }))
      },
    }),
    {
      name: 'writinator-custom-pictures',
      version: 1,
      storage: localforageJSONStorage<CustomPictureState>(),
      partialize: (s) => ({ pictures: s.pictures }) as unknown as CustomPictureState,
    },
  ),
)
