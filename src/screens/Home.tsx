import { Link } from 'react-router-dom'
import { useData } from '../data/repo'
import { money } from '../lib/purchase'
import { DemoBanner, Icon, TopBar } from '../ui'

export function Home() {
  const { items, purchases } = useData()
  const live = items.filter((i) => !i.deleted)
  const unpriced = live.filter((i) => i.status === 'unpriced').length
  const inStock = live.filter((i) => i.status === 'in_stock')
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
          <Link className="tile soon" to="/stall">
            <Icon name="stall" size={28} />
            <div><strong>Stall</strong><div className="small">Coming next</div></div>
          </Link>
          <Link className="tile soon" to="/family">
            <Icon name="people" size={28} />
            <div><strong>Friends &amp; family</strong><div className="small">Coming soon</div></div>
          </Link>
          <Link className="tile soon" to="/expenses">
            <Icon name="wallet" size={28} />
            <div><strong>Expenses</strong><div className="small">Coming soon</div></div>
          </Link>
        </nav>

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
