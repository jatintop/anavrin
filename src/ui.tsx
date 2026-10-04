import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, useMe, useRepo } from './data/repo'
import type { ItemStatus } from './data/types'
import { STATUS_LABEL } from './data/types'

const P: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  box: 'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10',
  stall: 'M3 9l2-5h14l2 5M3 9h18M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3m0 0c0 1.7 1.3 3 3 3s3-1.3 3-3m0 0c0 1.7 1.3 3 3 3s3-1.3 3-3M5 12v8h14v-8',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
  wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 0l12-4v4M16 14h2',
  tag: 'M3 12V3h9l9 9-9 9-9-9zM7.5 7.5h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  camera: 'M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8zM12 17a4 4 0 100-8 4 4 0 000 8z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  x: 'M18 6L6 18M6 6l12 12',
  chevron: 'M9 18l6-6-6-6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
}

export function Icon({ name, size = 22 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ''} />
    </svg>
  )
}

export function TopBar({ title, back, right }: { title?: string; back?: string | true; right?: ReactNode }) {
  const nav = useNavigate()
  const me = useMe()
  return (
    <>
    <header className="topbar">
      {back ? (
        <button className="iconbtn" aria-label="Back" onClick={() => (back === true ? nav(-1) : nav(back))}>
          <Icon name="back" />
        </button>
      ) : null}
      {title ? <h1>{title}</h1> : (
        <div className="brand"><b>Anavrin</b><i /></div>
      )}
      {right ?? (
        <button className="chip" onClick={() => nav('/settings')} aria-label={`Signed in as ${me.name}. Open settings`}>
          <span className="avatar">{me.initial}</span>
          {me.name}
        </button>
      )}
    </header>
    <SyncLine />
    </>
  )
}

export function DemoBanner() {
  const repo = useRepo()
  if (repo.mode === 'demo') {
    return (
      <div className="demo-banner">
        <b>Demo</b> Data stays on this device. Two of your sample bills are already entered.
      </div>
    )
  }
  return null
}

/** One quiet line that only appears when the sheet isn't fully up to date. */
export function SyncLine() {
  const repo = useRepo()
  const { sync } = useData()
  if (!sync) return null
  const n = sync.pending
  let text: string | null = null
  let tone = 'warn'
  if (!sync.online) text = n ? `Offline · ${n} change${n > 1 ? 's' : ''} saved on this phone, will sync later` : 'Offline · showing the last synced data'
  else if (sync.error) { text = `Not synced: ${sync.error}`; tone = 'error' }
  else if (n) text = `Syncing ${n} change${n > 1 ? 's' : ''}…`
  if (!text) return null
  return (
    <div className={`check ${tone}`} role="status" style={{ marginBottom: 12 }}>
      <Icon name="alert" size={18} />
      <span className="grow">{text}</span>
      {sync.online && sync.error && <button className="btn small" onClick={() => repo.syncNow?.()}>Retry</button>}
    </div>
  )
}

export function StatusPill({ s }: { s: ItemStatus }) {
  return <span className={`pill ${s}`}>{STATUS_LABEL[s]}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

export function useToast(): [ReactNode, (m: string) => void] {
  const [msg, set] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => set(null), 3000)
    return () => clearTimeout(t)
  }, [msg])
  return [msg ? <div className="toast" role="status">{msg}</div> : null, set]
}

export function PhotoImg({ refId, alt }: { refId: string; alt: string }) {
  const repo = useRepo()
  const [url, setUrl] = useState('')
  useEffect(() => { repo.photoUrl(refId).then(setUrl).catch(() => setUrl('')) }, [repo, refId])
  return url ? <img className="photo-full" src={url} alt={alt} /> : <div className="muted small">Photo not available offline</div>
}

export const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
