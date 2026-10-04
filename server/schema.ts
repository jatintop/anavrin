// How each kind of record is laid out as a tab in the Google Sheet.
// Headers are written for people reading the sheet; `key` is the field name in the app.
import type { AdjustmentReason, DocType } from '../src/lib/bill'
import type { AppUser, Item, ItemStatus, Purchase, PurchaseLine, Sale, SaleLine, SareeType, Settings, Vendor } from '../src/data/types'
import { PAY_LABEL, STATUS_LABEL } from '../src/data/types'

export type Kind = 'text' | 'num' | 'bool' | 'time' | 'status' | 'doctype' | 'list' | 'photos' | 'label'
/** `labels`: app value → what the sheet shows (kind 'label') */
export interface Col { key: string; header: string; kind: Kind; width?: number; labels?: Record<string, string> }
export interface Table { name: string; cols: Col[] }

const T = (key: string, header: string, width?: number): Col => ({ key, header, kind: 'text', width })
const N = (key: string, header: string): Col => ({ key, header, kind: 'num', width: 90 })
const B = (key: string, header: string): Col => ({ key, header, kind: 'bool', width: 80 })
const TM = (key: string, header: string): Col => ({ key, header, kind: 'time', width: 130 })
const L = (key: string, header: string, labels: Record<string, string>): Col => ({ key, header, kind: 'label', width: 90, labels })

export const ITEMS: Table = {
  name: 'Sarees',
  cols: [
    T('id', 'Saree ID', 120), T('type', 'Type', 60), T('design', 'Design', 180), { key: 'status', header: 'Status', kind: 'status', width: 100 },
    N('price', 'Price ₹'), N('cost', 'Cost ₹'), T('vendorName', 'Vendor', 160), T('purchaseDate', 'Bought on', 100),
    T('purchaseId', 'Purchase', 100), T('vendorId', 'Vendor code', 100), B('deleted', 'Deleted'),
    T('createdBy', 'Added by', 90), TM('createdAt', 'Added at'), T('updatedBy', 'Changed by', 90), TM('updatedAt', 'Changed at'),
  ],
}

export const PURCHASES: Table = {
  name: 'Purchases',
  cols: [
    T('id', 'Purchase', 100), T('vendorName', 'Vendor', 160), T('billNo', 'Bill no.', 120), T('billDate', 'Bill date', 100),
    { key: 'docType', header: 'Bill type', kind: 'doctype', width: 100 }, N('totalQty', 'Pieces'), N('subtotal', 'Subtotal ₹'),
    N('tax', 'GST ₹'), N('roundOff', 'Round off ₹'), N('grandTotal', 'Grand total ₹'), N('adjAmount', 'Deduction ₹'),
    T('adjReason', 'Deduction reason', 110), N('amountPaid', 'Paid ₹'), { key: 'photoRefs', header: 'Bill photo', kind: 'photos', width: 220 },
    B('readByAi', 'Read by AI'), B('checksOverridden', 'Saved despite mismatch'), B('deleted', 'Deleted'), T('vendorId', 'Vendor code', 100),
    T('createdBy', 'Added by', 90), TM('createdAt', 'Added at'), T('updatedBy', 'Changed by', 90), TM('updatedAt', 'Changed at'),
  ],
}

export const LINES: Table = {
  name: 'Bill lines',
  cols: [
    T('purchaseId', 'Purchase', 100), N('lineNo', 'Line'), T('description', 'Design (as printed)', 200), T('type', 'Type', 60),
    N('qty', 'Qty'), N('rate', 'Rate ₹'), N('discountPct', 'Disc %'), N('amount', 'Amount ₹'), N('unitCost', 'Cost each ₹'),
    { key: 'itemIds', header: 'Saree IDs', kind: 'list', width: 260 }, T('hsn', 'HSN', 80),
  ],
}

export const VENDORS: Table = { name: 'Vendors', cols: [T('id', 'Code', 140), T('name', 'Vendor', 200), T('defaultType', 'Usual type', 90)] }
export const TYPES: Table = { name: 'Saree types', cols: [T('code', 'Code', 70), T('name', 'Name', 200)] }
export const PEOPLE: Table = { name: 'People', cols: [T('id', 'ID', 120), T('name', 'Name', 140), T('initial', 'Initial', 70)] }
export const SETTINGS: Table = { name: 'Settings', cols: [B('gstRegistered', 'GST registered'), N('markupPct', 'Markup %'), N('roundTo', 'Round prices to ₹')] }
export const COUNTERS: Table = { name: 'Counters', cols: [T('key', 'Counter', 160), N('n', 'Last number')] }
export const LOG: Table = { name: 'Log', cols: [T('opId', 'Change ID', 240), TM('at', 'When'), T('by', 'Who', 90), T('action', 'What', 140), T('summary', 'Details', 360)] }

export const SALES: Table = {
  name: 'Sales',
  cols: [
    T('id', 'Sale', 130), T('date', 'Date', 100), L('kind', 'Kind', { stall: 'Stall', family: 'Family' }), T('place', 'Stall / place', 160),
    T('customer', 'Customer', 140), T('phone', 'Phone', 110), N('qty', 'Sarees'), { key: 'itemIds', header: 'Saree IDs', kind: 'list', width: 260 },
    N('tagTotal', 'Tag total ₹'), N('discount', 'Discount ₹'), N('total', 'Total ₹'), L('payment', 'Payment', PAY_LABEL),
    T('settledOn', 'Dues paid on', 100), T('note', 'Note', 180), B('deleted', 'Cancelled'),
    T('createdBy', 'Added by', 90), TM('createdAt', 'Added at'), T('updatedBy', 'Changed by', 90), TM('updatedAt', 'Changed at'),
  ],
}

export const SALE_LINES: Table = {
  name: 'Sale lines',
  cols: [T('saleId', 'Sale', 130), N('lineNo', 'Line'), T('itemId', 'Saree ID', 120), T('design', 'Design', 180), N('tag', 'Tag price ₹'), N('price', 'Sold for ₹')],
}

export const EXPENSES: Table = {
  name: 'Expenses',
  cols: [
    T('id', 'Expense', 120), T('date', 'Date', 100), T('category', 'Type', 130), N('amount', 'Amount ₹'), T('note', 'Note', 220),
    { key: 'photoRefs', header: 'Receipt photo', kind: 'photos', width: 220 }, B('deleted', 'Deleted'),
    T('createdBy', 'Added by', 90), TM('createdAt', 'Added at'), T('updatedBy', 'Changed by', 90), TM('updatedAt', 'Changed at'),
  ],
}

export const ALL_TABLES = [ITEMS, PURCHASES, LINES, SALES, SALE_LINES, EXPENSES, VENDORS, TYPES, PEOPLE, SETTINGS, COUNTERS, LOG]

// ---------- value conversion ----------
const pad2 = (n: number) => String(n).padStart(2, '0')
/** ms → "2026-10-04 15:30:12" in the script's time zone (Asia/Kolkata) */
export function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}
export function parseTime(v: unknown): number {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime() : 0
}
function dateText(v: unknown): string {
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  return v == null ? '' : String(v)
}
const LABEL_TO_STATUS = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [v.toLowerCase(), k])) as Record<string, ItemStatus>
const DOC_LABEL: Record<DocType, string> = { tax_invoice: 'Tax invoice', quotation: 'Quotation', estimate: 'Estimate', other: 'Other' }
const LABEL_TO_DOC = Object.fromEntries(Object.entries(DOC_LABEL).map(([k, v]) => [v.toLowerCase(), k])) as Record<string, DocType>
export const driveUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`

export function toCell(kind: Kind, v: unknown, labels?: Record<string, string>): string | number | boolean {
  switch (kind) {
    case 'label': return labels?.[String(v)] ?? String(v ?? '')
    case 'num': return v == null || v === '' ? '' : Number(v)
    case 'bool': return v === true
    case 'time': return typeof v === 'number' && v > 0 ? fmtTime(v) : ''
    case 'status': return STATUS_LABEL[v as ItemStatus] ?? String(v ?? '')
    case 'doctype': return DOC_LABEL[v as DocType] ?? 'Other'
    case 'list': return Array.isArray(v) ? v.join(', ') : ''
    case 'photos': return Array.isArray(v) ? v.map((id) => driveUrl(String(id))).join('\n') : ''
    default: return v == null ? '' : String(v)
  }
}

export function fromCell(kind: Kind, v: unknown, labels?: Record<string, string>): unknown {
  switch (kind) {
    case 'label': {
      const t = String(v ?? '').trim().toLowerCase()
      return Object.entries(labels ?? {}).find(([k, l]) => l.toLowerCase() === t || k === t)?.[0] ?? t
    }
    case 'num': return v === '' || v == null ? null : Number(v)
    case 'bool': return v === true || String(v).toUpperCase() === 'TRUE'
    case 'time': return parseTime(v)
    case 'status': {
      const s = String(v ?? '').trim()
      return LABEL_TO_STATUS[s.toLowerCase()] ?? (s in STATUS_LABEL ? s : 'in_stock')
    }
    case 'doctype': return LABEL_TO_DOC[String(v ?? '').toLowerCase()] ?? 'other'
    case 'list': return String(v ?? '').split(/[,\s]+/).filter(Boolean)
    case 'photos': return String(v ?? '').split(/\s+/).map((u) => u.match(/\/d\/([\w-]+)/)?.[1] ?? '').filter(Boolean)
    default: return dateText(v)
  }
}

export const rowToRecord = (t: Table, row: unknown[]): Record<string, unknown> =>
  Object.fromEntries(t.cols.map((c, i) => [c.key, fromCell(c.kind, row[i], c.labels)]))
export const recordToRow = (t: Table, r: Record<string, unknown>): (string | number | boolean)[] =>
  t.cols.map((c) => toCell(c.kind, r[c.key], c.labels))

// ---------- record shapes ----------
export const itemFromRec = (r: Record<string, unknown>): Item => ({ ...(r as unknown as Item), deleted: r.deleted === true })
export function purchaseToRec(p: Purchase): Record<string, unknown> {
  const { lines: _l, adjustment, ...rest } = p
  return { ...rest, adjAmount: adjustment?.amount ?? null, adjReason: adjustment?.reason ?? '' }
}
export function purchaseFromRec(r: Record<string, unknown>, lines: PurchaseLine[]): Purchase {
  const { adjAmount, adjReason, ...rest } = r
  return {
    ...(rest as unknown as Purchase),
    adjustment: adjAmount ? { amount: Number(adjAmount), reason: (String(adjReason) || 'other') as AdjustmentReason } : null,
    lines,
  }
}
export const lineToRec = (purchaseId: string, l: PurchaseLine, i: number) => ({ ...l, purchaseId, lineNo: i + 1 })
export function lineFromRec(r: Record<string, unknown>): PurchaseLine & { purchaseId: string; lineNo: number } {
  return r as unknown as PurchaseLine & { purchaseId: string; lineNo: number }
}
export function saleToRec(s: Sale): Record<string, unknown> {
  const { lines, ...rest } = s
  return { ...rest, qty: lines.length, itemIds: lines.map((l) => l.itemId) }
}
export function saleFromRec(r: Record<string, unknown>, lines: SaleLine[]): Sale {
  const { qty: _q, itemIds: _i, ...rest } = r
  return { ...(rest as unknown as Sale), deleted: r.deleted === true, lines }
}
export const saleLineToRec = (saleId: string, l: SaleLine, i: number) => ({ ...l, saleId, lineNo: i + 1 })

export type { AppUser, SareeType, Settings, Vendor }
