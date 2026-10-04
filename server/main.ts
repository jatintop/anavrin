// Anavrin server — runs free inside Google Apps Script, attached to the family's Google Sheet.
// Built into apps-script/Code.gs by `npm run build:server`. Do not edit Code.gs by hand.
import { normalizeBill, type ExtractedBill } from '../src/lib/bill'
import { BILL_PROMPT } from '../src/lib/extract/prompt'
import { applyOp, type Envelope, type Op, type Tables } from '../src/lib/ops'
import { buildPurchase } from '../src/lib/purchase'
import { DEFAULT_SETTINGS, DEFAULT_TYPES, DEFAULT_VENDORS } from '../src/data/seed'
import type { AppUser, Expense, Item, Purchase, PurchaseDraft, SaleLine, Settings } from '../src/data/types'
import {
  ALL_TABLES, COUNTERS, EXPENSES, ITEMS, LINES, LOG, PEOPLE, PURCHASES, SALE_LINES, SALES, SETTINGS, TYPES, VENDORS,
  itemFromRec, lineFromRec, lineToRec, purchaseFromRec, purchaseToRec, recordToRow, rowToRecord,
  saleFromRec, saleLineToRec, saleToRec, type Table,
} from './schema'

type Rec = Record<string, unknown>
type Sheet = GoogleAppsScript.Spreadsheet.Sheet

// ---------- sheet helpers ----------
const FORMAT: Record<string, string> = { num: '#,##0.##', bool: 'General' }
const fmtFor = (t: Table) => t.cols.map((c) => FORMAT[c.kind] ?? '@')

function book() { return SpreadsheetApp.getActiveSpreadsheet() }

function tab(t: Table): Sheet {
  const ss = book()
  let sh = ss.getSheetByName(t.name)
  if (sh) return sh
  sh = ss.insertSheet(t.name)
  sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols.map((c) => c.header)]).setFontWeight('bold').setBackground('#f6ebd3')
  sh.setFrozenRows(1)
  t.cols.forEach((c, i) => { if (c.width) sh!.setColumnWidth(i + 1, c.width) })
  return sh
}

function ensureRows(sh: Sheet, lastNeeded: number) {
  const max = sh.getMaxRows()
  if (lastNeeded > max) sh.insertRowsAfter(max, lastNeeded - max)
}

function readTable(t: Table): Rec[] {
  const sh = tab(t)
  const last = sh.getLastRow()
  if (last < 2) return []
  const values = sh.getRange(2, 1, last - 1, t.cols.length).getValues()
  return values.filter((r) => r.some((v) => v !== '' && v !== null)).map((r) => rowToRecord(t, r))
}

function writeRows(sh: Sheet, t: Table, startRow: number, recs: Rec[]) {
  if (!recs.length) return
  ensureRows(sh, startRow + recs.length - 1)
  const rng = sh.getRange(startRow, 1, recs.length, t.cols.length)
  const f = fmtFor(t)
  rng.setNumberFormats(recs.map(() => f))
  rng.setValues(recs.map((r) => recordToRow(t, r)))
}

function writeAll(t: Table, recs: Rec[]) {
  const sh = tab(t)
  const last = sh.getLastRow()
  writeRows(sh, t, 2, recs)
  if (last > recs.length + 1) sh.getRange(recs.length + 2, 1, last - recs.length - 1, t.cols.length).clearContent()
}

function appendRecs(t: Table, recs: Rec[]) {
  const sh = tab(t)
  writeRows(sh, t, Math.max(sh.getLastRow(), 1) + 1, recs)
}

// ---------- state ----------
export function readState(): Tables {
  const lines = readTable(LINES).map(lineFromRec)
  const byPurchase = new Map<string, typeof lines>()
  lines.forEach((l) => byPurchase.set(l.purchaseId, [...(byPurchase.get(l.purchaseId) ?? []), l]))
  const settingsRow = readTable(SETTINGS)[0] as unknown as Settings | undefined
  return {
    users: readTable(PEOPLE) as unknown as AppUser[],
    vendors: readTable(VENDORS) as unknown as Tables['vendors'],
    types: readTable(TYPES) as unknown as Tables['types'],
    settings: settingsRow ? { ...DEFAULT_SETTINGS, ...settingsRow } : DEFAULT_SETTINGS,
    purchases: readTable(PURCHASES).map((r) => {
      const ls = (byPurchase.get(String(r.id)) ?? []).sort((a, b) => a.lineNo - b.lineNo)
      return purchaseFromRec(r, ls.map(({ purchaseId: _p, lineNo: _n, ...l }) => l))
    }),
    items: readTable(ITEMS).map(itemFromRec),
    sales: readSales(),
    expenses: readTable(EXPENSES).map((r) => ({ ...(r as unknown as Expense), deleted: r.deleted === true })),
  }
}

function readSales() {
  const bySale = new Map<string, (SaleLine & { lineNo: number })[]>()
  readTable(SALE_LINES).forEach((r) => {
    const { saleId, ...l } = r as unknown as SaleLine & { saleId: string; lineNo: number }
    bySale.set(saleId, [...(bySale.get(saleId) ?? []), l])
  })
  return readTable(SALES).map((r) => {
    const ls = (bySale.get(String(r.id)) ?? []).sort((a, b) => a.lineNo - b.lineNo)
    return saleFromRec(r, ls.map(({ lineNo: _n, ...l }) => l))
  })
}

const TOUCHES: Record<Op['t'], (keyof Tables)[]> = {
  saveUser: ['users'], saveVendor: ['vendors'], deleteVendor: ['vendors'], saveType: ['types'], deleteType: ['types'],
  saveSettings: ['settings'], setPurchaseDeleted: ['purchases', 'items'], updateItems: ['items'],
  saveSale: ['sales', 'items'], setSaleDeleted: ['sales', 'items'], settleSale: ['sales'],
  saveExpense: ['expenses'], setExpenseDeleted: ['expenses'],
}

function writeTables(s: Tables, which: Set<keyof Tables>) {
  if (which.has('users')) writeAll(PEOPLE, s.users as unknown as Rec[])
  if (which.has('vendors')) writeAll(VENDORS, s.vendors as unknown as Rec[])
  if (which.has('types')) writeAll(TYPES, s.types as unknown as Rec[])
  if (which.has('settings')) writeAll(SETTINGS, [s.settings as unknown as Rec])
  if (which.has('purchases')) writeAll(PURCHASES, s.purchases.map(purchaseToRec))
  if (which.has('items')) writeAll(ITEMS, s.items as unknown as Rec[])
  if (which.has('sales')) {
    writeAll(SALES, s.sales.map(saleToRec))
    writeAll(SALE_LINES, s.sales.flatMap((x) => x.lines.map((l, i) => saleLineToRec(x.id, l, i))))
  }
  if (which.has('expenses')) writeAll(EXPENSES, s.expenses as unknown as Rec[])
}

function loggedIds(): Set<string> {
  const sh = tab(LOG)
  const last = sh.getLastRow()
  if (last < 2) return new Set()
  return new Set(sh.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])))
}

function summarize(op: Op): string {
  switch (op.t) {
    case 'updateItems': return `${op.ids.length} saree(s): ${JSON.stringify(op.patch)} — ${op.ids.slice(0, 6).join(', ')}${op.ids.length > 6 ? '…' : ''}`
    case 'setPurchaseDeleted': return `${op.id} ${op.deleted ? 'deleted' : 'restored'}`
    case 'saveUser': return op.u.name
    case 'saveVendor': return op.v.name
    case 'saveType': return `${op.type.code} ${op.type.name}`
    case 'deleteVendor': return op.id
    case 'deleteType': return op.code
    case 'saveSettings': return JSON.stringify(op.s)
    case 'saveSale': return `${op.sale.id} ${op.sale.kind} ₹${op.sale.total} ${op.sale.payment}${op.sale.customer ? ` · ${op.sale.customer}` : ''} — ${op.sale.lines.map((l) => l.itemId).join(', ')}`
    case 'setSaleDeleted': return `${op.id} ${op.deleted ? 'cancelled' : 'restored'}`
    case 'settleSale': return `${op.id} paid by ${op.payment} on ${op.on}`
    case 'saveExpense': return `${op.e.id} ${op.e.category} ₹${op.e.amount}${op.e.note ? ` · ${op.e.note}` : ''}`
    case 'setExpenseDeleted': return `${op.id} ${op.deleted ? 'deleted' : 'restored'}`
    default: return ''
  }
}

export function applyOps(envs: Envelope[]): { applied: string[]; state: Tables } {
  const done = loggedIds()
  let s = readState()
  const touched = new Set<keyof Tables>()
  const applied: string[] = []
  const log: Rec[] = []
  for (const e of envs) {
    applied.push(e.opId)
    if (done.has(e.opId)) continue
    if (!TOUCHES[e.op.t]) throw new Error(`This server doesn’t know the change “${e.op.t}”. Paste the latest Code.gs into Apps Script and deploy a new version.`)
    s = applyOp(s, e)
    TOUCHES[e.op.t].forEach((k) => touched.add(k))
    done.add(e.opId)
    log.push({ opId: e.opId, at: e.at, by: e.by, action: e.op.t, summary: summarize(e.op) })
  }
  writeTables(s, touched)
  appendRecs(LOG, log)
  return { applied, state: s }
}

export function savePurchase(opId: string, draft: PurchaseDraft, by: string): { purchase: Purchase; state: Tables } {
  const sh = tab(LOG)
  const last = sh.getLastRow()
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 5).getValues()
    const hit = rows.find((r) => String(r[0]) === opId)
    if (hit) { // a retry of a save that already went through
      const state = readState()
      const pid = String(hit[4]).split(' ')[0]
      const p = state.purchases.find((x) => x.id === pid)
      if (p) return { purchase: p, state }
    }
  }
  const counters: Record<string, number> = {}
  readTable(COUNTERS).forEach((r) => { counters[String(r.key)] = Number(r.n) || 0 })
  const settingsRow = readTable(SETTINGS)[0] as unknown as Settings | undefined
  const settings = settingsRow ? { ...DEFAULT_SETTINGS, ...settingsRow } : DEFAULT_SETTINGS
  const out = buildPurchase(draft, counters, settings, { id: by, name: by, initial: '' })
  appendRecs(PURCHASES, [purchaseToRec(out.purchase)])
  appendRecs(LINES, out.purchase.lines.map((l, i) => lineToRec(out.purchase.id, l, i)))
  appendRecs(ITEMS, out.items as unknown as Rec[])
  writeAll(COUNTERS, Object.entries(out.counters).sort().map(([key, n]) => ({ key, n })))
  appendRecs(LOG, [{ opId, at: Date.now(), by, action: 'savePurchase', summary: `${out.purchase.id} ${out.purchase.vendorName} bill ${out.purchase.billNo} · ${out.items.length} sarees` }])
  return { purchase: out.purchase, state: readState() }
}

// ---------- photos (Google Drive) ----------
function photoFolder(): GoogleAppsScript.Drive.Folder {
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty('PHOTO_FOLDER_ID')
  if (id) { try { return DriveApp.getFolderById(id) } catch { /* deleted — make a new one */ } }
  const f = DriveApp.createFolder('Anavrin bill photos')
  props.setProperty('PHOTO_FOLDER_ID', f.getId())
  return f
}

interface ImageIn { data: string; mimeType: string }
export function savePhoto(img: ImageIn): string {
  const name = `bill-${Date.now()}.${img.mimeType.includes('png') ? 'png' : 'jpg'}`
  const blob = Utilities.newBlob(Utilities.base64Decode(img.data), img.mimeType, name)
  return photoFolder().createFile(blob).getId()
}
export function getPhoto(id: string): ImageIn {
  const b = DriveApp.getFileById(id).getBlob()
  return { data: Utilities.base64Encode(b.getBytes()), mimeType: b.getContentType() ?? 'image/jpeg' }
}

// ---------- bill reading (Gemini, free tier) ----------
function parseLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  try { return JSON.parse(t) } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  return a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : {}
}

export function readBill(images: ImageIn[]): ExtractedBill {
  const props = PropertiesService.getScriptProperties()
  const key = props.getProperty('GEMINI_API_KEY')
  if (!key) throw new Error('Bill reading is not set up: add GEMINI_API_KEY in Apps Script → Project settings → Script properties.')
  const models = (props.getProperty('GEMINI_MODELS') || 'gemini-3.5-flash,gemini-3.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean)
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: BILL_PROMPT }, ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.data } }))] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  })
  let last = ''
  for (const m of models) {
    const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: body, muteHttpExceptions: true,
    })
    const code = res.getResponseCode()
    const text = res.getContentText()
    if (code === 200) {
      const j = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const out = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      return normalizeBill(parseLoose(out))
    }
    last = `${m} answered ${code}: ${text.slice(0, 200)}`
    if (![403, 404, 429, 500, 503].includes(code)) break // try the next model only for quota/availability problems
  }
  throw new Error(code429(last) ? 'The free daily limit for bill reading is used up. Type this bill in, or try again tomorrow.' : `Bill reading failed (${last})`)
}
const code429 = (s: string) => / 429:/.test(s)

// ---------- web app ----------
function json(o: unknown) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}

export function handle(req: Rec): unknown {
  const props = PropertiesService.getScriptProperties()
  const family = props.getProperty('FAMILY_KEY')
  if (!family) return { error: 'Server not set up yet: run the setup function once in Apps Script.' }
  if (req.key !== family) return { error: 'Wrong family key. Ask whoever set up the app for the invite link.', code: 'unauthorized' }
  const withLock = <T,>(fn: () => T): T => {
    const lock = LockService.getScriptLock()
    lock.waitLock(30000)
    try { return fn() } finally { lock.releaseLock() }
  }
  switch (req.action) {
    case 'ping': return { ok: true, name: book().getName(), sheetUrl: book().getUrl() }
    case 'all': return { state: readState(), sheetUrl: book().getUrl() }
    case 'ops': return withLock(() => applyOps(req.ops as Envelope[]))
    case 'savePurchase': return withLock(() => savePurchase(String(req.opId), req.draft as PurchaseDraft, String(req.by)))
    case 'uploadPhoto': return { ref: savePhoto(req.image as ImageIn) }
    case 'photo': return getPhoto(String(req.id))
    case 'readBill': {
      const images = (req.images as ImageIn[]).slice(0, 4)
      const photoRefs = images.map(savePhoto)
      return { bill: readBill(images), photoRefs }
    }
    default: return { error: `Unknown action ${String(req.action)}` }
  }
}

export function doPost(e: GoogleAppsScript.Events.DoPost) {
  let req: Rec
  try { req = JSON.parse(e.postData.contents) } catch { return json({ error: 'Bad request' }) }
  try { return json(handle(req)) } catch (err) { return json({ error: (err as Error).message ?? String(err) }) }
}

export function doGet() {
  return ContentService.createTextOutput('Anavrin server is running. Open the Anavrin app to use it.')
}

/** Run once from the Apps Script editor. Safe to run again. */
export function setup() {
  ALL_TABLES.forEach(tab)
  const ss = book()
  const blank = ss.getSheetByName('Sheet1')
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank)
  if (!readTable(TYPES).length) writeAll(TYPES, DEFAULT_TYPES as unknown as Rec[])
  if (!readTable(VENDORS).length) writeAll(VENDORS, DEFAULT_VENDORS as unknown as Rec[])
  if (!readTable(SETTINGS).length) writeAll(SETTINGS, [DEFAULT_SETTINGS as unknown as Rec])
  const props = PropertiesService.getScriptProperties()
  let key = props.getProperty('FAMILY_KEY')
  if (!key) { key = Utilities.getUuid().replace(/-/g, ''); props.setProperty('FAMILY_KEY', key) }
  photoFolder()
  const gem = props.getProperty('GEMINI_API_KEY') ? 'found' : 'MISSING — add it under Project settings → Script properties (see SETUP.md)'
  console.log(`Setup done.\n\nFamily key: ${key}\nGemini key: ${gem}\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Then paste the Web app URL and the family key into the Anavrin app.`)
  return key
}

export type { Item }
