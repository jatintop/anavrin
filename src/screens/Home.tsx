import { Link } from 'react-router-dom'
import { useData } from '../data/repo'
import { todayIso } from '../lib/ids'
import { money } from '../lib/purchase'
import { DemoBanner, Icon, TopBar } from '../ui'

export function Home() {
  const { items, purchases, sales, expenses } = useData()
  const today = todayIso()
  const live = sales.filter((s) => !s.deleted)
  const todaySales = live.filter((s) => s.kind === 'stall' && s.date === today)
  const pending = live.filter((s) => s.payment === 'pending')
  const monthSpent = expenses.filter((e) => !e.deleted && e.date.slice(0, 7) === today.slice(0, 7)).reduce((a, e) => a + e.amount, 0)
  const sum = (xs: { total: number }[]) => xs.reduce((a, x) => a + x.total, 0)
  const stock = items.filter((i) => !i.deleted)
  const unpriced = stock.filter((i) => i.status === 'unpriced').length
  const inStock = stock.filter((i) => i.status === 'in_stock')
  const stockValue = inStock.reduce((a, i) => a + (i.price ?? 0), 0)
  const bills = purchases.filter((p) => !p.deleted).length

  return (
    <>
      <TopBar />
      <DemoBanner />
      <div className="stack-lg">
        <nav className="tiles" aria-label="Main">
          <Link className="tile primary" to="/inventory">
            <Icon name="box" size={28} />
            <div><strong>Add inventory</strong><div className="small">Photo of the bill → stock</div></div>
          </Link>
          <Link className="tile" to="/stall">
            <Icon name="stall" size={28} />
            <div><strong>Stall</strong><div className="small num">{todaySales.length ? `Today ${money(sum(todaySales))}` : 'Sell a saree'}</div></div>
          </Link>
          <Link className="tile" to="/family">
            <Icon name="people" size={28} />
            <div><strong>Friends &amp; family</strong><div className="small">Sales &amp; dues</div></div>
          </Link>
          <Link className="tile" to="/expenses">
            <Icon name="wallet" size={28} />
            <div><strong>Expenses</strong><div className="small num">{monthSpent ? `This month ${money(monthSpent)}` : 'Rent, travel, packing'}</div></div>
          </Link>
        </nav>

        {pending.length > 0 && (
          <Link className="listlink panel" to="/dues" style={{ padding: '12px 16px' }}>
            <Icon name="people" />
            <div className="grow"><div>Dues</div><div className="small muted num">{money(sum(pending))} pending · {pending.length} sale{pending.length > 1 ? 's' : ''}</div></div>
            <Icon name="chevron" size={18} />
          </Link>
        )}

        <section className="panel">
          <div className="eyebrow">Stock</div>
          <div className="card-list">
            <Link className="listlink" to="/pricing">
              <Icon name="tag" />
              <div className="grow"><div>Price &amp; label</div><div className="small muted">Set selling prices for new sarees</div></div>
              {unpriced > 0 && <span className="badge">{unpriced}</span>}
              <Icon name="chevron" size={18} />
            </Link>
            <Link className="listlink" to="/stock">
              <Icon name="list" />
              <div className="grow">
                <div>All sarees</div>
                <div className="small muted num">{inStock.length} ready to sell · {money(stockValue)} at tag price</div>
              </div>
              <Icon name="chevron" size={18} />
            </Link>
            <Link className="listlink" to="/inventory">
              <Icon name="box" />
              <div className="grow"><div>Purchase bills</div><div className="small muted num">{bills} saved</div></div>
              <Icon name="chevron" size={18} />
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
