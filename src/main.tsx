import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import type { Repo } from './data/repo'
import { createDemoRepo } from './data/demoRepo'
import { loadConnection } from './data/connection'
import { createSheetsRepo } from './data/sheetsRepo'
import { Connect } from './screens/Connect'
import { demoChosen } from './data/demoMode'

const root = createRoot(document.getElementById('root')!)

function boot() {
  let repo: Repo | null = null
  if (__DEMO__) repo = createDemoRepo()
  else {
    const conn = loadConnection()
    if (conn) repo = createSheetsRepo(conn)
    else if (demoChosen()) repo = createDemoRepo()
  }
  root.render(<StrictMode>{repo ? <App repo={repo} /> : <Connect />}</StrictMode>)
}
boot()
