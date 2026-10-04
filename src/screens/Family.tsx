import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData, useMe, useRepo } from '../data/repo'
import type { PayMethod, Sale } from '../data/types'
import { PAY_LABEL } from '../data/types'
import { todayIso, yymm } from '../lib/ids'
import { money } from '../lib/purchase'
import { Field, Icon, TopBar, useToast } from '../ui'
import { applyDiscount, type Discount } from '../lib/sale'
import { buildSale, Cart, DiscountPicker, SaleRow, SareePicker, sumTotal, type CartLine } from './sell'

/** Names of people who bought before, most recent first, for the name box. */
const knownCustomers = (sales: Sale[]) =>
  [...new Set([...sales].sort((a, b) => b.createdAt - a.createdAt).map((s) => s.customer.trim()).filter(Boolean))]

export function Family() {
  const repo = useRepo()
  const me = useMe()
  const { sales } = useData()
  const [customer, setCustomer] = useState('')
  const [date, setDate] = useState(todayIso())
  const [lines, setLines] = useState<CartLine[]>([])
  const [disc, setDisc] = useState<Discount>({ kind: 'none' })
  const [note, setNote] = useState('')
  const [toast, say] = useToast()

  const base = lines.reduce((a, l) => a + l.price, 0)
  const total = applyDiscount(base, disc)
  const inCart = useMemo(() => new Set(lines.map((l) => l.item.id)), [lines])
  const names = useMemo(() => knownCustomers(sales), [sales])
  const ok = !!customer.trim() && lines.length > 0 && lines.every((l) => l.price > 0) && total > 0

  const family = sales.filter((s) => s.kind === 'family')
  const month = family.filter((s) => yymm(s.date) === yymm(todayIso())).sort((a, b) => b.createdAt - a.createdAt)
  const dues = sales.filter((s) => !s.deleted && s.payment === 'pending')

  async function save(payment: PayMethod) {
    if (!ok) return
    const sale = buildSale({ sales, kind: 'family', date, lines, total, payment, customer, note, by: me })
    await repo.saveSale(sale, me)
    say(`${sale.id} · ${customer.trim()} · ${money(total)} · ${PAY_LABEL[payment]}`)
    setLines([]); setDisc({ kind: 'none' }); setNote(''); setCustomer('')
  }

  return (
    <>
      <TopBar title="Friends & family" back="/" />
      <div className="stack-lg">
        <Link className="listlink panel" to="/dues" style={{ padding: '12px 16px' }}>
          <Icon name="people" />
          <div className="grow"><div>Dues</div><div className="small muted num">{dues.length ? `${money(sumTotal(dues))} pending from ${new Set(dues.map((s) => s.customer)).size} people` : 'Nothing pending'}</div></div>
          <Icon name="chevron" size={18} />
        </Link>

        <section className="stack">
          <div className="grid2">
            <Field label="Who is it for?">
              <input id="fam-customer" className="input" list="fam-names" value={customer} placeholder="Name" onChange={(e) => setCustomer(e.target.value)} />
            </Field>
            <Field label="Date"><input id="fam-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || todayIso())} /></Field>
          </div>
          <datalist id="fam-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <SareePicker inCart={inCart} onAdd={(i) => setLines([...lines, { item: i, price: i.price ?? 0 }])} />
          <Cart lines={lines} editable onChange={setLines} />
          {lines.length > 0 && (
            <>
              <DiscountPicker base={base} d={disc} onChange={setDisc} />
              <Field label="Note (optional)"><input id="fam-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. pays at Diwali" /></Field>
              {!customer.trim() && <p className="small muted">Add the person’s name to save.</p>}
            </>
          )}
        </section>

        <section className="panel stack">
          <div className="spread"><h2>This month</h2><span className="num"><b>{money(sumTotal(month.filter((s) => !s.deleted)))}</b></span></div>
          {month.length === 0 ? <div className="empty small">No family sales this month yet.</div>
            : <div className="card-list">{month.map((s) => <SaleRow key={s.id} s={s} showDate />)}</div>}
        </section>
      </div>
      {lines.length > 0 && (
        <div className="actionbar"><div>
          <button className="btn primary" disabled={!ok} onClick={() => save('upi')}>Paid UPI</button>
          <button className="btn primary" disabled={!ok} onClick={() => save('cash')}>Paid cash</button>
          <button className="btn" disabled={!ok} onClick={() => save('pending')}>Pending {money(total)}</button>
        </div></div>
      )}
      {toast}
    </>
  )
}

/** Everything not paid yet, from stalls and family, grouped by person. */
export function Dues() {
  const { sales } = useData()
  const pending = sales.filter((s) => !s.deleted && s.payment === 'pending')
  const byName = new Map<string, Sale[]>()
  pending.forEach((s) => { const k = s.customer.trim() || '(no name)'; byName.set(k, [...(byName.get(k) ?? []), s]) })
  const groups = [...byName.entries()]
    .map(([name, list]) => ({ name, list: list.sort((a, b) => a.date.localeCompare(b.date)), total: sumTotal(list) }))
    .sort((a, b) => b.total - a.total)
  const recent = sales.filter((s) => s.settledOn).sort((a, b) => b.settledOn.localeCompare(a.settledOn) || b.updatedAt - a.updatedAt).slice(0, 10)

  return (
    <>
      <TopBar title="Dues" back={true} />
      <div className="stack-lg">
        <div className="panel spread"><span>Total pending</span><b className="num" style={{ fontSize: '1.3rem' }}>{money(sumTotal(pending))}</b></div>
        {groups.length === 0 && <div className="empty">Nothing pending. Sales marked “Pending” at the stall or for family show up here.</div>}
        {groups.map((g) => (
          <section key={g.name} className="panel stack">
            <div className="spread"><h2>{g.name}</h2><b className="num">{money(g.total)}</b></div>
            <div className="card-list">{g.list.map((s) => <SaleRow key={s.id} s={s} showDate />)}</div>
          </section>
        ))}
        {recent.length > 0 && (
          <section className="panel stack">
            <div className="eyebrow">Recently paid</div>
            <div className="card-list">{recent.map((s) => <SaleRow key={s.id} s={s} showDate />)}</div>
          </section>
        )}
      </div>
    </>
  )
}
