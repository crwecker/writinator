/**
 * Serializes async tasks per key: each task for a key starts after the
 * previous one for that key settles. Used to keep read-modify-write cycles on
 * one localforage key from clobbering each other.
 */
export function createKeyedQueue(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const queues = new Map<string, Promise<unknown>>()
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = queues.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    queues.set(key, next)
    return next
  }
}
