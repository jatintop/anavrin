// Sale maths shared by the Stall and Friends & family screens.

/** Spread a sale total over its sarees in proportion to their prices; whole rupees, adds up exactly. */
export function spreadTotal(prices: number[], total: number): number[] {
  const base = prices.reduce((a, b) => a + b, 0)
  const out = prices.map((p) => (base > 0 ? Math.round((p * total) / base) : Math.round(total / prices.length)))
  if (out.length) out[out.length - 1] += total - out.reduce((a, b) => a + b, 0)
  return out
}

export type Discount = { kind: 'none' } | { kind: 'pct'; v: number } | { kind: 'off'; v: number } | { kind: 'final'; v: number }

export function applyDiscount(base: number, d: Discount): number {
  switch (d.kind) {
    case 'none': return base
    case 'pct': return Math.round(base * (1 - d.v / 100))
    case 'off': return Math.max(0, base - d.v)
    case 'final': return d.v
  }
}
