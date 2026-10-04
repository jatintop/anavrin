import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MeContext, RepoContext, useData, useRepo, type AuthInfo, type Repo } from './data/repo'
import type { AppUser } from './data/types'
import { Home } from './screens/Home'
import { Inventory, PurchaseDetail } from './screens/Inventory'
import { NewPurchase } from './screens/NewPurchase'
import { Pricing } from './screens/Pricing'
import { Stock } from './screens/Stock'
import { Settings } from './screens/Settings'
import { Stall } from './screens/Stall'
import { Dues, Family } from './screens/Family'
import { Expenses } from './screens/Expenses'
import { SignIn } from './screens/SignIn'

export default function App({ repo }: { repo: Repo }) {
  return (
    <RepoContext.Provider value={repo}>
      <Gate />
    </RepoContext.Provider>
  )
}

function Gate() {
  const repo = useRepo()
  const data = useData()
  const [auth, setAuth] = useState<AuthInfo | null | undefined>(undefined)
  useEffect(() => repo.onAuth(setAuth), [repo])

  const me: AppUser | undefined = useMemo(
    () => (auth ? data.users.find((u) => u.id === auth.uid) : undefined),
    [auth, data.users],
  )

  if (!data.error && (auth === undefined || !data.ready)) {
    return <div className="empty" style={{ paddingTop: 120 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  }
  if (data.error) {
    return (
      <div className="empty stack" style={{ paddingTop: 80 }}>
        <h2>Can’t open the app yet</h2>
        <p>{data.error}</p>
        <button className="btn primary" onClick={() => repo.syncNow?.()}>Try again</button>
        {repo.disconnect && <button className="btn" onClick={async () => { await repo.disconnect!(); location.reload() }}>Change Google Sheet connection</button>}
      </div>
    )
  }
  if (!auth || !me) return <SignIn />

  return (
    <MeContext.Provider value={me}>
      <HashRouter>
        <ScrollTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/new" element={<NewPurchase />} />
          <Route path="/inventory/:id" element={<PurchaseDetail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/stall" element={<Stall />} />
          <Route path="/family" element={<Family />} />
          <Route path="/dues" element={<Dues />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </HashRouter>
    </MeContext.Provider>
  )
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
