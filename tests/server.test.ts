// Runs the real, bundled apps-script/Code.gs against fake Google services.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import golden from '../golden/expected.json'
import { makeGas } from './gas-fake'
import { normalizeBill, taxTotal } from '../src/lib/bill'
import { draftLinesFromBill } from '../src/lib/purchase'
import { DEFAULT_TYPES, DEFAULT_VENDORS } from '../src/data/seed'
import type { DataState, PurchaseDraft, Sale } from '../src/data/types'
import type { Envelope } from '../src/lib/ops'

let code = ''
beforeAll(() => {
  execFileSync('node', ['scripts/build-server.mjs'])
  code = readFileSync('apps-script/Code.gs', 'utf8')
})

let gas: ReturnType<typeof makeGas>
let ctx: vm.Context
let KEY = ''
const call = (body: Record<string, unknown>) => {
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ key: KEY, ...body }) } })
  return JSON.parse(out.getContent())
}

beforeEach(() => {
  gas = makeGas()
  ctx = vm.createContext({ ...gas.globals, Date, JSON, Math })
  vm.runInContext(code, ctx)
  KEY = ctx.setup()
})

function draft(file: string): PurchaseDraft {
  const b = normalizeBill((golden as Record<string, unknown>)[file])
  const v = DEFAULT_VENDORS[0]
  return {
    vendorId: v.id, vendorName: v.name, billNo: b.billNo!, billDate: b.billDate!, docType: b.docType,
    lines: draftLinesFromBill(b, v, DEFAULT_TYPES), subtotal: b.subtotal!, tax: taxTotal(b), roundOff: b.roundOff ?? 0,
    grandTotal: b.grandTotal!, adjustment: { amount: 5000, reason: 'advance' }, amountPaid: b.grandTotal, photoRefs: [], readByAi: true, checksOverridden: false,
  }
}
const env = (op: Envelope['op'], opId = Math.random().toString(36).slice(2)): Envelope => ({ opId, by: 'u-j', at: Date.UTC(2026, 9, 4, 10), op })

describe('setup', () => {
  it('creates the tabs, seeds lists, removes the blank sheet', () => {
    expect([...gas.sheets.keys()]).toEqual(['Sarees', 'Purchases', 'Bill lines', 'Sales', 'Sale lines', 'Expenses', 'Vendors', 'Saree types', 'People', 'Settings', 'Counters', 'Log'])
    expect(gas.sheets.get('Saree types')!.table()[1]).toEqual(['KAN', 'Kanjeevaram'])
    expect(KEY).toMatch(/^[0-9a-f]{32}$/)
    expect(ctx.setup()).toBe(KEY) // running again keeps the key
  })
  it('rejects a wrong key', () => {
    KEY = 'nope'
    expect(call({ action: 'all' }).code).toBe('unauthorized')
  })
})

describe('saving a bill into the sheet', () => {
  it('allocates IDs, writes readable rows, and reads back identical data', () => {
    const r = call({ action: 'savePurchase', opId: 'op1', draft: draft('royal-threads-OT001058.jpg'), by: 'u-j' })
    expect(r.purchase.id).toBe('P-2609-001')
    const st: DataState = r.state
    expect(st.items).toHaveLength(20)
    const durga = st.items.find((i) => i.id === 'VIS-2609-001')!
    expect(durga).toMatchObject({ design: 'Durga', cost: 834.75, price: null, status: 'unpriced', purchaseDate: '2026-09-18', deleted: false })
    const p = st.purchases[0]
    expect(p.lines).toHaveLength(11)
    expect(p.lines[0]).toMatchObject({ description: 'DURGA', hsn: '540730', qty: 3, rate: 795, itemIds: ['VIS-2609-001', 'VIS-2609-002', 'VIS-2609-003'] })
    expect(p.adjustment).toEqual({ amount: 5000, reason: 'advance' })
    expect(p.billDate).toBe('2026-09-18')
    // the sheet itself is human-readable
    const row = gas.sheets.get('Sarees')!.table()[1]
    expect(row.slice(0, 6)).toEqual(['VIS-2609-001', 'VIS', 'Durga', 'Needs price', '', 834.75])
    expect(gas.sheets.get('Purchases')!.table()[1][4]).toBe('Quotation')
  })
  it('a retried save (same change ID) does not create a second copy', () => {
    call({ action: 'savePurchase', opId: 'op1', draft: draft('royal-threads-OT001058.jpg'), by: 'u-j' })
    const again = call({ action: 'savePurchase', opId: 'op1', draft: draft('royal-threads-OT001058.jpg'), by: 'u-j' })
    expect(again.purchase.id).toBe('P-2609-001')
    expect(again.state.items).toHaveLength(20)
  })
  it('numbering continues across bills', () => {
    call({ action: 'savePurchase', opId: 'a', draft: draft('royal-threads-OT001058.jpg'), by: 'u-j' })
    const r = call({ action: 'savePurchase', opId: 'b', draft: { ...draft('royal-threads-OT000716.png'), billDate: '2026-09-25' }, by: 'u-j' })
    expect(r.purchase.id).toBe('P-2609-002')
    expect(r.purchase.lines.flatMap((l: { itemIds: string[] }) => l.itemIds)).toContain('VIS-2609-021')
  })
  it('grows the sheet past its row limit', () => {
    gas.sheets.get('Sarees')!.maxRows = 10
    const r = call({ action: 'savePurchase', opId: 'big', draft: draft('royal-threads-RE006629.png'), by: 'u-j' })
    expect(r.state.items).toHaveLength(30)
  })
})

describe('changes from phones', () => {
  it('applies queued changes once, in order, and logs them', () => {
    call({ action: 'savePurchase', opId: 'p', draft: draft('royal-threads-OT001058.jpg'), by: 'u-j' })
    const ops = [
      env({ t: 'updateItems', ids: ['VIS-2609-001', 'VIS-2609-002'], patch: { price: 1350, status: 'in_stock' } }, 'x1'),
      env({ t: 'saveUser', u: { id: 'u-p', name: 'Prabha', initial: 'P' } }, 'x2'),
      env({ t: 'updateItems', ids: ['VIS-2609-001'], patch: { status: 'sold' } }, 'x3'),
    ]
    const r1 = call({ action: 'ops', ops })
    expect(r1.applied).toEqual(['x1', 'x2', 'x3'])
    const st: DataState = r1.state
    expect(st.items.find((i) => i.id === 'VIS-2609-001')).toMatchObject({ price: 1350, status: 'sold', updatedBy: 'u-j' })
    expect(st.users.map((u) => u.name)).toEqual(['Prabha'])
    // phone retries the same batch after a dropped connection: nothing changes twice
    const r2 = call({ action: 'ops', ops })
    expect(r2.state.items).toEqual(st.items)
    expect(gas.sheets.get('Log')!.table().length).toBe(1 + 1 + 3)
    expect(gas.sheets.get('Sarees')!.table()[1][3]).toBe('Sold')
  })
  it('settings, vendors and types round-trip', () => {
    const r = call({ action: 'ops', ops: [
      env({ t: 'saveSettings', s: { gstRegistered: true, markupPct: 70, roundTo: 100 } }),
      env({ t: 'saveVendor', v: { id: 'new-v', name: 'New Vendor', defaultType: 'KAN' } }),
      env({ t: 'deleteType', code: 'OTH' }),
    ] })
    expect(r.state.settings).toEqual({ gstRegistered: true, markupPct: 70, roundTo: 100 })
    expect(r.state.vendors.at(-1)).toEqual({ id: 'new-v', name: 'New Vendor', defaultType: 'KAN' })
    expect(r.state.types.some((t: { code: string }) => t.code === 'OTH')).toBe(false)
    expect(call({ action: 'all' }).state).toEqual(r.state)
  })
  it('soft-deletes and restores a bill', () => {
    call({ action: 'savePurchase', opId: 'p', draft: draft('mahapragya-1612.png'), by: 'u-j' })
    const del = call({ action: 'ops', ops: [env({ t: 'setPurchaseDeleted', id: 'P-2607-001', deleted: true })] })
    expect(del.state.purchases[0].deleted).toBe(true)
    expect(del.state.items.every((i: { deleted: boolean }) => i.deleted)).toBe(true)
    const back = call({ action: 'ops', ops: [env({ t: 'setPurchaseDeleted', id: 'P-2607-001', deleted: false })] })
    expect(back.state.items.every((i: { deleted: boolean }) => !i.deleted)).toBe(true)
  })
})

describe('sales and expenses', () => {
  const stamp = (by = 'u-j', at = Date.UTC(2026, 9, 4, 5, 30)) => ({ createdBy: by, createdAt: at, updatedBy: by, updatedAt: at })
  const sale = (id: string, ids: string[], extra: Partial<Sale> = {}): Sale => ({
    id, kind: 'stall', date: '2026-10-04', place: 'Jayanagar', customer: '', phone: '',
    lines: ids.map((itemId) => ({ itemId, design: 'Durga', tag: 1350, price: 1250 })),
    tagTotal: 1350 * ids.length, discount: 100 * ids.length, total: 1250 * ids.length, payment: 'upi', settledOn: '', note: '', ...stamp(), ...extra,
  })
  beforeEach(() => { call({ action: 'savePurchase', opId: 'p', draft: draft('royal-threads-OT001058.jpg'), by: 'u-j' }) })

  it('a stall sale marks its sarees sold and reads back the same, in readable rows', () => {
    const s = sale('S-261004-J01', ['VIS-2609-001', 'VIS-2609-002'])
    const r = call({ action: 'ops', ops: [env({ t: 'saveSale', sale: s })] })
    expect(r.state.sales).toEqual([s])
    expect(call({ action: 'all' }).state.sales).toEqual([{ ...s, deleted: false }])
    expect(r.state.items.filter((i: { status: string }) => i.status === 'sold').map((i: { id: string }) => i.id)).toEqual(['VIS-2609-001', 'VIS-2609-002'])
    const row = gas.sheets.get('Sales')!.table()[1]
    expect(row.slice(0, 12)).toEqual(['S-261004-J01', '2026-10-04', 'Stall', 'Jayanagar', '', '', 2, 'VIS-2609-001, VIS-2609-002', 2700, 200, 2500, 'UPI'])
    expect(gas.sheets.get('Sale lines')!.table()[2]).toEqual(['S-261004-J01', 2, 'VIS-2609-002', 'Durga', 1350, 1250])
  })
  it('pending family sale → paid later; cancelling puts sarees back in stock', () => {
    const s = sale('F-2610-J01', ['VIS-2609-003'], { kind: 'family', customer: 'Lakshmi', payment: 'pending' })
    call({ action: 'ops', ops: [env({ t: 'saveSale', sale: s })] })
    let st = call({ action: 'ops', ops: [env({ t: 'settleSale', id: 'F-2610-J01', payment: 'cash', on: '2026-10-20' })] }).state
    expect(st.sales[0]).toMatchObject({ payment: 'cash', settledOn: '2026-10-20' })
    expect(st.items.find((i: { id: string }) => i.id === 'VIS-2609-003').status).toBe('family')
    expect(gas.sheets.get('Sales')!.table()[1][2]).toBe('Family')
    st = call({ action: 'ops', ops: [env({ t: 'setSaleDeleted', id: 'F-2610-J01', deleted: true })] }).state
    expect(st.sales[0].deleted).toBe(true)
    expect(st.items.find((i: { id: string }) => i.id === 'VIS-2609-003').status).toBe('unpriced')
  })
  it('the same sale number from two phones gets the next free number instead of overwriting', () => {
    const a = sale('S-261004-J01', ['VIS-2609-001'])
    const b = { ...sale('S-261004-J01', ['VIS-2609-004']), ...stamp('u-j', Date.UTC(2026, 9, 4, 6)) }
    const st = call({ action: 'ops', ops: [env({ t: 'saveSale', sale: a }), env({ t: 'saveSale', sale: b })] }).state
    expect(st.sales.map((x: Sale) => x.id)).toEqual(['S-261004-J01', 'S-261004-J02'])
  })
  it('expenses round-trip with the receipt photo link', () => {
    const e = { id: 'E-2610-J01', date: '2026-10-04', category: 'Stall rent', amount: 500, note: 'Sunday', photoRefs: ['abc123'], ...stamp() }
    const st = call({ action: 'ops', ops: [env({ t: 'saveExpense', e })] }).state
    expect(st.expenses).toEqual([e])
    expect(call({ action: 'all' }).state.expenses).toEqual([{ ...e, deleted: false }])
    expect(gas.sheets.get('Expenses')!.table()[1].slice(0, 6)).toEqual(['E-2610-J01', '2026-10-04', 'Stall rent', 500, 'Sunday', 'https://drive.google.com/file/d/abc123/view'])
    const del = call({ action: 'ops', ops: [env({ t: 'setExpenseDeleted', id: 'E-2610-J01', deleted: true })] }).state
    expect(del.expenses[0].deleted).toBe(true)
  })
  it('refuses a change it does not know, without writing anything', () => {
    const r = call({ action: 'ops', ops: [env({ t: 'teleport' } as unknown as Envelope['op'])] })
    expect(r.error).toMatch(/latest Code.gs/)
  })
})

describe('bill photos and reading', () => {
  const img = { data: Buffer.from('fake-jpeg-bytes').toString('base64'), mimeType: 'image/jpeg' }
  it('stores photos in Drive and gives them back', () => {
    const { ref } = call({ action: 'uploadPhoto', image: img })
    expect(call({ action: 'photo', id: ref })).toEqual(img)
  })
  it('reads a bill with Gemini, saving the photo first', () => {
    const answer = (golden as Record<string, unknown>)['popular-silk-PS-2713.jpg']
    gas.onFetch((url, o) => {
      expect(o.headers['x-goog-api-key']).toBe('test-key')
      expect(url).toContain('gemini-3.5-flash:generateContent')
      return { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(answer) + '\n```' }] } }] }) }
    })
    gas.props.set('GEMINI_API_KEY', 'test-key')
    const r = call({ action: 'readBill', images: [img] })
    expect(r.error).toBeUndefined()
    expect(r.bill.lines).toHaveLength(6)
    expect(r.bill.grandTotal).toBe(16590.02)
    expect(r.photoRefs).toHaveLength(1)
    expect(gas.files.has(r.photoRefs[0])).toBe(true)
  })
  it('falls back to the lite model when the free quota is used up, then explains', () => {
    gas.props.set('GEMINI_API_KEY', 'k')
    gas.onFetch(() => ({ code: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED"}}' }))
    const r = call({ action: 'readBill', images: [img] })
    expect(gas.fetchLog.map((u) => u.split('/models/')[1].split(':')[0])).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite'])
    expect(r.error).toMatch(/free daily limit/)
  })
  it('says clearly when the Gemini key is missing', () => {
    expect(call({ action: 'readBill', images: [img] }).error).toMatch(/GEMINI_API_KEY/)
  })
})
