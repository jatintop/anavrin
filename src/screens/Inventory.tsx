import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData, useMe, useRepo } from '../data/repo'
import { money } from '../lib/purchase'
import { fmtDate, Icon, PhotoImg, StatusPill, TopBar, useToast } from '../ui'

export function Inventory() {
  const { purchases, users } = useData()
  const list = purchases.filter((p) => !p.deleted).sort((a, b) => b.createdAt - a.createdAt)
  const who = (id: string) => users.find((u) => u.id === id)?.name ?? ''
  return (
    <>
      <TopBar title="Inventory" back="/" />
      <div className="stack-lg">
        <Link className="btn primary block" to="/inventory/new"><Icon name="camera" />New purchase bill</Link>
        <section className="panel">
          <div className="eyebrow">Saved bills</div>
          {list.length === 0 ? <div className="empty">No bills yet. Tap “New purchase bill” and photograph the first one.</div> : (
            <div className="card-list">
              {list.map((p) => (
                <Link key={p.id} className="rowlink" to={`/inventory/${p.id}`}>
                  <div className="grow">
                    <div className="title">{p.vendorName}</div>
                    <div className="small muted"><span className="id">{p.id}</span> · bill {p.billNo || '—'} · {fmtDate(p.billDate)}{who(p.createdBy) ? ` · by ${who(p.createdBy)}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }} className="num">
                    <div>{money(p.grandTotal)}</div>
                    <div className="small muted">{p.totalQty} pcs</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

export function PurchaseDetail() {
  const { id } = useParams()
  const { purchases, items, users } = useData()
  const repo = useRepo()
  const me = useMe()
  const nav = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const [toast, say] = useToast()
  const p = purchases.find((x) => x.id === id)
  if (!p) return <><TopBar title="Bill" back="/inventory" /><div className="empty">Bill not found.</div></>
  const its = items.filter((i) => i.purchaseId === p.id)
  const sold = its.filter((i) => i.status === 'sold' || i.status === 'family').length
  const who = users.find((u) => u.id === p.createdBy)?.name

  return (
    <>
      <TopBar title={p.id} back="/inventory" />
      <div className="stack-lg">
        <section className="panel stack">
          <div className="spread"><h2>{p.vendorName}</h2>{p.deleted && <span className="pill returned">Deleted</span>}</div>
          <div className="small muted">
            {p.docType === 'quotation' ? 'Quotation' : p.docType === 'tax_invoice' ? 'Tax invoice' : 'Bill'} {p.billNo || '—'} · {fmtDate(p.billDate)}
            {who ? ` · entered by ${who}` : ''}{p.readByAi ? ' · read automatically' : ' · typed in'}
          </div>
          <table className="simple num">
            <tbody>
              <tr><td>Subtotal</td><td className="r">{money(p.subtotal)}</td></tr>
              <tr><td>GST</td><td className="r">{money(p.tax)}</td></tr>
              <tr><td><b>Grand total</b></td><td className="r"><b>{money(p.grandTotal)}</b></td></tr>
              {p.adjustment && <tr><td>Deduction ({p.adjustment.reason})</td><td className="r">−{money(p.adjustment.amount)}</td></tr>}
            </tbody>
          </table>
          {p.checksOverridden && <div className="check warn">Saved even though the numbers didn’t add up.</div>}
        </section>

        <section className="stack">
          <h2>{p.totalQty} sarees</h2>
          <div className="panel card-list">
            {p.lines.map((l, i) => (
              <div key={i} className="stack" style={{ padding: '10px 0', gap: 6 }}>
                <div className="spread"><b>{l.description}</b><span className="small muted num">{l.qty} × {money(l.rate)} · cost {money(l.unitCost)} each</span></div>
                <div className="row">
                  {l.itemIds.map((iid) => {
                    const it = its.find((x) => x.id === iid)
                    return <span key={iid} className="row" style={{ gap: 4 }}><span className="id">{iid}</span>{it && <StatusPill s={it.status} />}</span>
                  })}
                </div>
              </div>
            ))}
          </div>
          {its.some((i) => i.status === 'unpriced' && !i.deleted) && <Link className="btn primary block" to={`/pricing?p=${p.id}`}><Icon name="tag" />Set prices for this bill</Link>}
        </section>

        {p.photoRefs.length > 0 && (
          <details className="panel"><summary>Bill photo</summary><div className="stack" style={{ marginTop: 8 }}>{p.photoRefs.map((r) => <PhotoImg key={r} refId={r} alt="Bill photo" />)}</div></details>
        )}

        <section className="stack">
          {p.deleted ? (
            <button className="btn block" onClick={async () => { await repo.setPurchaseDeleted(p.id, false, me); say('Bill restored') }}>Restore this bill</button>
          ) : sold > 0 ? (
            <p className="small muted">This bill can’t be deleted because {sold} of its sarees are already sold.</p>
          ) : !confirm ? (
            <button className="btn danger block" onClick={() => setConfirm(true)}>Delete this bill</button>
          ) : (
            <div className="check error stack">
              <span>Delete {p.id} and its {its.length} sarees? You can restore it from Settings → Recently deleted.</span>
              <div className="row">
                <button className="btn grow" onClick={() => setConfirm(false)}>Keep it</button>
                <button className="btn danger grow" onClick={async () => { await repo.setPurchaseDeleted(p.id, true, me); nav('/inventory') }}>Delete</button>
              </div>
            </div>
          )}
        </section>
      </div>
      {toast}
    </>
  )
}
