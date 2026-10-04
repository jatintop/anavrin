// Bill (vendor invoice / quotation) shapes, normalisation, checks and cost maths.
// Shared by the app, the AI extractors and the eval script.

export type DocType = 'tax_invoice' | 'quotation' | 'estimate' | 'other'

export interface BillLine {
  description: string
  hsn: string | null
  qty: number
  rate: number
  discountPct: number | null
  amount: number
}

export interface HandNote {
  text: string
  amount: number | null
}

export interface ExtractedBill {
  vendorName: string | null
  vendorGstin: string | null
  docType: DocType
  billNo: string | null
  billDate: string | null // YYYY-MM-DD
  buyer: string | null
  lines: BillLine[]
  totalQty: number | null
  subtotal: number | null
  cgst: number | null
  sgst: number | null
  igst: number | null
  roundOff: number | null
  grandTotal: number | null
  handwrittenNotes: HandNote[]
  paidStamp: boolean
  warnings: string[]
}

export type CheckLevel = 'ok' | 'warn' | 'error'
export interface Check {
  id: string
  level: CheckLevel
  message: string
  line?: number
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export const r2 = (n: number) => Math.round(n * 100) / 100

/** "1,935.00" / "₹ 16,590.02" / 795 → number; anything unreadable → null */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.replace(/[₹,\s]|rs\.?|inr|pcs?/gi, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Indian bill dates → ISO. Accepts 18/09/2026, 18-09-26, 16-Jun-26, 2026-06-16. */
export function toIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (m) return iso(m[3], m[2], m[1])
  m = s.match(/^(\d{1,2})[\s/.-]([A-Za-z]{3})[A-Za-z]*[\s/.-](\d{2}|\d{4})$/)
  if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3], MONTHS[m[2].toLowerCase()], m[1])
  return null
}

function iso(y: string, mo: string, d: string) {
  const yyyy = y.length === 2 ? `20${y}` : y
  const out = `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  return Number.isNaN(Date.parse(out)) ? null : out
}

const DOC_TYPES: DocType[] = ['tax_invoice', 'quotation', 'estimate', 'other']

/** Coerce whatever a model returned into a clean ExtractedBill. Never throws. */
export function normalizeBill(raw: unknown): ExtractedBill {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const lines = Array.isArray(o.lines) ? o.lines : []
  return {
    vendorName: str(o.vendorName),
    vendorGstin: str(o.vendorGstin),
    docType: DOC_TYPES.includes(o.docType as DocType) ? (o.docType as DocType) : 'other',
    billNo: str(o.billNo),
    billDate: toIsoDate(o.billDate),
    buyer: str(o.buyer),
    lines: lines.map((l) => {
      const x = (l ?? {}) as Record<string, unknown>
      return {
        description: str(x.description) ?? '',
        hsn: str(String(x.hsn ?? '')) ,
        qty: toNum(x.qty) ?? 0,
        rate: toNum(x.rate) ?? 0,
        discountPct: toNum(x.discountPct),
        amount: toNum(x.amount) ?? 0,
      }
    }),
    totalQty: toNum(o.totalQty),
    subtotal: toNum(o.subtotal),
    cgst: toNum(o.cgst),
    sgst: toNum(o.sgst),
    igst: toNum(o.igst),
    roundOff: toNum(o.roundOff),
    grandTotal: toNum(o.grandTotal),
    handwrittenNotes: (Array.isArray(o.handwrittenNotes) ? o.handwrittenNotes : []).map((h) => {
      const x = (h ?? {}) as Record<string, unknown>
      return { text: str(x.text) ?? '', amount: toNum(x.amount) }
    }),
    paidStamp: o.paidStamp === true,
    warnings: (Array.isArray(o.warnings) ? o.warnings : []).filter((w): w is string => typeof w === 'string'),
  }
}

export const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))
export const taxTotal = (b: ExtractedBill) => r2((b.cgst ?? 0) + (b.sgst ?? 0) + (b.igst ?? 0))

/** Arithmetic checks shown on the review screen. Tolerance ₹1 for vendor rounding quirks. */
export function checkBill(b: ExtractedBill): Check[] {
  const out: Check[] = []
  if (!b.lines.length) {
    out.push({ id: 'no-lines', level: 'error', message: 'No items found on the bill' })
    return out
  }
  b.lines.forEach((l, i) => {
    if (!l.description) out.push({ id: `desc-${i}`, level: 'warn', line: i, message: `Line ${i + 1}: name is empty` })
    if (!Number.isInteger(l.qty) || l.qty <= 0)
      out.push({ id: `qty-${i}`, level: 'error', line: i, message: `Line ${i + 1}: quantity ${l.qty} is not a whole number` })
    const expected = l.qty * l.rate * (1 - (l.discountPct ?? 0) / 100)
    if (Math.abs(expected - l.amount) > 1)
      out.push({
        id: `math-${i}`, level: 'error', line: i,
        message: `Line ${i + 1}: ${l.qty} × ₹${l.rate} = ₹${r2(expected)}, but amount says ₹${l.amount}`,
      })
  })
  const lineSum = sum(b.lines.map((l) => l.amount))
  if (b.subtotal == null) out.push({ id: 'subtotal', level: 'warn', message: `Subtotal not found (items add up to ₹${lineSum})` })
  else if (Math.abs(lineSum - b.subtotal) > 1)
    out.push({ id: 'subtotal', level: 'error', message: `Items add up to ₹${lineSum} but the bill subtotal is ₹${b.subtotal}` })
  else out.push({ id: 'subtotal', level: 'ok', message: `Items add up to the subtotal ₹${b.subtotal}` })

  const qtySum = b.lines.reduce((a, l) => a + l.qty, 0)
  if (b.totalQty != null && qtySum !== b.totalQty)
    out.push({ id: 'qty', level: 'error', message: `Quantities add up to ${qtySum} but the bill says ${b.totalQty} pieces` })
  else if (b.totalQty != null) out.push({ id: 'qty', level: 'ok', message: `${qtySum} pieces` })

  if (b.grandTotal == null) out.push({ id: 'grand', level: 'error', message: 'Grand total not found' })
  else {
    const base = (b.subtotal ?? lineSum) + taxTotal(b)
    if (Math.abs(b.grandTotal - base) > 1)
      out.push({ id: 'grand', level: 'error', message: `Subtotal + GST = ₹${r2(base)} but grand total is ₹${b.grandTotal}` })
    else out.push({ id: 'grand', level: 'ok', message: `Grand total ₹${b.grandTotal} matches` })
  }
  return out
}

export const hasErrors = (cs: Check[]) => cs.some((c) => c.level === 'error')

export type AdjustmentReason = 'advance' | 'discount' | 'return' | 'other'
export interface Adjustment {
  amount: number // positive number deducted, e.g. 5000
  reason: AdjustmentReason
}

/**
 * Landed cost of one piece on a line.
 * Not GST-registered → GST and round-off are spread over items in proportion to value.
 * A "discount" adjustment lowers every piece's cost proportionally; other reasons don't.
 */
export function unitCost(line: BillLine, b: ExtractedBill, opts: { gstRegistered: boolean; adjustment?: Adjustment | null }): number {
  const base = line.qty ? line.amount / line.qty : 0
  const subtotal = b.subtotal ?? sum(b.lines.map((l) => l.amount))
  const grand = b.grandTotal ?? subtotal
  let factor = opts.gstRegistered || !subtotal ? 1 : grand / subtotal
  const adj = opts.adjustment
  if (adj && adj.reason === 'discount' && adj.amount > 0 && grand > 0) factor *= (grand - adj.amount) / grand
  return r2(base * factor)
}

/** Read a handwritten "-5000" style note as a deduction amount, if any. */
export function suggestedAdjustment(b: ExtractedBill): number | null {
  const n = b.handwrittenNotes.find((h) => h.amount != null && h.amount < 0)
  return n?.amount != null ? Math.abs(n.amount) : null
}
