// Pieces shared by the Stall, Friends & family and Dues screens.
import { useMemo, useState } from 'react'
import { useData, useMe, useRepo } from '../data/repo'
import type { Item, PayMethod, Sale, SaleKind, SaleLine } from '../data/types'
import { PAY_LABEL } from '../data/types'
import { familyId, nextSeq, parseItemQuery, saleId, todayIso, yymm, yymmdd } from '../lib/ids'
import { money } from '../lib/purchase'
import { applyDiscount, spreadTotal, type Discount } from '../lib/sale'
import { fmtDate, Icon, StatusPill } from '../ui'

export interface CartLine { item: Item; price: number }

/** Sarees matching what was typed: "KAN12", "kan-2610-012", or part of a design / vendor name. */
export function searchItems(items: Item[], q: string): Item[] {
  const text = q.trim().toLowerCase()
  if (!text) return []
  const pq = parseItemQuery(q)
  return items.filter((i) => {
    if (i.deleted) return false
    if (pq.exact) return i.id === pq.exact
    if (pq.type && pq.seq != null) return i.type === pq.type && Number(i.id.slice(-3)) === pq.seq
    return i.id.toLowerCase().includes(text) || i.design.toLowerCase().includes(text)
  })
}

export const available = (i: Item) => i.status === 'in_stock' || i.status === 'unpriced'

/** Next sale number for this person: S-261004-J07 (stall, per day) or F-2610-J08 (family, per month). */
export function newSaleId(sales: Sale[], kind: SaleKind, date: string, initial: string): string {
  const prefix = kind === 'stall' ? `S-${yymmdd(date)}-${initial}` : `F-${yymm(date)}-${initial}`
  const n = nextSeq(sales.map((s) => s.id), prefix)
  return kind === 'stall' ? saleId(date, initial, n) : familyId(date, initial, n)
}

/** Search box + matches; tapping a match adds it to the basket. */
export function SareePicker({ inCart, onAdd }: { inCart: Set<string>; onAdd: (i: Item) => void }) {
  const { items } = useData()
  const [q, setQ] = useState('')
  const found = useMemo(() => searchItems(items, q).filter((i) => !inCart.has(i.id)).slice(0, 8), [items, q, inCart])
  const add = (i: Item) => { onAdd(i); setQ('') }
  return (
    <div className="stack">
      <input id="sell-search" className="input id" type="search" autoComplete="off" enterKeyHint="done"
        placeholder="Saree ID (KAN12) or design" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const ok = found.filter(available); if (ok.length === 1) add(ok[0]) } }} />
      {q.trim() && (
        <div className="panel card-list" style={{ padding: '0 12px' }}>
          {found.length === 0 && <div className="empty small">No saree matches “{q.trim()}”.</div>}
          {found.map((i) => (
            <button key={i.id} className="rowlink pick" disabled={!available(i)} onClick={() => add(i)}>
              <div className="grow">
                <div className="id"><b>{i.id}</b></div>
                <div className="small muted ellipsis">{i.design}</div>
              </div>
              <div style={{ textAlign: 'right' }} className="num">
                <div>{i.price != null ? money(i.price) : 'No price'}</div>
                {!available(i) ? <StatusPill s={i.status} /> : <span className="small" style={{ color: 'var(--maroon)' }}>Add</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The sarees in this sale. Prices can be changed when `editable`, or when the saree has no price yet. */
export function Cart({ lines, editable, onChange }: { lines: CartLine[]; editable: boolean; onChange: (l: CartLine[]) => void }) {
  if (!lines.length) return <div className="empty small">Type a saree ID above to add it.</div>
  return (
    <div className="panel card-list" style={{ padding: '0 12px' }}>
      {lines.map((l, k) => (
        <div key={l.item.id} className="row" style={{ padding: '10px 0', flexWrap: 'nowrap' }}>
          <div className="grow">
            <div className="id"><b>{l.item.id}</b></div>
            <div className="small muted ellipsis">{l.item.design}</div>
          </div>
          {editable || l.item.price == null ? (
            <input id={`cart-price-${l.item.id}`} className="input num" style={{ width: 104, textAlign: 'right' }} inputMode="numeric" aria-label={`Price for ${l.item.id}`}
              placeholder="₹" value={l.price || ''} onChange={(e) => onChange(lines.map((x, j) => (j === k ? { ...x, price: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)))} />
          ) : <span className="num">{money(l.price)}</span>}
          <button className="iconbtn" aria-label={`Remove ${l.item.id}`} onClick={() => onChange(lines.filter((_, j) => j !== k))}><Icon name="x" size={18} /></button>
        </div>
      ))}
    </div>
  )
}

const CHIPS: { label: string; d: Discount }[] = [
  { label: 'No discount', d: { kind: 'none' } },
  { label: '5%', d: { kind: 'pct', v: 5 } },
  { label: '10%', d: { kind: 'pct', v: 10 } },
  { label: '15%', d: { kind: 'pct', v: 15 } },
  { label: '−₹100', d: { kind: 'off', v: 100 } },
  { label: '−₹200', d: { kind: 'off', v: 200 } },
]
const same = (a: Discount, b: Discount) => a.kind === b.kind && (a.kind === 'none' || (a as { v: number }).v === (b as { v: number }).v)

export function DiscountPicker({ base, d, onChange }: { base: number; d: Discount; onChange: (d: Discount) => void }) {
  const total = applyDiscount(base, d)
  return (
    <div className="stack">
      <div className="segmented wrap" role="group" aria-label="Discount">
        {CHIPS.map((c) => <button key={c.label} aria-pressed={same(c.d, d)} onClick={() => onChange(c.d)}>{c.label}</button>)}
      </div>
      <div className="spread">
        <span className="muted small num">{base !== total ? <>Tag {money(base)} · discount {money(base - total)}</> : 'Total'}</span>
        <label className="row" style={{ gap: 6 }}>
          <span className="mini">Final ₹</span>
          <input id="sell-final" className="input num total" style={{ width: 130, textAlign: 'right' }} inputMode="numeric"
            value={total || ''} onChange={(e) => onChange({ kind: 'final', v: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        </label>
      </div>
    </div>
  )
}

/** Build the sale record from the basket. */
export function buildSale(p: {
  sales: Sale[]; kind: SaleKind; date: string; lines: CartLine[]; total: number; payment: PayMethod
  place?: string; customer?: string; phone?: string; note?: string; by: { id: string; initial: string }
}): Sale {
  const now = Date.now()
  const prices = spreadTotal(p.lines.map((l) => l.price), p.total)
  const lines: SaleLine[] = p.lines.map((l, k) => ({ itemId: l.item.id, design: l.item.design, tag: l.item.price ?? l.price, price: prices[k] }))
  const tagTotal = lines.reduce((a, l) => a + l.tag, 0)
  return {
    id: newSaleId(p.sales, p.kind, p.date, p.by.initial), kind: p.kind, date: p.date, place: p.place?.trim() ?? '',
    customer: p.customer?.trim() ?? '', phone: p.phone?.trim() ?? '', lines, tagTotal, discount: tagTotal - p.total, total: p.total,
    payment: p.payment, settledOn: '', note: p.note?.trim() ?? '', createdBy: p.by.id, createdAt: now, updatedBy: p.by.id, updatedAt: now,
  }
}

export function PayPill({ s }: { s: Sale }) {
  const cls = s.deleted ? 'returned' : s.payment === 'pending' ? 'unpriced' : 'in_stock'
  return <span className={`pill ${cls}`}>{s.deleted ? 'Cancelled' : PAY_LABEL[s.payment]}</span>
}

/** One sale in a list; tap to see the sarees, mark it paid, or cancel it. */
export function SaleRow({ s, showDate }: { s: Sale; showDate?: boolean }) {
  const repo = useRepo()
  const me = useMe()
  const { users } = useData()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const who = users.find((u) => u.id === s.createdBy)?.name
  return (
    <div>
      <button className="rowlink pick" aria-expanded={open} onClick={() => { setOpen(!open); setConfirm(false) }}>
        <div className="grow">
          <div className="ellipsis"><span className="id">{s.id}</span>{s.customer ? ` · ${s.customer}` : ''}</div>
          <div className="small muted ellipsis">{showDate ? `${fmtDate(s.date)} · ` : ''}{s.lines.length} saree{s.lines.length > 1 ? 's' : ''}{s.place ? ` · ${s.place}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }} className="num"><div>{money(s.total)}</div><PayPill s={s} /></div>
      </button>
      {open && (
        <div className="stack" style={{ padding: '0 0 14px' }}>
          <table className="simple num"><tbody>
            {s.lines.map((l) => (
              <tr key={l.itemId}><td><span className="id">{l.itemId}</span><div className="small muted">{l.design}</div></td>
                <td className="r">{l.price !== l.tag && <div className="small muted"><s>{money(l.tag)}</s></div>}{money(l.price)}</td></tr>
            ))}
          </tbody></table>
          <div className="small muted">
            {fmtDate(s.date)}{who ? ` · by ${who}` : ''}{s.phone ? ` · ${s.phone}` : ''}
            {s.settledOn ? ` · paid ${fmtDate(s.settledOn)} by ${PAY_LABEL[s.payment]}` : ''}{s.note ? ` · ${s.note}` : ''}
          </div>
          {!s.deleted && s.payment === 'pending' && (
            <div className="row">
              <span className="grow small">Money received?</span>
              <button className="btn small" onClick={() => repo.settleSale(s.id, 'upi', todayIso(), me)}>Paid · UPI</button>
              <button className="btn small" onClick={() => repo.settleSale(s.id, 'cash', todayIso(), me)}>Paid · Cash</button>
            </div>
          )}
          {s.deleted ? (
            <button className="btn small" onClick={() => repo.setSaleDeleted(s.id, false, me)}>Undo cancel</button>
          ) : !confirm ? (
            <button className="btn small danger" onClick={() => setConfirm(true)}>Cancel this sale</button>
          ) : (
            <div className="check error stack">
              <span>Cancel {s.id}? Its sarees go back into stock.</span>
              <div className="row">
                <button className="btn small grow" onClick={() => setConfirm(false)}>Keep it</button>
                <button className="btn small danger grow" onClick={() => { repo.setSaleDeleted(s.id, true, me); setConfirm(false) }}>Cancel sale</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const sumTotal = (xs: { total: number }[]) => xs.reduce((a, x) => a + x.total, 0)
