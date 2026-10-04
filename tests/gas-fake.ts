// In-memory stand-ins for the Google Apps Script services the server uses, so the real
// apps-script/Code.gs can be run and tested in Node. Mimics Sheets' habit of turning
// text like "2026-09-18" or "540730" into dates/numbers unless the cell is formatted as text.
import { randomUUID } from 'node:crypto'

type V = string | number | boolean | Date

class FakeSheet {
  data: V[][] = []
  fmt: string[][] = []
  maxRows = 1000
  frozen = 0
  constructor(public name: string) {}
  getName() { return this.name }
  getMaxRows() { return this.maxRows }
  insertRowsAfter(_after: number, n: number) { this.maxRows += n }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if (this.data[r]?.some((v) => v !== '' && v != null)) return r + 1
    return 0
  }
  setFrozenRows(n: number) { this.frozen = n }
  setColumnWidth() { return this }
  getRange(row: number, col: number, nr = 1, nc = 1) { return new FakeRange(this, row, col, nr, nc) }
  cell(r: number, c: number): V { return this.data[r - 1]?.[c - 1] ?? '' }
  set(r: number, c: number, v: V) {
    if (r > this.maxRows) throw new Error(`Range out of bounds: row ${r} > ${this.maxRows}`)
    ;(this.data[r - 1] ??= [])
    for (let i = 0; i < c; i++) this.data[r - 1][i] ??= ''
    const f = this.fmt[r - 1]?.[c - 1]
    if (typeof v === 'string' && f !== '@') {
      if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v)
      else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = new Date(v + 'T00:00:00')
    }
    this.data[r - 1][c - 1] = v
  }
  table(): V[][] { return this.data.map((r) => r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))) }
}

class FakeRange {
  constructor(private sh: FakeSheet, private r: number, private c: number, private nr: number, private nc: number) {
    if (r + nr - 1 > sh.maxRows) throw new Error(`Range out of bounds: rows ${r}-${r + nr - 1} > ${sh.maxRows}`)
  }
  getValues(): V[][] {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sh.cell(this.r + i, this.c + j)))
  }
  setValues(vs: V[][]) {
    if (vs.length !== this.nr || vs.some((row) => row.length !== this.nc)) throw new Error('setValues: size mismatch')
    vs.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v)))
    return this
  }
  setNumberFormats(fs: string[][]) {
    fs.forEach((row, i) => row.forEach((f, j) => { ((this.sh.fmt[this.r + i - 1] ??= [])[this.c + j - 1] = f) }))
    return this
  }
  clearContent() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.sh.data[this.r + i - 1]) this.sh.data[this.r + i - 1][this.c + j - 1] = ''
    return this
  }
  setFontWeight() { return this }
  setBackground() { return this }
}

export function makeGas() {
  const sheets = new Map<string, FakeSheet>([['Sheet1', new FakeSheet('Sheet1')]])
  const props = new Map<string, string>()
  const files = new Map<string, { bytes: number[]; type: string; name: string; folder: string }>()
  const folders = new Map<string, string>()
  let fetchHandler: (url: string, opts: { payload: string; headers: Record<string, string> }) => { code: number; body: string } =
    () => ({ code: 500, body: 'no fetch handler' })
  const fetchLog: string[] = []

  const book = {
    getSheetByName: (n: string) => sheets.get(n) ?? null,
    insertSheet: (n: string) => { const s = new FakeSheet(n); sheets.set(n, s); return s },
    getSheets: () => [...sheets.values()],
    deleteSheet: (s: FakeSheet) => sheets.delete(s.name),
    getName: () => 'Anavrin',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE/edit',
  }
  const blob = (bytes: number[], type: string, name = 'file') => ({ getBytes: () => bytes, getContentType: () => type, getName: () => name })
  const folder = (id: string) => ({
    getId: () => id,
    createFile: (b: ReturnType<typeof blob>) => {
      const fid = 'f' + randomUUID().slice(0, 8)
      files.set(fid, { bytes: b.getBytes(), type: b.getContentType(), name: b.getName(), folder: id })
      return { getId: () => fid }
    },
  })

  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, v) } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      base64Decode: (s: string) => [...Buffer.from(s, 'base64')],
      base64Encode: (b: number[]) => Buffer.from(b).toString('base64'),
      newBlob: blob,
      getUuid: () => randomUUID(),
    },
    DriveApp: {
      createFolder: (name: string) => { const id = 'd' + randomUUID().slice(0, 8); folders.set(id, name); return folder(id) },
      getFolderById: (id: string) => { if (!folders.has(id)) throw new Error('no folder'); return folder(id) },
      getFileById: (id: string) => { const f = files.get(id); if (!f) throw new Error('no file'); return { getBlob: () => blob(f.bytes, f.type, f.name) } },
    },
    UrlFetchApp: {
      fetch: (url: string, opts: { payload: string; headers: Record<string, string> }) => {
        fetchLog.push(url)
        const r = fetchHandler(url, opts)
        return { getResponseCode: () => r.code, getContentText: () => r.body }
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s: string) => { const o = { content: s, setMimeType: () => o, getContent: () => s }; return o },
    },
    console,
  }
  return {
    globals, sheets, props, files, fetchLog,
    onFetch: (h: typeof fetchHandler) => { fetchHandler = h },
  }
}
