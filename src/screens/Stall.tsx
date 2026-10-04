import { useMemo, useState } from 'react'
import { useData, useMe, useRepo } from '../data/repo'
import type { PayMethod } from '../data/types'
import { PAY_LABEL } from '../data/types'
import { todayIso } from '../lib/ids'
import { money } from '../lib/purchase'
import { Field, TopBar, useToast } from '../ui'
import { applyDiscount, type Discount } from '../lib/sale'
import { buildSale, Cart, DiscountPicker, SaleRow, SareePicker, sumTotal, type CartLine } from './sell'

const PLACE_KEY = 'anavrin-stall-place'
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* blocked */ } }

/** Fast sale entry at the stall. Works with no signal: sales wait on the phone and reach the sheet later. */
export function Stall() {
  const repo = useRepo()
  const me = useMe()
  const { sales } = useData()
  const [date, setDate] = useState(todayIso())
  const [place, setPlace] = useState(lsGet(PLACE_KEY))
  const [lines, setLines] = useState<CartLine[]>([])
  const [disc, setDisc] = useState<Discount>({ kind: 'none' })
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [askName, setAskName] = useState(false)
  const [toast, say] = useToast()

  const base = lines.reduce((a, l) => a + l.price, 0)
  const total = applyDiscount(base, disc)
  const inCart = useMemo(() => new Set(lines.map((l) => l.item.id)), [lines])
  const unpriced = lines.some((l) => !l.price)

  const dayList = sales.filter((s) => s.kind === 'stall' && s.date === date).sort((a, b) => b.createdAt - a.createdAt)
  const live = dayList.filter((s) => !s.deleted)
  const by = (p: PayMethod) => sumTotal(live.filter((s) => s.payment === p))

  async function sell(payment: PayMethod) {
    if (!lines.length || unpriced) return
    if (payment === 'pending' && !customer.trim()) { setAskName(true); return }
    const sale = buildSale({ sales, kind: 'stall', date, lines, total, payment, place, customer, phone, by: me })
    await repo.saveSale(sale, me)
    lsSet(PLACE_KEY, place.trim())
    say(`${sale.id} · ${money(total)} · ${PAY_LABEL[payment]}`)
    setLines([]); setDisc({ kind: 'none' }); setCustomer(''); setPhone(''); setAskName(false)
  }

  return (
    <>
      <TopBar title="Stall" back="/" />
      <div className="stack-lg">
        <section className="grid2">
          <Field label="Stall / place"><input id="stall-place" className="input" value={place} placeholder="e.g. Jayanagar Sunday" onChange={(e) => setPlace(e.target.value)} /></Field>
          <Field label="Date"><input id="stall-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || todayIso())} /></Field>
        </section>

        <section className="stack">
          <SareePicker inCart={inCart} onAdd={(i) => setLines([...lines, { item: i, price: i.price ?? 0 }])} />
          <Cart lines={lines} editable={false} onChange={setLines} />
          {lines.length > 0 && <DiscountPicker base={base} d={disc} onChange={setDisc} />}
          {unpriced && <p className="small" style={{ color: 'var(--err)' }}>Type a price for the saree that doesn’t have one.</p>}
          {lines.length > 0 && (
            <details className="panel" open={askName || !!customer}>
              <summary>Customer (needed for Pending)</summary>
              <div className="grid2" style={{ marginTop: 8 }}>
                <Field label="Name"><input id="stall-customer" className="input" value={customer} autoFocus={askName} onChange={(e) => setCustomer(e.target.value)} /></Field>
                <Field label="Phone"><input id="stall-phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              </div>
              {askName && !customer.trim() && <p className="small" style={{ color: 'var(--err)' }}>Add the customer’s name so the pending amount can be collected later.</p>}
            </details>
          )}
        </section>

        <section className="panel stack">
          <div className="spread"><h2>{date === todayIso() ? 'Today' : 'That day'}</h2><span className="num"><b>{money(sumTotal(live))}</b></span></div>
          <div className="stats num">
            <div><span className="mini">Sarees</span><b>{live.reduce((a, s) => a + s.lines.length, 0)}</b></div>
            <div><span className="mini">UPI</span><b>{money(by('upi'))}</b></div>
            <div><span className="mini">Cash</span><b>{money(by('cash'))}</b></div>
            <div><span className="mini">Pending</span><b>{money(by('pending'))}</b></div>
          </div>
          {dayList.length > 0 && <div className="card-list">{dayList.map((s) => <SaleRow key={s.id} s={s} />)}</div>}
        </section>
      </div>
      {lines.length > 0 && (
        <div className="actionbar"><div>
          <button className="btn primary" disabled={unpriced || !total} onClick={() => sell('upi')}>UPI {money(total)}</button>
          <button className="btn primary" disabled={unpriced || !total} onClick={() => sell('cash')}>Cash</button>
          <button className="btn" disabled={unpriced || !total} onClick={() => sell('pending')}>Pending</button>
        </div></div>
      )}
      {toast}
    </>
  )
}
