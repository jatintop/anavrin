// Demo store: everything lives in this browser (IndexedDB). Same behaviour as the Firebase store,
// so the whole app can be tried before any account is set up.
import golden from '../../golden/expected.json'
import { normalizeBill, taxTotal } from '../lib/bill'
import { buildPurchase, draftLinesFromBill } from '../lib/purchase'
import { kvClear, kvGet, kvSet } from './idb'
import { EMPTY, type AuthInfo, type Repo } from './repo'
import { DEFAULT_SETTINGS, DEFAULT_TYPES, DEFAULT_VENDORS } from './seed'
import type { AppUser, DataState, PurchaseDraft } from './types'

interface Stored extends Omit<DataState, 'ready'> {
  counters: Record<string, number>
}

const ME_KEY = 'anavrin-demo-me'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* storage blocked */ }
}

function sampleState(): Stored {
  const owner: AppUser = { id: 'u-jatin', name: 'Jatin', initial: 'J' }
  let s: Stored = {
    users: [owner], vendors: DEFAULT_VENDORS, types: DEFAULT_TYPES, settings: DEFAULT_SETTINGS,
    purchases: [], items: [], counters: {},
  }
  // Two of the real sample bills, already entered, so Stock and Price & Label have something in them.
  const g = golden as Record<string, unknown>
  const samples: [string, string][] = [['popular-silk-PS-2713.jpg', 'popular-silk'], ['mahapragya-1612.png', 'mahapragya']]
  samples.forEach(([file, vendorId], n) => {
    const b = normalizeBill(g[file])
    const vendor = s.vendors.find((v) => v.id === vendorId)!
    const draft: PurchaseDraft = {
      vendorId, vendorName: vendor.name, billNo: b.billNo ?? '', billDate: b.billDate!, docType: b.docType,
      lines: draftLinesFromBill(b, vendor, s.types), subtotal: b.subtotal!, tax: taxTotal(b),
      roundOff: b.roundOff ?? 0, grandTotal: b.grandTotal!, adjustment: null, amountPaid: b.grandTotal,
      photoRefs: [], readByAi: true, checksOverridden: false,
    }
    const out = buildPurchase(draft, s.counters, s.settings, owner, Date.now() - (2 - n) * 86400000)
    // price the Mahapragya sarees so some stock is ready to sell
    const items = n === 1 ? out.items.map((i) => ({ ...i, price: Math.ceil((i.cost * 1.6) / 50) * 50, status: 'in_stock' as const })) : out.items
    s = { ...s, purchases: [out.purchase, ...s.purchases], items: [...s.items, ...items], counters: out.counters }
  })
  return s
}

export function createDemoRepo(): Repo {
  let state: Stored | null = null
  const listeners = new Set<(s: DataState) => void>()
  const authListeners = new Set<(a: AuthInfo | null) => void>()
  const photoUrls = new Map<string, string>()

  const load = (async () => {
    state = (await kvGet<Stored>('state')) ?? sampleState()
    emit()
  })()

  let snap: DataState = EMPTY
  function emit() {
    if (!state) return
    const { counters: _c, ...rest } = state
    snap = { ...rest, ready: true }
    listeners.forEach((l) => l(snap))
  }
  async function commit(next: Stored) {
    state = next
    emit()
    await kvSet('state', next)
  }
  const cur = async () => { await load; return state! }
  const auth = (): AuthInfo | null => {
    const id = lsGet(ME_KEY)
    return id ? { uid: id, email: null, displayName: null } : null
  }

  return {
    mode: 'demo',
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    snapshot: () => snap,
    onAuth(fn) {
      authListeners.add(fn)
      fn(auth())
      return () => { authListeners.delete(fn) }
    },
    async signIn(id) {
      lsSet(ME_KEY, id ?? null)
      authListeners.forEach((l) => l(auth()))
    },
    async signOut() {
      lsSet(ME_KEY, null)
      authListeners.forEach((l) => l(null))
    },
    async saveUser(u) {
      const s = await cur()
      await commit({ ...s, users: [...s.users.filter((x) => x.id !== u.id), u] })
    },
    async saveVendor(v) {
      const s = await cur()
      const i = s.vendors.findIndex((x) => x.id === v.id)
      await commit({ ...s, vendors: i < 0 ? [...s.vendors, v] : s.vendors.map((x) => (x.id === v.id ? v : x)) })
    },
    async deleteVendor(id) {
      const s = await cur()
      await commit({ ...s, vendors: s.vendors.filter((x) => x.id !== id) })
    },
    async saveType(t) {
      const s = await cur()
      const i = s.types.findIndex((x) => x.code === t.code)
      await commit({ ...s, types: i < 0 ? [...s.types, t] : s.types.map((x) => (x.code === t.code ? t : x)) })
    },
    async deleteType(code) {
      const s = await cur()
      await commit({ ...s, types: s.types.filter((x) => x.code !== code) })
    },
    async saveSettings(settings) {
      const s = await cur()
      await commit({ ...s, settings })
    },
    async savePurchase(d, by) {
      const s = await cur()
      const out = buildPurchase(d, s.counters, s.settings, by)
      await commit({ ...s, purchases: [out.purchase, ...s.purchases], items: [...s.items, ...out.items], counters: out.counters })
      return out.purchase
    },
    async setPurchaseDeleted(id, deleted, by) {
      const s = await cur()
      const now = Date.now()
      await commit({
        ...s,
        purchases: s.purchases.map((p) => (p.id === id ? { ...p, deleted, updatedBy: by.id, updatedAt: now } : p)),
        items: s.items.map((i) => (i.purchaseId === id ? { ...i, deleted, updatedBy: by.id, updatedAt: now } : i)),
      })
    },
    async updateItems(ids, patch, by) {
      const s = await cur()
      const set = new Set(ids)
      const now = Date.now()
      await commit({ ...s, items: s.items.map((i) => (set.has(i.id) ? { ...i, ...patch, updatedBy: by.id, updatedAt: now } : i)) })
    },
    async savePhoto(blob) {
      const ref = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await kvSet(ref, blob)
      return ref
    },
    async photoUrl(ref) {
      if (photoUrls.has(ref)) return photoUrls.get(ref)!
      const blob = await kvGet<Blob>(ref)
      if (!blob) return ''
      const url = URL.createObjectURL(blob)
      photoUrls.set(ref, url)
      return url
    },
    async resetDemo() {
      await kvClear()
      await commit(sampleState())
    },
  }
}
