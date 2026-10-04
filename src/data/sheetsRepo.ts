// The real store: the family's Google Sheet, reached through the free Apps Script web app.
// Everything is cached on the phone, so the app opens instantly and works offline;
// changes wait in an outbox and are sent when the connection is back.
import type { ExtractedBill } from '../lib/bill'
import { applyOps, newOpId, type Envelope, type Op, type Tables } from '../lib/ops'
import { saveConnection, type Connection } from './connection'
import { kvGet, kvSet } from './idb'
import { EMPTY, type AuthInfo, type Repo } from './repo'
import type { AppUser, DataState, Purchase, PurchaseDraft } from './types'

interface Cache { server: Tables | null; outbox: Envelope[]; lastSync: number | null; sheetUrl?: string }

const ME_KEY = 'anavrin-me'
const DEPLOY_HINT = 'In Apps Script, paste the latest apps-script/Code.gs, then Deploy → Manage deployments → ✏️ → Version: New version → Deploy (not “New deployment”, which makes a different URL).'
const OUTDATED = `The Google Sheet server code is older than the app. ${DEPLOY_HINT} Sales and expenses are kept on this phone until then.`
/** Fill in tables an older server doesn't send yet. */
const withDefaults = (t: Tables): Tables => ({ ...t, sales: t.sales ?? [], expenses: t.expenses ?? [] })
const CACHE_KEY = 'sheet-cache'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* blocked */ } }

export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) { super(message); this.code = code }
}

/** Same bill → same change ID, so pressing Save twice after a dropped reply never saves it twice. */
function hashId(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ c, 2246822519)
  }
  return 'bill-' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export function createApi(conn: Connection) {
  return async function api<T>(body: Record<string, unknown>, timeoutMs = 45000): Promise<T> {
    let res: Response
    try {
      res = await fetch(conn.url, {
        method: 'POST',
        body: JSON.stringify({ key: conn.key, ...body }), // text/plain: no CORS preflight, works with Apps Script
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      throw new ApiError(navigator.onLine ? `Can’t reach the Google Sheet (${(e as Error).name === 'TimeoutError' ? 'timed out' : 'network error'}).` : 'No internet connection.', 'network')
    }
    if (!res.ok) throw new ApiError(`The Google Sheet server answered ${res.status}.`, 'http')
    const out = (await res.json().catch(() => ({ error: 'The server sent something unexpected. Is the web app deployed with access “Anyone”?' }))) as T & { error?: string; code?: string }
    if (out.error) throw new ApiError(out.error, out.code)
    return out
  }
}

export function createSheetsRepo(conn: Connection): Repo {
  const api = createApi(conn)
  let cache: Cache = { server: null, outbox: [], lastSync: null }
  let loaded = false
  let syncing = false
  let error: string | undefined
  let snap: DataState = EMPTY
  const listeners = new Set<(s: DataState) => void>()
  const authListeners = new Set<(a: AuthInfo | null) => void>()
  const photoUrls = new Map<string, string>()

  function rebuild() {
    const sync = { online: navigator.onLine, pending: cache.outbox.length, lastSync: cache.lastSync, syncing, error }
    if (!cache.server) {
      snap = { ...EMPTY, ready: loaded && !!error, error: loaded && error ? `${error} Connect to the internet once so the app can load your data.` : undefined, sync }
    } else {
      snap = { ...applyOps(withDefaults(cache.server), cache.outbox), ready: true, sync, sheetUrl: cache.sheetUrl }
    }
    listeners.forEach((l) => l(snap))
  }
  const persist = () => kvSet(CACHE_KEY, { ...cache, url: conn.url })

  async function flush(): Promise<void> {
    if (syncing || !navigator.onLine) return
    syncing = true
    rebuild()
    try {
      if (cache.outbox.length) {
        const batch = cache.outbox.slice(0, 50)
        const r = await api<{ applied: string[]; state: Tables }>({ action: 'ops', ops: batch })
        const done = new Set(r.applied)
        cache = { ...cache, server: r.state, outbox: cache.outbox.filter((e) => !done.has(e.opId)), lastSync: Date.now() }
      } else {
        const r = await api<{ state: Tables; sheetUrl: string }>({ action: 'all' })
        cache = { ...cache, server: r.state, sheetUrl: r.sheetUrl, lastSync: Date.now() }
      }
      error = cache.server?.sales ? undefined : OUTDATED
    } catch (e) {
      const msg = (e as Error).message
      // The last data came from an older server; say so, but keep the real error visible.
      error = cache.server && !cache.server.sales ? `${msg} — the server code may be older than the app. ${DEPLOY_HINT}` : msg
    } finally {
      syncing = false
      await persist()
      rebuild()
    }
    if (!error && cache.outbox.length) return flush()
  }

  const start = (async () => {
    const c = await kvGet<Cache & { url?: string }>(CACHE_KEY)
    if (c && c.url === conn.url) cache = { server: c.server, outbox: c.outbox ?? [], lastSync: c.lastSync, sheetUrl: c.sheetUrl }
    loaded = true
    rebuild()
    await flush()
  })()

  const refresh = () => { if (document.visibilityState === 'visible') flush() }
  window.addEventListener('online', () => { rebuild(); flush() })
  window.addEventListener('offline', rebuild)
  document.addEventListener('visibilitychange', refresh)
  setInterval(refresh, 60_000)

  async function enqueue(op: Op, by: string) {
    await start
    cache = { ...cache, outbox: [...cache.outbox, { opId: newOpId(), by, at: Date.now(), op }] }
    rebuild()
    await persist()
    flush()
  }
  const me = () => lsGet(ME_KEY) ?? ''
  const auth = (): AuthInfo | null => { const id = lsGet(ME_KEY); return id ? { uid: id, email: null, displayName: null } : null }

  return {
    mode: 'sheet',
    connection: conn,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    snapshot: () => snap,
    onAuth(fn) { authListeners.add(fn); fn(auth()); return () => { authListeners.delete(fn) } },
    async signIn(id) { lsSet(ME_KEY, id ?? null); authListeners.forEach((l) => l(auth())) },
    async signOut() { lsSet(ME_KEY, null); authListeners.forEach((l) => l(null)) },
    saveUser: (u) => enqueue({ t: 'saveUser', u }, u.id),
    saveVendor: (v) => enqueue({ t: 'saveVendor', v }, me()),
    deleteVendor: (id) => enqueue({ t: 'deleteVendor', id }, me()),
    saveType: (type) => enqueue({ t: 'saveType', type }, me()),
    deleteType: (code) => enqueue({ t: 'deleteType', code }, me()),
    saveSettings: (s) => enqueue({ t: 'saveSettings', s }, me()),
    setPurchaseDeleted: (id, deleted, by) => enqueue({ t: 'setPurchaseDeleted', id, deleted }, by.id),
    updateItems: (ids, patch, by) => enqueue({ t: 'updateItems', ids, patch }, by.id),
    saveSale: (sale, by) => enqueue({ t: 'saveSale', sale }, by.id),
    setSaleDeleted: (id, deleted, by) => enqueue({ t: 'setSaleDeleted', id, deleted }, by.id),
    settleSale: (id, payment, on, by) => enqueue({ t: 'settleSale', id, payment, on }, by.id),
    saveExpense: (e, by) => enqueue({ t: 'saveExpense', e }, by.id),
    setExpenseDeleted: (id, deleted, by) => enqueue({ t: 'setExpenseDeleted', id, deleted }, by.id),

    // Saree numbers come from the sheet, so saving a bill needs internet (reading it does too).
    async savePurchase(d: PurchaseDraft, by: AppUser): Promise<Purchase> {
      await start
      await flush()
      if (cache.outbox.length) throw new ApiError(error ?? 'Earlier changes are still waiting to sync.', 'network')
      const r = await api<{ purchase: Purchase; state: Tables }>({ action: 'savePurchase', opId: hashId(JSON.stringify(d)), draft: d, by: by.id }, 60000)
      cache = { ...cache, server: r.state, lastSync: Date.now() }
      await persist()
      rebuild()
      return r.purchase
    },
    async readBill(images: Blob[]): Promise<ExtractedBill & { photoRefs: string[] }> {
      const payload = await Promise.all(images.map(async (b) => ({ data: await blobToBase64(b), mimeType: b.type || 'image/jpeg' })))
      const r = await api<{ bill: ExtractedBill; photoRefs: string[] }>({ action: 'readBill', images: payload }, 150000)
      return { ...r.bill, photoRefs: r.photoRefs }
    },
    async savePhoto(blob) {
      const r = await api<{ ref: string }>({ action: 'uploadPhoto', image: { data: await blobToBase64(blob), mimeType: blob.type || 'image/jpeg' } }, 60000)
      return r.ref
    },
    async photoUrl(ref) {
      if (photoUrls.has(ref)) return photoUrls.get(ref)!
      const r = await api<{ data: string; mimeType: string }>({ action: 'photo', id: ref }, 60000)
      const url = `data:${r.mimeType};base64,${r.data}`
      photoUrls.set(ref, url)
      return url
    },
    syncNow: () => flush(),
    async disconnect() {
      saveConnection(null)
      await kvSet(CACHE_KEY, null)
      lsSet(ME_KEY, null)
    },
  }
}
