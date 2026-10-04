// Every change except saving a new bill is an "op". Ops are applied on the phone immediately,
// queued while offline, and replayed on the server (Google Sheet) when the phone is back online.
import type { AppUser, DataState, Expense, Item, PayMethod, Sale, SareeType, Settings, Vendor } from '../data/types'

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
  | { t: 'saveSale'; sale: Sale }
  | { t: 'setSaleDeleted'; id: string; deleted: boolean }
  | { t: 'settleSale'; id: string; payment: Exclude<PayMethod, 'pending'>; on: string }
  | { t: 'saveExpense'; e: Expense }
  | { t: 'setExpenseDeleted'; id: string; deleted: boolean }

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

/** "S-261004-J07" taken → "S-261004-J08" (the first free number after it). */
export function nextFreeId(id: string, taken: Set<string>): string {
  const m = id.match(/^(.*?)(\d+)$/)
  if (!m) { let k = 2; while (taken.has(`${id}-${k}`)) k++; return `${id}-${k}` }
  let n = Number(m[2])
  let out = id
  while (taken.has(out)) out = m[1] + String(++n).padStart(m[2].length, '0')
  return out
}

interface Stamped { id: string; createdBy: string; createdAt: number }
/**
 * Add a record numbered on a phone (sales, expenses), or replace it when it's an edit of the same record.
 * If another phone already used that number (same person on two phones, offline), it gets the next free one.
 */
function placeNew<T extends Stamped>(xs: T[], x: T): { list: T[]; rec: T } {
  const same = xs.find((y) => y.id === x.id)
  if (!same) return { list: [...xs, x], rec: x }
  // the sheet keeps times to the second
  if (same.createdBy === x.createdBy && Math.floor(same.createdAt / 1000) === Math.floor(x.createdAt / 1000)) return { list: xs.map((y) => (y.id === x.id ? x : y)), rec: x }
  const rec = { ...x, id: nextFreeId(x.id, new Set(xs.map((y) => y.id))) }
  return { list: [...xs, rec], rec }
}

const soldStatus = (s: Sale) => (s.kind === 'family' ? 'family' : 'sold') as Item['status']

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
    case 'saveSale': {
      const { list } = placeNew(s.sales, op.sale)
      const ids = new Set(op.sale.lines.map((l) => l.itemId))
      const st = soldStatus(op.sale)
      return { ...s, sales: list, items: s.items.map((i) => (ids.has(i.id) ? { ...i, status: st, updatedBy: by, updatedAt: at } : i)) }
    }
    case 'setSaleDeleted': {
      const sale = s.sales.find((x) => x.id === op.id)
      if (!sale || !!sale.deleted === op.deleted) return s
      const ids = new Set(sale.lines.map((l) => l.itemId))
      const st = soldStatus(sale)
      return {
        ...s,
        sales: s.sales.map((x) => (x.id === op.id ? { ...x, deleted: op.deleted, updatedBy: by, updatedAt: at } : x)),
        items: s.items.map((i) => {
          if (!ids.has(i.id)) return i
          if (op.deleted && i.status !== st) return i // already changed by hand since; leave it
          const status = op.deleted ? (i.price != null ? 'in_stock' : 'unpriced') : st
          return { ...i, status, updatedBy: by, updatedAt: at }
        }),
      }
    }
    case 'settleSale': return {
      ...s,
      sales: s.sales.map((x) => (x.id === op.id && x.payment === 'pending' ? { ...x, payment: op.payment, settledOn: op.on, updatedBy: by, updatedAt: at } : x)),
    }
    case 'saveExpense': return { ...s, expenses: placeNew(s.expenses, op.e).list }
    case 'setExpenseDeleted': return {
      ...s,
      expenses: s.expenses.map((x) => (x.id === op.id ? { ...x, deleted: op.deleted, updatedBy: by, updatedAt: at } : x)),
    }
  }
}

export const applyOps = <S extends Tables>(s: S, es: Envelope[]): S => es.reduce(applyOp, s)

export const newOpId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
