// Serial numbers.
//   Saree:     KAN-2610-012   type · purchase YYMM · running no. per type per month
//   Purchase:  P-2610-005     running no. per month
//   Stall sale S-261004-P07   date · user initial · that user's running no. that day   (offline-safe)
//   Family     F-2610-P08     month · user initial · running no.                     (offline-safe)
//   Expense    E-2610-P31     month · user initial · running no.                     (offline-safe)
// Transactions carry the user's initial so two phones working offline never make the same ID.

export const pad = (n: number, w: number) => String(n).padStart(w, '0')

export function yymm(isoDate: string): string {
  const [y, m] = isoDate.split('-')
  return `${y.slice(2)}${m}`
}
export function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${y.slice(2)}${m}${d}`
}

export const isTypeCode = (s: string) => /^[A-Z]{3}$/.test(s)

export const itemId = (type: string, isoDate: string, seq: number) => `${type}-${yymm(isoDate)}-${pad(seq, 3)}`
export const purchaseId = (isoDate: string, seq: number) => `P-${yymm(isoDate)}-${pad(seq, 3)}`
export const saleId = (isoDate: string, initial: string, seq: number) => `S-${yymmdd(isoDate)}-${initial}${pad(seq, 2)}`
export const familyId = (isoDate: string, initial: string, seq: number) => `F-${yymm(isoDate)}-${initial}${pad(seq, 2)}`
export const expenseId = (isoDate: string, initial: string, seq: number) => `E-${yymm(isoDate)}-${initial}${pad(seq, 2)}`

/** Counter keys — one running number per key. */
export const itemCounterKey = (type: string, isoDate: string) => `item_${type}_${yymm(isoDate)}`
export const purchaseCounterKey = (isoDate: string) => `purchase_${yymm(isoDate)}`

/**
 * Parse what someone types at the stall into an item ID or a partial match.
 * "kan-2610-012" → exact; "KAN12" / "kan 12" → type KAN, number 12 (any month).
 */
export function parseItemQuery(q: string): { exact?: string; type?: string; seq?: number } {
  const s = q.trim().toUpperCase().replace(/\s+/g, '')
  const full = s.match(/^([A-Z]{3})-?(\d{4})-?(\d{1,4})$/)
  if (full) return { exact: `${full[1]}-${full[2]}-${pad(Number(full[3]), 3)}` }
  const short = s.match(/^([A-Z]{3})-?(\d{1,4})$/)
  if (short) return { type: short[1], seq: Number(short[2]) }
  const typeOnly = s.match(/^([A-Z]{1,3})$/)
  if (typeOnly) return { type: typeOnly[1] }
  return {}
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
}

/** Next running number for IDs that start with `prefix` (e.g. "S-261004-J"), from the ones already made. */
export function nextSeq(ids: string[], prefix: string): number {
  let max = 0
  for (const id of ids) if (id.startsWith(prefix)) max = Math.max(max, Number(id.slice(prefix.length)) || 0)
  return max + 1
}
