import { useMemo, useState } from 'react'
import { useData, useMe, useRepo } from '../data/repo'
import type { Item, ItemStatus } from '../data/types'
import { STATUS_LABEL } from '../data/types'
import { parseItemQuery } from '../lib/ids'
import { money } from '../lib/purchase'
import { fmtDate, StatusPill, TopBar, useToast } from '../ui'

const FILTERS: { v: 'all' | ItemStatus; label: string }[] = [
  { v: 'in_stock', label: 'In stock' },
  { v: 'unpriced', label: 'Needs price' },
  { v: 'sold', label: 'Sold' },
  { v: 'all', label: 'All' },
]

export function Stock() {
  const { items, types } = useData()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | ItemStatus>('in_stock')
  const [type, setType] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const list = useMemo(() => {
    const pq = parseItemQuery(q)
    const text = q.trim().toLowerCase()
    return items
      .filter((i) => !i.deleted)
      .filter((i) => filter === 'all' || i.status === filter || (filter === 'sold' && i.status === 'family'))
      .filter((i) => !type || i.type === type)
      .filter((i) => {
        if (!text) return true
        if (pq.exact) return i.id === pq.exact
        if (pq.type && pq.seq != null) return i.type === pq.type && Number(i.id.slice(-3)) === pq.seq
        return i.id.toLowerCase().includes(text) || i.design.toLowerCase().includes(text) || i.vendorName.toLowerCase().includes(text)
      })
      .sort((a, b) => b.id.localeCompare(a.id))
  }, [items, q, filter, type])

  const value = list.reduce((a, i) => a + (i.price ?? 0), 0)

  return (
    <>
      <TopBar title="Sarees" back="/" />
      <div className="stack">
        <input id="stock-search" className="input" type="search" placeholder="Search ID (KAN12), design or vendor" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => <button key={f.v} aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.label}</button>)}
        </div>
        <select id="stock-type" className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {types.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}
        </select>
        <div className="small muted num">{list.length} sarees{value ? ` · ${money(value)} at tag price` : ''}</div>
        <div className="panel card-list" style={{ padding: '0 16px' }}>
          {list.length === 0 && <div className="empty">Nothing matches.</div>}
          {list.slice(0, 300).map((i) => (
            <div key={i.id}>
              <button className="rowlink" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }}
                aria-expanded={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)}>
                <div className="grow">
                  <div className="id"><b>{i.id}</b></div>
                  <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.design} · {i.vendorName}</div>
                </div>
                <div style={{ textAlign: 'right' }} className="num">
                  <div>{money(i.price)}</div>
                  <StatusPill s={i.status} />
                </div>
              </button>
              {open === i.id && <ItemEditor item={i} onDone={() => setOpen(null)} />}
            </div>
          ))}
        </div>
        {list.length > 300 && <p className="small muted">Showing the first 300. Search to narrow down.</p>}
      </div>
    </>
  )
}

function ItemEditor({ item, onDone }: { item: Item; onDone: () => void }) {
  const repo = useRepo()
  const me = useMe()
  const { users } = useData()
  const [price, setPrice] = useState(String(item.price ?? ''))
  const [status, setStatus] = useState<ItemStatus>(item.status)
  const [toast, say] = useToast()
  const who = users.find((u) => u.id === item.updatedBy)?.name
  return (
    <div className="stack" style={{ padding: '4px 0 16px' }}>
      <div className="small muted num">Bought {fmtDate(item.purchaseDate)} · bill {item.purchaseId} · cost {money(item.cost)}{who ? ` · last change by ${who}` : ''}</div>
      <div className="grid2">
        <label className="field"><span>Price ₹</span>
          <input id={`ed-price-${item.id}`} className="input num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="field"><span>Status</span>
          <select id={`ed-status-${item.id}`} className="input" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
            {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></label>
      </div>
      <div className="row">
        <button className="btn grow" onClick={onDone}>Close</button>
        <button className="btn primary grow" onClick={async () => {
          const p = price ? Number(price) : null
          await repo.updateItems([item.id], { price: p, status: status === 'unpriced' && p ? 'in_stock' : status }, me)
          say('Saved'); onDone()
        }}>Save</button>
      </div>
      {toast}
    </div>
  )
}
