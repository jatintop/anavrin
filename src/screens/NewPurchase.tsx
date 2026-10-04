import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import golden from '../../golden/expected.json'
import { useData, useMe, useRepo, type Repo } from '../data/repo'
import type { DraftLine, Purchase, Vendor } from '../data/types'
import {
  checkBill, hasErrors, normalizeBill, r2, suggestedAdjustment, sum, taxTotal, unitCost,
  type AdjustmentReason, type DocType, type ExtractedBill, type HandNote,
} from '../lib/bill'
import { claudeExtractor, prepareImage, sheetExtractor, type Extractor } from '../lib/extract'
import { similar } from '../lib/extract/compare'
import { todayIso } from '../lib/ids'
import { draftLinesFromBill, guessType, isDuplicate, money } from '../lib/purchase'
import { Field, Icon, TopBar } from '../ui'


type Step = 'start' | 'reading' | 'review' | 'saved'

interface Review {
  billNo: string
  billDate: string
  docType: DocType
  lines: DraftLine[]
  totalQty: number | null
  subtotal: number
  tax: number
  grandTotal: number
  roundOff: number
  notes: HandNote[]
  paidStamp: boolean
  aiVendor: string | null
  aiWarnings: string[]
  readByAi: boolean
  manual: boolean
}

const REASONS: { v: AdjustmentReason; label: string }[] = [
  { v: 'advance', label: 'Advance already paid (cost unchanged)' },
  { v: 'discount', label: 'Discount from vendor (lowers cost)' },
  { v: 'return', label: 'Goods returned / exchanged' },
  { v: 'other', label: 'Other' },
]

function useExtractor(repo: Repo) {
  const [ex, setEx] = useState<Extractor | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const p = repo.mode === 'sheet' ? Promise.resolve(sheetExtractor(repo)) : claudeExtractor()
    p.then((e) => live && setEx(e)).catch(() => live && setEx(null))
    return () => { live = false }
  }, [repo])
  return ex
}

export function NewPurchase() {
  const repo = useRepo()
  const me = useMe()
  const data = useData()
  const extractor = useExtractor(repo)

  const [step, setStep] = useState<Step>('start')
  const [vendorId, setVendorId] = useState(data.vendors[0]?.id ?? '')
  const [newVendor, setNewVendor] = useState<{ name: string; type: string } | null>(null)
  const [date, setDate] = useState(todayIso())
  const [billNo, setBillNo] = useState('')
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [readRefs, setReadRefs] = useState<string[] | null>(null)
  const [adj, setAdj] = useState<{ amount: number; reason: AdjustmentReason } | null>(null)
  const [override, setOverride] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Purchase | null>(null)
  const abort = useRef<AbortController | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  const vendor: Vendor | undefined = data.vendors.find((v) => v.id === vendorId)

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const add = await Promise.all(Array.from(files).slice(0, 4).map(async (f) => {
      const blob = await prepareImage(f)
      return { blob, url: URL.createObjectURL(blob) }
    }))
    setPhotos((p) => [...p, ...add].slice(0, 4))
  }

  function startReview(b: ExtractedBill, readByAi: boolean, manual = false) {
    setReview({
      billNo: b.billNo ?? billNo,
      billDate: b.billDate ?? date,
      docType: b.docType,
      lines: draftLinesFromBill(b, vendor, data.types),
      totalQty: b.totalQty,
      subtotal: b.subtotal ?? sum(b.lines.map((l) => l.amount)),
      tax: taxTotal(b),
      grandTotal: b.grandTotal ?? 0,
      roundOff: b.roundOff ?? 0,
      notes: b.handwrittenNotes,
      paidStamp: b.paidStamp,
      aiVendor: b.vendorName,
      aiWarnings: b.warnings,
      readByAi,
      manual,
    })
    const a = suggestedAdjustment(b)
    setAdj(a ? { amount: a, reason: 'advance' } : null)
    setStep('review')
  }

  async function read() {
    if (!extractor || !photos.length) return
    setError(null)
    setStep('reading')
    abort.current = new AbortController()
    try {
      const bill = await extractor.read(photos.map((p) => p.blob), abort.current.signal)
      setReadRefs(bill.photoRefs ?? null)
      startReview(bill, true)
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'cancelled') { setStep('start'); return }
      setError(code === 'not_granted'
        ? 'Bill reading was not allowed. You can type the items in instead.'
        : `${(e as Error)?.message ?? 'Could not read the bill.'} You can try a straighter, brighter photo, or type it in.`)
      setStep('start')
    }
  }

  function manual() {
    startReview(normalizeBill({ billNo, billDate: date, docType: 'tax_invoice', lines: [{ description: '', qty: 1, rate: 0, amount: 0 }] }), false, true)
  }

  function useSample() {
    const b = normalizeBill((golden as Record<string, unknown>)['royal-threads-OT001058.jpg'])
    const rt = data.vendors.find((v) => similar(v.name, b.vendorName ?? ''))
    if (rt) setVendorId(rt.id)
    startReview(b, true)
  }

  // ---------- review derived values ----------
  const asBill = useMemo(() => review && normalizeBill({
    lines: review.lines, totalQty: review.totalQty, subtotal: review.subtotal,
    cgst: review.tax, grandTotal: review.grandTotal, roundOff: review.roundOff,
  }), [review])
  const checks = useMemo(() => (asBill ? checkBill(asBill) : []), [asBill])
  const dup = review && vendor ? isDuplicate(data.purchases, vendor.id, review.billNo) : undefined
  const vendorMismatch = review?.aiVendor && vendor && !similar(review.aiVendor, vendor.name)
    ? data.vendors.find((v) => similar(v.name, review.aiVendor!)) ?? null
    : undefined
  const blocking = hasErrors(checks) && !override
  const canSave = !!review && !!vendor && review.lines.length > 0 && !blocking && !dup && !saving && !!review.billDate

  function patchLine(i: number, patch: Partial<DraftLine>) {
    setReview((r) => {
      if (!r) return r
      const lines = r.lines.map((l, j) => {
        if (j !== i) return l
        const n = { ...l, ...patch }
        if (r.manual && ('qty' in patch || 'rate' in patch)) n.amount = r2(n.qty * n.rate)
        return n
      })
      if (!r.manual) return { ...r, lines }
      const subtotal = sum(lines.map((l) => l.amount))
      const tax = r2(subtotal * 0.05)
      return { ...r, lines, subtotal, tax, grandTotal: Math.round(subtotal + tax), totalQty: lines.reduce((a, l) => a + l.qty, 0) }
    })
  }

  async function save() {
    if (!review || !vendor || !canSave) return
    setSaving(true)
    try {
      const photoRefs = readRefs ?? await Promise.all(photos.map((p) => repo.savePhoto(p.blob)))
      const adjustment = adj && adj.amount > 0 ? adj : null
      const off = adjustment && adjustment.reason !== 'advance' ? adjustment.amount : 0
      const p = await repo.savePurchase({
        vendorId: vendor.id, vendorName: vendor.name, billNo: review.billNo.trim(), billDate: review.billDate,
        docType: review.docType, lines: review.lines.map((l) => ({ ...l, description: l.description.trim() || 'Saree' })),
        subtotal: review.subtotal, tax: review.tax, roundOff: review.roundOff, grandTotal: review.grandTotal,
        adjustment, amountPaid: r2(review.grandTotal - off), photoRefs, readByAi: review.readByAi,
        checksOverridden: hasErrors(checks),
      }, me)
      setSaved(p)
      setStep('saved')
    } catch (e) {
      setError(`Not saved: ${(e as Error).message} Your entries are still here; try Save again when the connection is back.`)
    } finally {
      setSaving(false)
    }
  }

  async function addVendor() {
    if (!newVendor?.name.trim()) return
    const id = newVendor.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `v-${Date.now()}`
    await repo.saveVendor({ id, name: newVendor.name.trim(), defaultType: newVendor.type })
    setVendorId(id)
    setNewVendor(null)
  }

  // ---------- screens ----------
  if (step === 'saved' && saved) {
    return (
      <>
        <TopBar title="Bill saved" back="/inventory" />
        <div className="stack-lg">
          <div className="panel stack">
            <div className="row"><span style={{ color: 'var(--ok)' }}><Icon name="check" size={28} /></span>
              <div className="grow"><h2 className="id">{saved.id}</h2><div className="muted small">{saved.vendorName} · bill {saved.billNo || '—'}</div></div></div>
            <p><b className="num">{saved.totalQty}</b> sarees added to stock. They need a selling price before they go to a stall.</p>
          </div>
          <div className="panel tablewrap">
            <table className="simple">
              <thead><tr><th>Design</th><th>IDs</th><th className="r">Cost each</th></tr></thead>
              <tbody>
                {saved.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.description}</td>
                    <td className="id">{l.itemIds.length > 1 ? `${l.itemIds[0]} … ${l.itemIds[l.itemIds.length - 1].slice(-3)}` : l.itemIds[0]}</td>
                    <td className="r num">{money(l.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stack">
            <Link className="btn primary block" to={`/pricing?p=${saved.id}`}><Icon name="tag" />Set prices now</Link>
            <button className="btn block" onClick={() => window.location.reload()}>Add another bill</button>
          </div>
        </div>
      </>
    )
  }

  if (step === 'reading') {
    return (
      <>
        <TopBar title="Reading bill" back={true} />
        <div className="empty stack" style={{ alignItems: 'center', paddingTop: 64 }}>
          <div className="spinner" />
          <h2>Reading the bill…</h2>
          <p>Usually 10–30 seconds. You’ll check every line before anything is saved.</p>
          <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
        </div>
      </>
    )
  }

  if (step === 'review' && review) {
    const errorLines = new Set(checks.filter((c) => c.level === 'error' && c.line != null).map((c) => c.line))
    return (
      <>
        <TopBar title="Check the bill" back={true} />
        <div className="stack-lg">
          {photos.length > 0 && (
            <details className="panel" open>
              <summary>Bill photo{photos.length > 1 ? 's' : ''} — compare as you check</summary>
              <div className="stack" style={{ marginTop: 8 }}>{photos.map((p, i) => <img key={i} className="photo-full" src={p.url} alt={`Bill page ${i + 1}`} />)}</div>
            </details>
          )}

          <section className="panel stack">
            <Field label="Vendor">
              <select id="rv-vendor" className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <div className="grid2">
              <Field label="Bill date">
                <input id="rv-date" type="date" className="input" value={review.billDate} onChange={(e) => setReview({ ...review, billDate: e.target.value })} />
              </Field>
              <Field label="Bill / quotation no.">
                <input id="rv-billno" className="input" value={review.billNo} onChange={(e) => setReview({ ...review, billNo: e.target.value })} />
              </Field>
              <Field label="Type of bill">
                <select id="rv-doctype" className="input" value={review.docType} onChange={(e) => setReview({ ...review, docType: e.target.value as DocType })}>
                  <option value="tax_invoice">Tax invoice</option><option value="quotation">Quotation</option>
                  <option value="estimate">Estimate</option><option value="other">Other</option>
                </select>
              </Field>
            </div>
            {vendorMismatch !== undefined && (
              <div className="check warn"><Icon name="alert" size={18} />
                <div className="grow">The bill says <b>{review.aiVendor}</b>.
                  {vendorMismatch ? <> <button className="btn small" onClick={() => setVendorId(vendorMismatch.id)}>Switch to {vendorMismatch.name}</button></> : ' Pick the right vendor above, or add it from the first screen.'}
                </div>
              </div>
            )}
            {dup && <div className="check error"><Icon name="alert" size={18} /><div>This bill is already saved as <Link to={`/inventory/${dup.id}`} className="id">{dup.id}</Link>. Saving it again would double the stock.</div></div>}
          </section>

          <section className="stack">
            <div className="spread"><h2>Items</h2><span className="muted small num">{review.lines.reduce((a, l) => a + l.qty, 0)} pcs</span></div>
            {review.lines.map((l, i) => (
              <div key={i} className={`line${errorLines.has(i) ? ' bad' : ''}`}>
                <div className="line-head">
                  <span className="sl">{i + 1}</span>
                  <input id={`ln-${i}-desc`} className="input" aria-label="Design name" value={l.description} placeholder="Design name"
                    onChange={(e) => patchLine(i, { description: e.target.value })} />
                  <button className="iconbtn" aria-label={`Remove line ${i + 1}`} onClick={() => setReview({ ...review, lines: review.lines.filter((_, j) => j !== i) })}><Icon name="x" size={18} /></button>
                </div>
                <div className="line-nums">
                  <label><span className="mini">Qty</span><input id={`ln-${i}-qty`} className="input num" inputMode="numeric" value={l.qty} onChange={(e) => patchLine(i, { qty: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
                  <label><span className="mini">Rate ₹</span><input id={`ln-${i}-rate`} className="input num" inputMode="decimal" value={l.rate} onChange={(e) => patchLine(i, { rate: Number(e.target.value) || 0 })} /></label>
                  <label><span className="mini">Amount ₹</span><input id={`ln-${i}-amt`} className="input num" inputMode="decimal" value={l.amount} onChange={(e) => patchLine(i, { amount: Number(e.target.value) || 0 })} /></label>
                </div>
                {checks.filter((c) => c.line === i && c.level !== 'ok').map((c) => <div key={c.id} className="line-err">{c.message}</div>)}
                <div className="row">
                  <select id={`ln-${i}-type`} className="input grow" aria-label="Saree type" value={l.type} onChange={(e) => patchLine(i, { type: e.target.value })}>
                    {data.types.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}
                  </select>
                  {asBill && <span className="small muted num">Cost {money(unitCost(asBill.lines[i] ?? l, asBill, { gstRegistered: data.settings.gstRegistered, adjustment: adj }))} each</span>}
                </div>
              </div>
            ))}
            <button className="btn" onClick={() => setReview({ ...review, lines: [...review.lines, { description: '', hsn: null, qty: 1, rate: 0, discountPct: null, amount: 0, type: guessType('', vendor, data.types) }] })}>
              <Icon name="plus" size={18} />Add a line
            </button>
          </section>

          <section className="panel stack">
            <h2>Totals</h2>
            <div className="grid2">
              <Field label="Subtotal ₹"><input id="rv-sub" className="input num" inputMode="decimal" value={review.subtotal} onChange={(e) => setReview({ ...review, subtotal: Number(e.target.value) || 0 })} /></Field>
              <Field label="GST total ₹"><input id="rv-tax" className="input num" inputMode="decimal" value={review.tax} onChange={(e) => setReview({ ...review, tax: Number(e.target.value) || 0 })} /></Field>
              <Field label="Grand total ₹"><input id="rv-grand" className="input num" inputMode="decimal" value={review.grandTotal} onChange={(e) => setReview({ ...review, grandTotal: Number(e.target.value) || 0 })} /></Field>
              <Field label="Pieces on bill"><input id="rv-qty" className="input num" inputMode="numeric" value={review.totalQty ?? ''} onChange={(e) => setReview({ ...review, totalQty: e.target.value ? Number(e.target.value) : null })} /></Field>
            </div>
            <div className="checks" aria-live="polite">
              {checks.map((c) => (
                <div key={c.id} className={`check ${c.level}`}><Icon name={c.level === 'ok' ? 'check' : 'alert'} size={18} /><span>{c.message}</span></div>
              ))}
              {review.aiWarnings.map((w, i) => <div key={`w${i}`} className="check warn"><Icon name="alert" size={18} /><span>{w}</span></div>)}
            </div>
          </section>

          <section className="panel stack">
            <h2>Handwritten adjustment</h2>
            {review.notes.length > 0 && <p className="small muted">Pen notes found: {review.notes.map((n) => n.text).join(' · ')}{review.paidStamp ? ' · PAID stamp' : ''}</p>}
            <div className="grid2">
              <Field label="Amount deducted ₹">
                <input id="rv-adj" className="input num" inputMode="decimal" value={adj?.amount ?? ''} placeholder="0"
                  onChange={(e) => setAdj({ amount: Number(e.target.value) || 0, reason: adj?.reason ?? 'advance' })} />
              </Field>
              <Field label="What is it?">
                <select id="rv-adj-reason" className="input" value={adj?.reason ?? 'advance'} onChange={(e) => setAdj({ amount: adj?.amount ?? 0, reason: e.target.value as AdjustmentReason })}>
                  {REASONS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                </select>
              </Field>
            </div>
            <p className="small muted">Cost per saree includes the 5% GST{data.settings.gstRegistered ? ' — off, because the business is GST-registered (Settings)' : ''}.</p>
          </section>

          {hasErrors(checks) && (
            <label className="check error" style={{ cursor: 'pointer' }}>
              <input id="rv-override" type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span>The numbers above don’t add up. I checked them against the paper bill and want to save anyway.</span>
            </label>
          )}
          {error && <div className="check error">{error}</div>}
        </div>
        <div className="actionbar"><div>
          <button className="btn primary" disabled={!canSave} onClick={save}>
            {saving ? 'Saving…' : `Save ${review.lines.reduce((a, l) => a + l.qty, 0)} sarees`}
          </button>
        </div></div>
      </>
    )
  }

  // ---------- start ----------
  return (
    <>
      <TopBar title="New purchase" back="/inventory" />
      <div className="stack-lg">
        <section className="panel stack">
          <Field label="Vendor">
            <select id="np-vendor" className="input" value={newVendor ? '__new' : vendorId}
              onChange={(e) => e.target.value === '__new' ? setNewVendor({ name: '', type: 'OTH' }) : (setNewVendor(null), setVendorId(e.target.value))}>
              {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="__new">+ Add a new vendor</option>
            </select>
          </Field>
          {newVendor && (
            <div className="stack" style={{ padding: 12, background: 'var(--sunken)', borderRadius: 12 }}>
              <Field label="New vendor name"><input id="np-newv-name" className="input" value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} autoFocus /></Field>
              <Field label="Usual saree type from this vendor">
                <select id="np-newv-type" className="input" value={newVendor.type} onChange={(e) => setNewVendor({ ...newVendor, type: e.target.value })}>
                  {data.types.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}
                </select>
              </Field>
              <div className="row"><button className="btn grow" onClick={() => setNewVendor(null)}>Cancel</button><button className="btn primary grow" disabled={!newVendor.name.trim()} onClick={addVendor}>Add vendor</button></div>
            </div>
          )}
          <div className="grid2">
            <Field label="Bill date"><input id="np-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Bill no. (optional)"><input id="np-billno" className="input" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Read from photo" /></Field>
          </div>
        </section>

        <section className="stack">
          <input ref={camRef} id="np-camera" type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          <input ref={galRef} id="np-gallery" type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          {photos.length === 0 ? (
            <button className="capture" onClick={() => camRef.current?.click()}>
              <Icon name="camera" size={40} />
              <strong>Take a photo of the bill</strong>
              <span className="small muted">Flat, bright, whole bill in frame</span>
            </button>
          ) : (
            <div className="panel stack">
              <div className="thumbs">
                {photos.map((p, i) => (
                  <figure key={i}><img src={p.url} alt={`Bill page ${i + 1}`} />
                    <button aria-label={`Remove page ${i + 1}`} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button></figure>
                ))}
              </div>
              {photos.length < 4 && <button className="btn small" onClick={() => camRef.current?.click()}><Icon name="plus" size={16} />Add another page</button>}
            </div>
          )}
          <button className="btn small" onClick={() => galRef.current?.click()}>Choose from gallery instead</button>
        </section>

        {error && <div className="check error">{error}</div>}
        {extractor === null && (
          <div className="check warn"><Icon name="alert" size={18} />
            <span>Automatic bill reading isn’t available here{repo.mode === 'demo' ? ' (it works in the real app, or when this demo is opened inside Claude)' : ''}. You can still type the items{repo.mode === 'demo' ? ', or try the sample bill' : ''}.</span>
          </div>
        )}
        <div className="stack">
          <button className="btn primary block" disabled={!photos.length || !extractor || (!vendor && !newVendor)} onClick={read}>
            <Icon name="sparkle" size={18} />Read bill{extractor ? ` with ${extractor.name}` : ''}
          </button>
          <div className="row">
            <button className="btn grow" onClick={manual} disabled={!vendor}>Type it in</button>
            {repo.mode === 'demo' && <button className="btn grow" onClick={useSample}>Try a sample bill</button>}
          </div>
        </div>
      </div>
    </>
  )
}
