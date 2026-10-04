// Which Google Sheet this phone talks to: the Apps Script web-app URL + the family key.
// Stored on the phone; shared with family as an invite link (?join=...).
import { SCRIPT_URL } from '../config'

export interface Connection { url: string; key: string }

/** The family's Apps Script web app (src/config.ts). Not secret; the key is. */
export const DEFAULT_URL = SCRIPT_URL.trim()

const KEY = 'anavrin-connection'

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export function encodeInvite(c: Connection): string {
  return b64url(JSON.stringify({ u: c.url, k: c.key }))
}

export function decodeInvite(code: string): Connection | null {
  try {
    const raw = code.trim()
    const fromLink = raw.match(/[?&]join=([\w-]+)/)?.[1]
    const o = JSON.parse(unb64url(fromLink ?? raw)) as { u?: string; k?: string }
    return o.u && o.k && validUrl(o.u) ? { url: o.u, key: o.k } : null
  } catch {
    return null
  }
}

export const validUrl = (u: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim()) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u.trim())

export function loadConnection(): Connection | null {
  try {
    // an invite link opened on this phone wins
    const join = new URLSearchParams(location.search).get('join')
    if (join) {
      const c = decodeInvite(join)
      history.replaceState(null, '', location.pathname + location.hash)
      if (c) { saveConnection(c); return c }
    }
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as Connection) : null
  } catch {
    return null
  }
}

export function saveConnection(c: Connection | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c))
    else localStorage.removeItem(KEY)
  } catch { /* storage blocked */ }
}

export const inviteLink = (c: Connection) => `${location.origin}${location.pathname}?join=${encodeInvite(c)}`
