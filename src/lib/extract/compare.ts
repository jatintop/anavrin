// Field-by-field comparison of an extracted bill against a hand-checked "golden" answer.
import type { ExtractedBill } from '../bill'

export interface FieldResult { field: string; expected: unknown; got: unknown; ok: boolean }

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Loose name match: same letters/digits ignoring spaces & punctuation, or ≥75% character overlap. */
export function similar(a: string, b: string): boolean {
  const x = norm(a), y = norm(b)
  if (!x || !y) return x === y
  if (x === y || x.includes(y) || y.includes(x)) return true
  const grams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)))
  const gx = grams(x), gy = grams(y)
  let hit = 0
  gx.forEach((g) => { if (gy.has(g)) hit++ })
  return (2 * hit) / (gx.size + gy.size || 1) >= 0.75
}

const numEq = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.011)

export function compareBills(expected: ExtractedBill, got: ExtractedBill): FieldResult[] {
  const r: FieldResult[] = []
  const push = (field: string, e: unknown, g: unknown, ok: boolean) => r.push({ field, expected: e, got: g, ok })
  push('billNo', expected.billNo, got.billNo, norm(expected.billNo) === norm(got.billNo))
  push('billDate', expected.billDate, got.billDate, expected.billDate === got.billDate)
  push('vendorGstin', expected.vendorGstin, got.vendorGstin, norm(expected.vendorGstin) === norm(got.vendorGstin))
  push('lineCount', expected.lines.length, got.lines.length, expected.lines.length === got.lines.length)
  expected.lines.forEach((e, i) => {
    const g = got.lines[i]
    push(`line${i + 1}.name`, e.description, g?.description, !!g && similar(e.description, g.description))
    push(`line${i + 1}.qty`, e.qty, g?.qty, !!g && e.qty === g.qty)
    push(`line${i + 1}.rate`, e.rate, g?.rate, !!g && numEq(e.rate, g.rate))
    push(`line${i + 1}.amount`, e.amount, g?.amount, !!g && numEq(e.amount, g.amount))
  })
  for (const k of ['totalQty', 'subtotal', 'grandTotal'] as const) push(k, expected[k], got[k], numEq(expected[k], got[k]))
  const eh = expected.handwrittenNotes.map((h) => h.amount).filter((a) => a != null)
  const gh = got.handwrittenNotes.map((h) => h.amount).filter((a) => a != null)
  push('handwrittenAmounts', eh, gh, eh.every((a) => gh.some((b) => numEq(a, b)) || gh.some((b) => numEq(-(a as number), b))))
  return r
}
