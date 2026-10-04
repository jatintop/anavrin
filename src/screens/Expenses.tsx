import { useRef, useState } from 'react'
import { useData, useMe, useRepo } from '../data/repo'
import type { Expense } from '../data/types'
import { EXPENSE_CATEGORIES } from '../data/types'
import { expenseId, nextSeq, todayIso, yymm } from '../lib/ids'
import { prepareImage } from '../lib/extract'
import { money } from '../lib/purchase'
import { Field, fmtDate, Icon, PhotoImg, TopBar, useToast } from '../ui'

const monthName = (iso: string) => new Date(iso.slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

export function Expenses() {
  const repo = useRepo()
  const me = useMe()
  const { expenses } = useData()
  const [date, setDate] = useState(todayIso())
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, say] = useToast()
  const camRef = useRef<HTMLInputElement>(null)

  const amt = Number(amount) || 0
  const ok = amt > 0 && !!category.trim() && !!date

  async function save(withPhoto = true) {
    if (!ok) return
    setSaving(true)
    setError(null)
    try {
      const photoRefs = withPhoto && photo ? [await repo.savePhoto(photo.blob)] : []
      const prefix = `E-${yymm(date)}-${me.initial}`
      const now = Date.now()
      const e: Expense = {
        id: expenseId(date, me.initial, nextSeq(expenses.map((x) => x.id), prefix)), date, category: category.trim(), amount: amt,
        note: note.trim(), photoRefs, createdBy: me.id, createdAt: now, updatedBy: me.id, updatedAt: now,
      }
      await repo.saveExpense(e, me)
      say(`${e.id} · ${e.category} · ${money(amt)}`)
      setAmount(''); setNote(''); setPhoto(null)
    } catch (e) {
      setError(`The receipt photo couldn’t be uploaded (${(e as Error).message}). Save without the photo, or try again with internet.`)
    } finally {
      setSaving(false)
    }
  }

  const live = expenses.filter((e) => !e.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const months = [...new Set(live.map((e) => e.date.slice(0, 7)))]
  const thisMonth = todayIso().slice(0, 7)

  return (
    <>
      <TopBar title="Expenses" back="/" />
      <div className="stack-lg">
        <section className="panel stack">
          <Field label="Amount ₹">
            <input id="exp-amount" className="input num total" inputMode="decimal" value={amount} placeholder="0"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <div className="field"><span>What for?</span>
            <div className="segmented wrap" role="group" aria-label="Type of expense">
              {EXPENSE_CATEGORIES.map((c) => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
            </div>
          </div>
          <div className="grid2">
            <Field label="Date"><input id="exp-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Note (optional)"><input id="exp-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. auto to Jayanagar" /></Field>
          </div>
          <input ref={camRef} id="exp-photo" type="file" accept="image/*" capture="environment" hidden
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const blob = await prepareImage(f, 1600); setPhoto({ blob, url: URL.createObjectURL(blob) }) } }} />
          {photo ? (
            <div className="thumbs"><figure><img src={photo.url} alt="Receipt" />
              <button aria-label="Remove receipt photo" onClick={() => setPhoto(null)}><Icon name="x" size={16} /></button></figure></div>
          ) : <button className="btn small" onClick={() => camRef.current?.click()}><Icon name="camera" size={18} />Receipt photo (optional)</button>}
          {error && (
            <div className="check error stack"><span>{error}</span>
              <button className="btn small" onClick={() => save(false)}>Save without the photo</button></div>
          )}
          <button className="btn primary block" disabled={!ok || saving} onClick={() => save()}>{saving ? 'Saving…' : `Save ${amt ? money(amt) : 'expense'}`}</button>
        </section>

        {months.length === 0 && <div className="empty">No expenses yet.</div>}
        {months.map((m) => {
          const list = live.filter((e) => e.date.startsWith(m))
          const byCat = EXPENSE_CATEGORIES.concat([...new Set(list.map((e) => e.category))].filter((c) => !EXPENSE_CATEGORIES.includes(c)))
            .map((c) => [c, list.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0)] as const).filter(([, v]) => v > 0)
          return (
            <details key={m} className="panel" open={m === thisMonth || m === months[0]}>
              <summary><span className="spread" style={{ display: 'inline-flex', width: 'calc(100% - 24px)' }}><span>{monthName(m)}</span><b className="num">{money(list.reduce((a, e) => a + e.amount, 0))}</b></span></summary>
              <div className="small muted num" style={{ margin: '4px 0 8px' }}>{byCat.map(([c, v]) => `${c} ${money(v)}`).join(' · ')}</div>
              <div className="card-list">{list.map((e) => <ExpenseRow key={e.id} e={e} />)}</div>
            </details>
          )
        })}
      </div>
      {toast}
    </>
  )
}

function ExpenseRow({ e }: { e: Expense }) {
  const repo = useRepo()
  const me = useMe()
  const { users } = useData()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const who = users.find((u) => u.id === e.createdBy)?.name
  return (
    <div>
      <button className="rowlink pick" aria-expanded={open} onClick={() => { setOpen(!open); setConfirm(false) }}>
        <div className="grow">
          <div className="ellipsis">{e.category}{e.note ? <span className="muted"> · {e.note}</span> : null}</div>
          <div className="small muted">{fmtDate(e.date)} · <span className="id">{e.id}</span>{e.photoRefs.length ? ' · receipt' : ''}</div>
        </div>
        <span className="num">{money(e.amount)}</span>
      </button>
      {open && (
        <div className="stack" style={{ paddingBottom: 14 }}>
          {who && <div className="small muted">Added by {who}</div>}
          {e.photoRefs.map((r) => <PhotoImg key={r} refId={r} alt="Receipt" />)}
          {!confirm ? <button className="btn small danger" onClick={() => setConfirm(true)}>Delete</button> : (
            <div className="row"><span className="grow small">Delete this expense?</span>
              <button className="btn small" onClick={() => setConfirm(false)}>Keep</button>
              <button className="btn small danger" onClick={() => repo.setExpenseDeleted(e.id, true, me)}>Delete</button></div>
          )}
        </div>
      )}
    </div>
  )
}
