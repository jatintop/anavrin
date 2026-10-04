import { describe, expect, it } from 'vitest'
import golden from '../../golden/expected.json'
import { checkBill, normalizeBill, toIsoDate, toNum, unitCost, suggestedAdjustment, hasErrors } from './bill'
import { itemId, nextSeq, parseItemQuery, purchaseId, saleId, yymm } from './ids'
import { nextFreeId } from './ops'
import { applyDiscount, spreadTotal } from './sale'
import { compareBills, similar } from './extract/compare'

const g = golden as Record<string, unknown>

describe('ids', () => {
  it('formats item and transaction ids', () => {
    expect(itemId('VIS', '2026-09-18', 1)).toBe('VIS-2609-001')
    expect(itemId('KAN', '2026-10-04', 142)).toBe('KAN-2610-142')
    expect(purchaseId('2026-07-01', 5)).toBe('P-2607-005')
    expect(saleId('2026-10-04', 'P', 7)).toBe('S-261004-P07')
    expect(yymm('2026-12-31')).toBe('2612')
  })
  it('parses stall search input', () => {
    expect(parseItemQuery('kan-2610-12')).toEqual({ exact: 'KAN-2610-012' })
    expect(parseItemQuery('KAN261012')).toEqual({ exact: 'KAN-2610-012' })
    expect(parseItemQuery('vis 12')).toEqual({ type: 'VIS', seq: 12 })
    expect(parseItemQuery('ka')).toEqual({ type: 'KA' })
    expect(parseItemQuery('??')).toEqual({})
  })
})

describe('normalise', () => {
  it('reads Indian numbers and dates', () => {
    expect(toNum('₹ 16,590.02')).toBe(16590.02)
    expect(toNum('3 Pcs')).toBe(3)
    expect(toNum('abc')).toBeNull()
    expect(toIsoDate('07/08/2026')).toBe('2026-08-07')
    expect(toIsoDate('16-Jun-26')).toBe('2026-06-16')
    expect(toIsoDate('21-Jul-26')).toBe('2026-07-21')
    expect(toIsoDate('2026-09-18')).toBe('2026-09-18')
  })
  it('never throws on junk', () => {
    const b = normalizeBill({ lines: [{ qty: '2', rate: '1,495.00', amount: '2990' }], docType: 'weird' })
    expect(b.lines[0]).toMatchObject({ qty: 2, rate: 1495, amount: 2990 })
    expect(b.docType).toBe('other')
    expect(normalizeBill(null).lines).toEqual([])
  })
})

describe('checks on the 5 real bills', () => {
  for (const [file, raw] of Object.entries(g)) {
    it(`${file} passes all checks`, () => expect(hasErrors(checkBill(normalizeBill(raw)))).toBe(false))
  }
  it('catches a misread row (rows shifted by one)', () => {
    const b = normalizeBill(g['royal-threads-RE006629.png'])
    const shifted = { ...b, lines: b.lines.map((l, i) => ({ ...l, qty: b.lines[(i + 1) % b.lines.length].qty })) }
    const errs = checkBill(shifted).filter((c) => c.level === 'error')
    expect(errs.length).toBeGreaterThan(0)
  })
  it('catches a misread digit (795 read as 705)', () => {
    const b = normalizeBill(g['royal-threads-OT001058.jpg'])
    b.lines[0].rate = 705
    expect(checkBill(b).some((c) => c.id === 'math-0' && c.level === 'error')).toBe(true)
  })
})

describe('cost price per saree', () => {
  const b = normalizeBill(g['royal-threads-OT001058.jpg'])
  it('spreads GST + round-off for an unregistered buyer', () => {
    expect(unitCost(b.lines[0], b, { gstRegistered: false })).toBe(834.75) // 795 × 21105/20100
  })
  it('ignores GST when registered', () => {
    expect(unitCost(b.lines[0], b, { gstRegistered: true })).toBe(795)
  })
  it('applies a handwritten deduction only when it is a discount', () => {
    expect(suggestedAdjustment(b)).toBe(5000)
    expect(unitCost(b.lines[0], b, { gstRegistered: false, adjustment: { amount: 5000, reason: 'advance' } })).toBe(834.75)
    expect(unitCost(b.lines[0], b, { gstRegistered: false, adjustment: { amount: 5000, reason: 'discount' } })).toBe(636.99) // 795 × 16105/20100
  })
  it('per-piece costs add back to what was paid', () => {
    const total = b.lines.reduce((a, l) => a + unitCost(l, b, { gstRegistered: false }) * l.qty, 0)
    expect(Math.abs(total - 21105)).toBeLessThan(0.5)
  })
})

describe('golden comparison', () => {
  it('matches names loosely', () => {
    expect(similar('SAREE (FINISH) SWANIKA', 'SAREE(FINISH)SWANIKA')).toBe(true)
    expect(similar('VRT KUM KUM GEORJJETT SELF 4815', 'VRT KUMKUM GEORJETT SELF 4815')).toBe(true)
    expect(similar('DURGA', 'NANDITA')).toBe(false)
  })
  it('a perfect read scores 100%', () => {
    const b = normalizeBill(g['mahapragya-1612.png'])
    expect(compareBills(b, b).every((r) => r.ok)).toBe(true)
  })
})

describe('selling', () => {
  it('spreads a discounted total over the sarees, in whole rupees that add up', () => {
    expect(spreadTotal([1350, 1350], 2500)).toEqual([1250, 1250])
    const p = spreadTotal([1000, 1450, 699], 2833)
    expect(p.reduce((a, b) => a + b, 0)).toBe(2833)
    expect(spreadTotal([0, 0], 1001)).toEqual([501, 500])
  })
  it('applies stall discounts', () => {
    expect(applyDiscount(1450, { kind: 'pct', v: 10 })).toBe(1305)
    expect(applyDiscount(150, { kind: 'off', v: 200 })).toBe(0)
    expect(applyDiscount(1450, { kind: 'final', v: 1200 })).toBe(1200)
  })
  it('numbers sales per person and moves past a number another phone already used', () => {
    expect(nextSeq(['S-261004-J01', 'S-261004-J02', 'S-261004-P05', 'S-261003-J09'], 'S-261004-J')).toBe(3)
    expect(nextSeq([], 'E-2610-J')).toBe(1)
    expect(nextFreeId('S-261004-J01', new Set(['S-261004-J01', 'S-261004-J02']))).toBe('S-261004-J03')
    expect(nextFreeId('F-2610-J99', new Set(['F-2610-J99']))).toBe('F-2610-J100')
  })
})
