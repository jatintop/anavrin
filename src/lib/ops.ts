// Every change except saving a new bill is an "op". Ops are applied on the phone immediately,
// queued while offline, and replayed on the server (Google Sheet) when the phone is back online.
import type { AppUser, DataState, Item, SareeType, Settings, Vendor } from '../data/types'

export type ItemPatch = Partial<Pick<Item, 'price' | 'status' | 'type' | 'design'>>

export type Op =
  | { t: 'saveUser'; u: AppUser }
  | { t: 'saveVendor'; v: Vendor }
  | { t: 'deleteVendor'; id: string }
  | { t: 'saveType'; type: SareeType }
  | { t: 'deleteType'; code: string }
  | { t: 'saveSettings'; s: Settings }
  | { t: 'setPurchaseDeleted'; id: string; deleted: boolean }
  | { t: 'updateItems'; ids: string[]; patch: ItemPatch }

export interface Envelope {
  opId: string
  by: string // person id
  at: number // ms
  op: Op
}

export type Tables = Omit<DataState, 'ready' | 'error' | 'sync' | 'sheetUrl'>

const upsert = <T,>(xs: T[], x: T, key: (t: T) => string) => {
  const k = key(x)
  return xs.some((y) => key(y) === k) ? xs.map((y) => (key(y) === k ? x : y)) : [...xs, x]
}

export function applyOp<S extends Tables>(s: S, e: Envelope): S {
  const { op, by, at } = e
  switch (op.t) {
    case 'saveUser': return { ...s, users: upsert(s.users, op.u, (u) => u.id) }
    case 'saveVendor': return { ...s, vendors: upsert(s.vendors, op.v, (v) => v.id) }
    case 'deleteVendor': return { ...s, vendors: s.vendors.filter((v) => v.id !== op.id) }
    case 'saveType': return { ...s, types: upsert(s.types, op.type, (t) => t.code) }
    case 'deleteType': return { ...s, types: s.types.filter((t) => t.code !== op.code) }
    case 'saveSettings': return { ...s, settings: op.s }
    case 'setPurchaseDeleted': return {
      ...s,
      purchases: s.purchases.map((p) => (p.id === op.id ? { ...p, deleted: op.deleted, updatedBy: by, updatedAt: at } : p)),
      items: s.items.map((i) => (i.purchaseId === op.id ? { ...i, deleted: op.deleted, updatedBy: by, updatedAt: at } : i)),
    }
    case 'updateItems': {
      const ids = new Set(op.ids)
      return { ...s, items: s.items.map((i) => (ids.has(i.id) ? { ...i, ...op.patch, updatedBy: by, updatedAt: at } : i)) }
    }
  }
}

export const applyOps = <S extends Tables>(s: S, es: Envelope[]): S => es.reduce(applyOp, s)

export const newOpId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
