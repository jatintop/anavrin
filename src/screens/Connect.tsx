import { useState } from 'react'
import { DEFAULT_URL, decodeInvite, saveConnection, validUrl, type Connection } from '../data/connection'
import { createApi } from '../data/sheetsRepo'
import { Field } from '../ui'

const DEMO_KEY = 'anavrin-use-demo'
export const demoChosen = () => { try { return localStorage.getItem(DEMO_KEY) === '1' } catch { return false } }
export const setDemoChosen = (on: boolean) => { try { if (on) localStorage.setItem(DEMO_KEY, '1'); else localStorage.removeItem(DEMO_KEY) } catch { /* blocked */ } }

/** First screen on a new phone: connect to the family's Google Sheet, or try the demo. */
export function Connect() {
  const [invite, setInvite] = useState('')
  const [url, setUrl] = useState(DEFAULT_URL)
  const [familyKey, setFamilyKey] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect(c: Connection) {
    setBusy(true)
    setError(null)
    try {
      await createApi(c)({ action: 'ping' }, 30000)
      saveConnection(c)
      setDemoChosen(false)
      location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  const fromInvite = decodeInvite(invite)
  const manualOk = validUrl(url) && key.trim().length >= 16

  return (
    <div className="stack-lg" style={{ paddingTop: 48 }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="brand" style={{ flex: 'none' }}><i /><b style={{ fontSize: '2.4rem' }}>Anavrin</b><i /></div>
        <p className="muted">Connect this phone to the family’s Google Sheet</p>
      </div>

      {validUrl(DEFAULT_URL) && (
        <form className="panel stack" onSubmit={(e) => { e.preventDefault(); if (familyKey.trim().length >= 16) connect({ url: DEFAULT_URL, key: familyKey.trim() }) }}>
          <h2>Enter the family key</h2>
          <p className="small muted">32 letters and numbers. It’s in the Apps Script log after running setup, or ask whoever set up the app.</p>
          <Field label="Family key">
            <input id="cn-family-key" className="input id" value={familyKey} onChange={(e) => setFamilyKey(e.target.value)} autoComplete="off" />
          </Field>
          <button className="btn primary" disabled={familyKey.trim().length < 16 || busy}>{busy ? 'Connecting…' : 'Connect'}</button>
        </form>
      )}

      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); if (fromInvite) connect(fromInvite) }}>
        <h2>Got an invite link?</h2>
        <p className="small muted">Someone already using the app can send it from Settings → Invite family. Opening the link connects automatically; or paste it here.</p>
        <Field label="Invite link">
          <input id="cn-invite" className="input" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="https://…?join=…" />
        </Field>
        <button className="btn primary" disabled={!fromInvite || busy}>{busy && fromInvite ? 'Connecting…' : 'Connect'}</button>
      </form>

      <details className="panel">
        <summary>{validUrl(DEFAULT_URL) ? 'Use a different Google Sheet' : 'Setting it up for the first time'}</summary>
        <form className="stack" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (manualOk) connect({ url: url.trim(), key: key.trim() }) }}>
          <p className="small muted">Follow SETUP.md. At the end you’ll have a Web app URL and a family key.</p>
          <Field label="Web app URL">
            <input id="cn-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
          </Field>
          <Field label="Family key">
            <input id="cn-key" className="input id" value={key} onChange={(e) => setKey(e.target.value)} placeholder="32 letters and numbers" />
          </Field>
          {url && !validUrl(url) && <p className="small" style={{ color: 'var(--err)' }}>The URL should start with https://script.google.com/macros/s/ and end with /exec.</p>}
          <button className="btn primary" disabled={!manualOk || busy}>{busy && !fromInvite ? 'Connecting…' : 'Connect'}</button>
        </form>
      </details>

      {error && <div className="check error">{error}</div>}

      <button className="btn" onClick={() => { setDemoChosen(true); location.reload() }}>Try the demo first (nothing is saved to the sheet)</button>
    </div>
  )
}
