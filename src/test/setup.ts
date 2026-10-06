import { afterEach, vi } from 'vitest'

// In-memory localforage. The stores use `import * as localforage`, so the
// mock needs the named functions as well as a default export.
const memory = new Map<string, unknown>()

const memoryForage = {
  getItem: async <T>(key: string): Promise<T | null> =>
    (memory.has(key) ? structuredClone(memory.get(key)) : null) as T | null,
  setItem: async <T>(key: string, value: T): Promise<T> => {
    memory.set(key, structuredClone(value))
    return value
  },
  removeItem: async (key: string): Promise<void> => {
    memory.delete(key)
  },
  keys: async (): Promise<string[]> => [...memory.keys()],
  clear: async (): Promise<void> => {
    memory.clear()
  },
}

vi.mock('localforage', () => ({ ...memoryForage, default: memoryForage }))

afterEach(() => {
  memory.clear()
})

export { memory as localforageMemory }
