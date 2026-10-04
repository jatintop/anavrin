// Tiny IndexedDB key-value store with an in-memory fallback (private windows, blocked storage).
const mem = new Map<string, unknown>()
let dbp: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('anavrin-demo', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  if (!db) return mem.get(key) as T | undefined
  return new Promise((resolve) => {
    try {
      const r = db.transaction('kv').objectStore('kv').get(key)
      r.onsuccess = () => resolve(r.result as T | undefined)
      r.onerror = () => resolve(mem.get(key) as T | undefined)
    } catch {
      resolve(mem.get(key) as T | undefined)
    }
  })
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  mem.set(key, value)
  const db = await open()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function kvClear(): Promise<void> {
  mem.clear()
  const db = await open()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
