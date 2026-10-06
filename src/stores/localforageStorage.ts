import { createJSONStorage, type PersistStorage, type StateStorage, type StorageValue } from 'zustand/middleware'
import * as localforage from 'localforage'

/**
 * localforage-backed storage for zustand `persist`, storing state as a JSON
 * string. `legacyKeys` maps a store name to an older key that is moved over
 * the first time the new key is read and found empty.
 */
export function localforageJSONStorage<S>(legacyKeys: Record<string, string> = {}): PersistStorage<S> | undefined {
  const storage: StateStorage = {
    getItem: async (name) => {
      const value = await localforage.getItem<string>(name)
      if (value !== null) return value
      const legacyKey = legacyKeys[name]
      if (!legacyKey) return null
      const legacy = await localforage.getItem<string>(legacyKey)
      if (legacy === null) return null
      await localforage.setItem(name, legacy)
      await localforage.removeItem(legacyKey)
      return legacy
    },
    setItem: async (name, value) => {
      await localforage.setItem(name, value)
    },
    removeItem: async (name) => {
      await localforage.removeItem(name)
    },
  }
  return createJSONStorage<S>(() => storage)
}

/**
 * localforage-backed storage for zustand `persist` that stores state by
 * structured clone instead of JSON — needed for values JSON can't hold, such
 * as FileSystemFileHandle (IndexedDB clones them natively).
 */
export function localforageStructuredStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => (await localforage.getItem<StorageValue<S>>(name)) ?? null,
    setItem: async (name, value) => {
      await localforage.setItem(name, value)
    },
    removeItem: async (name) => {
      await localforage.removeItem(name)
    },
  }
}
