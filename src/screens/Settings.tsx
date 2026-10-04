import { useState } from 'react'
import { inviteLink } from '../data/connection'
import { setDemoChosen } from './Connect'
import { Link } from 'react-router-dom'
import { useData, useMe, useRepo } from '../data/repo'
import type { Settings as S, Vendor } from '../data/types'
import { isTypeCode } from '../lib/ids'
import { fmtDate, TopBar, useToast } from '../ui'

export function Settings() {
  const repo = useRepo()
  const me = useMe()
  const data = useData()
  const [toast, say] = useToast()
  const [vName, setVName] = useState('')
  const [vType, setVType] = useState('OTH')
  const [tCode, setTCode] = useState('')
  const [tName, setTName] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const used = new Set(data.items.map((i) => i.type))
  const deleted = data.purchases.filter((p) => p.deleted)

  const setSetting = (patch: Partial<S>) => repo.saveSettings({ ...data.settings, ...patch })

  return (
    <>
      <TopBar title="Settings" back="/" right={<span />} />
      <div className="stack-lg">
        <section className="panel stack">
          <div className="spread">
            <div className="row"><span className="avatar">{me.initial}</span><b>{me.name}</b></div>
            <button className="btn small" onClick={() => repo.signOut()}>{repo.mode === 'demo' ? 'Switch person' : 'Sign out'}</button>
          </div>
          <div className="eyebrow">People using the app</div>
          <div className="row">{data.users.map((u) => <span key={u.id} className="chip"><span className="avatar">{u.initial}</span>{u.name}</span>)}</div>
          <p className="small muted">{repo.mode === 'demo'
            ? 'Add people from “Switch person”.'
            : 'To add someone, send them the invite link below. They pick their name the first time they open it.'}</p>
        </section>

        {repo.mode === 'sheet' && repo.connection && <SheetSection />}
        {repo.mode === 'demo' && !__DEMO__ && (
          <section className="panel stack">
            <h2>Google Sheet</h2>
            <p className="small muted">This is the demo. Connect to the family’s Google Sheet to start using the app for real.</p>
            <button className="btn primary" onClick={() => { setDemoChosen(false); location.reload() }}>Connect to Google Sheet</button>
          </section>
        )}

        <section className="panel stack">
          <h2>Vendors</h2>
          <p className="small muted">The type picked here is pre-filled for that vendor’s bills.</p>
          {data.vendors.map((v) => <VendorRow key={v.id} v={v} />)}
          <form className="row" onSubmit={async (e) => {
            e.preventDefault()
            if (!vName.trim()) return
            const id = vName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            await repo.saveVendor({ id: id || `v-${Date.now()}`, name: vName.trim(), defaultType: vType })
            setVName(''); say('Vendor added')
          }}>
            <input id="set-vname" className="input grow" placeholder="New vendor name" value={vName} onChange={(e) => setVName(e.target.value)} />
            <select id="set-vtype" className="input" style={{ width: 'auto' }} value={vType} onChange={(e) => setVType(e.target.value)} aria-label="Usual type">
              {data.types.map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
            </select>
            <button className="btn" disabled={!vName.trim()}>Add</button>
          </form>
        </section>

        <section className="panel stack">
          <h2>Saree types</h2>
          <p className="small muted">The 3-letter code starts every saree ID, e.g. <span className="id">KAN-2610-012</span>.</p>
          <div className="tablewrap"><table className="simple"><tbody>
            {data.types.map((t) => (
              <tr key={t.code}><td className="id"><b>{t.code}</b></td><td>{t.name}</td>
                <td className="r">{used.has(t.code) ? <span className="small muted">in use</span> : <button className="btn small danger" onClick={() => repo.deleteType(t.code)}>Remove</button>}</td></tr>
            ))}
          </tbody></table></div>
          <form className="row" onSubmit={async (e) => {
            e.preventDefault()
            if (!isTypeCode(tCode) || !tName.trim() || data.types.some((t) => t.code === tCode)) return
            await repo.saveType({ code: tCode, name: tName.trim() }); setTCode(''); setTName(''); say('Type added')
          }}>
            <input id="set-tcode" className="input id" style={{ width: 90 }} placeholder="ABC" maxLength={3} value={tCode} onChange={(e) => setTCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
            <input id="set-tname" className="input grow" placeholder="Name, e.g. Paithani" value={tName} onChange={(e) => setTName(e.target.value)} />
            <button className="btn" disabled={!isTypeCode(tCode) || !tName.trim() || data.types.some((t) => t.code === tCode)}>Add</button>
          </form>
        </section>

        <section className="panel stack">
          <h2>Pricing &amp; GST</h2>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input id="set-gst" type="checkbox" checked={data.settings.gstRegistered} onChange={(e) => setSetting({ gstRegistered: e.target.checked })} />
            <span className="grow">Business is GST-registered<br /><span className="small muted">Off: the 5% GST on vendor bills is counted in each saree’s cost (vendors bill you as “URP”, unregistered).</span></span>
          </label>
          <div className="grid2">
            <label className="field"><span>Suggested markup %</span>
              <input id="set-markup" className="input num" inputMode="numeric" value={data.settings.markupPct} onChange={(e) => setSetting({ markupPct: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></label>
            <label className="field"><span>Round prices up to ₹</span>
              <select id="set-round" className="input" value={data.settings.roundTo} onChange={(e) => setSetting({ roundTo: Number(e.target.value) })}>
                {[1, 10, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select></label>
          </div>
        </section>

        {deleted.length > 0 && (
          <section className="panel stack">
            <h2>Recently deleted bills</h2>
            {deleted.map((p) => <Link key={p.id} to={`/inventory/${p.id}`} className="rowlink"><span className="id">{p.id}</span><span className="grow">{p.vendorName} · {fmtDate(p.billDate)}</span><span className="btn small">Open</span></Link>)}
          </section>
        )}

        {repo.mode === 'demo' && repo.resetDemo && (
          <section className="panel stack">
            <h2>Demo data</h2>
            {!confirmReset
              ? <button className="btn danger" onClick={() => setConfirmReset(true)}>Reset to the sample data</button>
              : <div className="row"><span className="grow small">Erase everything entered in this demo?</span><button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button><button className="btn danger" onClick={async () => { await repo.resetDemo!(); setConfirmReset(false); say('Demo reset') }}>Erase</button></div>}
          </section>
        )}
      </div>
      {toast}
    </>
  )
}

function VendorRow({ v }: { v: Vendor }) {
  const repo = useRepo()
  const { types, purchases } = useData()
  const used = purchases.some((p) => p.vendorId === v.id)
  return (
    <div className="row">
      <span className="grow">{v.name}</span>
      <select id={`vt-${v.id}`} className="input" style={{ width: 'auto' }} value={v.defaultType} aria-label={`Usual type for ${v.name}`}
        onChange={(e) => repo.saveVendor({ ...v, defaultType: e.target.value })}>
        {types.map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
      </select>
      {!used && <button className="btn small danger" onClick={() => repo.deleteVendor(v.id)}>Remove</button>}
    </div>
  )
}

function SheetSection() {
  const repo = useRepo()
  const { sync, sheetUrl } = useData()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const link = inviteLink(repo.connection!)
  const last = sync?.lastSync ? new Date(sync.lastSync).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'
  return (
    <section className="panel stack">
      <h2>Google Sheet</h2>
      <div className="small muted num">
        Last synced {last}{sync?.pending ? ` · ${sync.pending} change(s) waiting` : ''}{sync && !sync.online ? ' · offline' : ''}
      </div>
      <div className="row">
        {sheetUrl && <a className="btn grow" href={sheetUrl} target="_blank" rel="noreferrer">Open the sheet</a>}
        <button className="btn grow" disabled={sync?.syncing} onClick={() => repo.syncNow?.()}>{sync?.syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>
      <div className="eyebrow">Invite family</div>
      <p className="small muted">Send this link (WhatsApp is fine) to someone in the family. Opening it on their phone connects the app. Anyone with the link can see and change the data, so keep it in the family.</p>
      <input id="invite-link" className="input id small" readOnly value={link} onFocus={(e) => e.target.select()} />
      <button className="btn" onClick={async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true) } catch { (document.getElementById('invite-link') as HTMLInputElement)?.select() }
      }}>{copied ? 'Copied' : 'Copy invite link'}</button>
      {!confirm
        ? <button className="btn small danger" onClick={() => setConfirm(true)}>Disconnect this phone</button>
        : <div className="row"><span className="grow small">Disconnect? {sync?.pending ? `${sync.pending} unsynced change(s) on this phone will be lost.` : 'Nothing is lost; the data stays in the sheet.'}</span>
            <button className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn small danger" onClick={async () => { await repo.disconnect?.(); location.reload() }}>Disconnect</button></div>}
    </section>
  )
}
