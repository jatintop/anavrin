import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData, useMe, useRepo } from '../data/repo'
import type { Item } from '../data/types'
import { money, suggestPrice } from '../lib/purchase'
import { fmtDate, Icon, TopBar, useToast } from '../ui'


interface Group { key: string; design: string; vendor: string; date: string; cost: number; ids: string[] }

export function Pricing() {
  const [params] = useSearchParams()
  const only = params.get('p')
  const { items, settings } = useData()
  const repo = useRepo()
  const me = useMe()
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Item[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, say] = useToast()

  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Group>()
    items.filter((i) => i.status === 'unpriced' && !i.deleted && (!only || i.purchaseId === only)).forEach((i) => {
      const key = `${i.purchaseId}|${i.design}|${i.cost}`
      const g = m.get(key) ?? { key, design: i.design, vendor: i.vendorName, date: i.purchaseDate, cost: i.cost, ids: [] }
      g.ids.push(i.id)
      m.set(key, g)
    })
    return [...m.values()].sort((a, b) => a.ids[0].localeCompare(b.ids[0]))
  }, [items, only])

  const priceOf = (g: Group) => prices[g.key] ?? String(suggestPrice(g.cost, settings))
  const ready = groups.filter((g) => Number(priceOf(g)) > 0)

  async function saveAll() {
    setSaving(true)
    const savedIds: string[] = []
    for (const g of ready) {
      await repo.updateItems(g.ids, { price: Number(priceOf(g)), status: 'in_stock' }, me)
      savedIds.push(...g.ids)
    }
    const map = new Map(ready.flatMap((g) => g.ids.map((id) => [id, Number(priceOf(g))] as const)))
    setDone(items.filter((i) => map.has(i.id)).map((i) => ({ ...i, price: map.get(i.id)!, status: 'in_stock' })))
    setSaving(false)
    say(`${savedIds.length} sarees priced`)
  }

  if (done.length) {
    return (
      <>
        <TopBar title="Labels" back="/" />
        <div className="stack-lg">
          <p>Write these on the tags{__DEMO__ ? '' : ' (or print them)'}. Each saree gets its own ID.</p>
          <div className="labels">
            {done.map((i) => (
              <div key={i.id} className="label-card">
                <div className="id"><b>{i.id}</b></div>
                <div className="small">{i.design}</div>
                <div className="price num">{money(i.price)}</div>
              </div>
            ))}
          </div>
          <div className="stack no-print">
            {!__DEMO__ && <button className="btn block" onClick={() => window.print()}>Print labels</button>}
            <Link className="btn primary block" to="/">Done</Link>
          </div>
        </div>
        {toast}
      </>
    )
  }

  return (
    <>
      <TopBar title="Price & label" back="/" />
      <div className="stack-lg">
        {groups.length === 0 ? (
          <div className="empty stack" style={{ alignItems: 'center' }}>
            <Icon name="tag" size={36} />
            <p>Every saree has a price. New bills will show up here.</p>
            <Link className="btn" to="/stock">See all sarees</Link>
          </div>
        ) : (
          <>
            <p className="muted small">
              One price per design. Suggested price = cost + {settings.markupPct}%, rounded up to ₹{settings.roundTo} (change in Settings).
              {only && <> Showing bill <span className="id">{only}</span> only. <Link to="/pricing">Show all</Link></>}
            </p>
            <div className="stack">
              {groups.map((g) => {
                const p = Number(priceOf(g))
                const margin = p > 0 ? Math.round(((p - g.cost) / p) * 100) : null
                return (
                  <div key={g.key} className="line">
                    <div className="spread">
                      <div style={{ minWidth: 0 }}>
                        <b>{g.design}</b>
                        <div className="small muted">{g.vendor} · {fmtDate(g.date)}</div>
                      </div>
                      <span className="badge num">×{g.ids.length}</span>
                    </div>
                    <div className="small id muted ids">{g.ids.map((id) => <span key={id}>{id}</span>)}</div>
                    <div className="row">
                      <div className="grow small muted num">Cost {money(g.cost)} each{margin != null && <> · margin {margin}%</>}</div>
                      <label className="row" style={{ gap: 6 }}>
                        <span className="mini">Sell at ₹</span>
                        <input id={`price-${g.ids[0]}`} className="input num" style={{ width: 120, textAlign: 'right' }} inputMode="numeric"
                          value={priceOf(g)} onChange={(e) => setPrices({ ...prices, [g.key]: e.target.value.replace(/[^\d]/g, '') })} />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      {groups.length > 0 && (
        <div className="actionbar"><div>
          <button className="btn primary" disabled={!ready.length || saving} onClick={saveAll}>
            {saving ? 'Saving…' : `Save prices for ${ready.reduce((a, g) => a + g.ids.length, 0)} sarees`}
          </button>
        </div></div>
      )}
      {toast}
    </>
  )
}
