// Turning a reviewed bill into a saved purchase + one stock item per piece.
// Pure functions: both the demo store and Firebase call these inside their own "transaction".
import type { AppUser, DraftLine, Item, Purchase, PurchaseDraft, SareeType, Settings, Vendor } from '../data/types'
import { normalizeBill, r2, unitCost, type ExtractedBill } from './bill'
import { itemCounterKey, itemId, purchaseCounterKey, purchaseId } from './ids'

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|[\s(/-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())

/** Counter keys this draft needs, so a transaction can read them first. */
export function counterKeys(d: PurchaseDraft): string[] {
  return [purchaseCounterKey(d.billDate), ...new Set(d.lines.map((l) => itemCounterKey(l.type, d.billDate)))]
}

export function buildPurchase(
  d: PurchaseDraft,
  counters: Record<string, number>,
  settings: Settings,
  by: AppUser,
  now = Date.now(),
): { purchase: Purchase; items: Item[]; counters: Record<string, number> } {
  const next = { ...counters }
  const take = (k: string) => (next[k] = (next[k] ?? 0) + 1)
  const pid = purchaseId(d.billDate, take(purchaseCounterKey(d.billDate)))
  const asBill: ExtractedBill = normalizeBill({ ...d, lines: d.lines, grandTotal: d.grandTotal, subtotal: d.subtotal })
  const stamp = { createdBy: by.id, createdAt: now, updatedBy: by.id, updatedAt: now }
  const items: Item[] = []
  const lines = d.lines.map((l) => {
    const cost = unitCost(l, asBill, { gstRegistered: settings.gstRegistered, adjustment: d.adjustment })
    const ids: string[] = []
    for (let k = 0; k < l.qty; k++) {
      const id = itemId(l.type, d.billDate, take(itemCounterKey(l.type, d.billDate)))
      ids.push(id)
      items.push({
        id, type: l.type, design: titleCase(l.description), purchaseId: pid,
        vendorId: d.vendorId, vendorName: d.vendorName, purchaseDate: d.billDate,
        cost, price: null, status: 'unpriced', ...stamp,
      })
    }
    return { ...l, unitCost: cost, itemIds: ids }
  })
  const purchase: Purchase = {
    id: pid, vendorId: d.vendorId, vendorName: d.vendorName, billNo: d.billNo, billDate: d.billDate,
    docType: d.docType, lines, totalQty: lines.reduce((a, l) => a + l.qty, 0), subtotal: d.subtotal,
    tax: d.tax, roundOff: d.roundOff, grandTotal: d.grandTotal, adjustment: d.adjustment,
    amountPaid: d.amountPaid, photoRefs: d.photoRefs, readByAi: d.readByAi,
    checksOverridden: d.checksOverridden, ...stamp,
  }
  return { purchase, items, counters: next }
}

/** Suggest a saree type from the printed name; falls back to the vendor's default. */
const KEYWORDS: [RegExp, string][] = [
  [/KANJ|KANCH|KANCHI/, 'KAN'],
  [/BANARAS|BENARAS/, 'BAN'],
  [/MYSORE/, 'MYS'],
  [/CHANDERI/, 'CHN'],
  [/IKK?AT|POCHAM/, 'PCH'],
  [/LINEN/, 'LIN'],
  [/ORGANZA/, 'ORG'],
  [/GEOR|CHIFFON/, 'GEO'],
  [/VISCO/, 'VIS'],
  [/\bMUL\b|COTTON|AJRAK/, 'CTN'],
]
export function guessType(description: string, vendor: Vendor | undefined, types: SareeType[]): string {
  const d = description.toUpperCase()
  const known = new Set(types.map((t) => t.code))
  for (const [re, code] of KEYWORDS) if (re.test(d) && known.has(code)) return code
  return vendor && known.has(vendor.defaultType) ? vendor.defaultType : (types[types.length - 1]?.code ?? 'OTH')
}

export function suggestPrice(cost: number, s: Settings): number {
  const raw = cost * (1 + s.markupPct / 100)
  const step = s.roundTo > 0 ? s.roundTo : 1
  return Math.ceil(raw / step) * step
}

export const money = (n: number | null | undefined) =>
  n == null ? '—' : '₹' + r2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const draftLinesFromBill = (b: ExtractedBill, vendor: Vendor | undefined, types: SareeType[]): DraftLine[] =>
  b.lines.map((l) => ({ ...l, type: guessType(l.description, vendor, types) }))

export function isDuplicate(purchases: Purchase[], vendorId: string, billNo: string): Purchase | undefined {
  const n = billNo.replace(/\W/g, '').toUpperCase()
  if (!n) return undefined
  return purchases.find((p) => !p.deleted && p.vendorId === vendorId && p.billNo.replace(/\W/g, '').toUpperCase() === n)
}
