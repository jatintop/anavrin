import { useState } from 'react'
import { useData, useRepo } from '../data/repo'
import { Field } from '../ui'

export function SignIn() {
  const repo = useRepo()
  const { users } = useData()
  const [adding, setAdding] = useState(users.length === 0)

  return (
    <div className="stack-lg" style={{ paddingTop: 56 }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="brand" style={{ flex: 'none' }}><i /><b style={{ fontSize: '2.4rem' }}>Anavrin</b><i /></div>
        <p className="muted">Stock, stalls and accounts for the saree business</p>
      </div>

      {!adding && (
        <div className="panel stack">
          <h2>Who’s using this phone?</h2>
          <div className="stack">
            {users.map((u) => (
              <button key={u.id} className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => repo.signIn(u.id)}>
                <span className="avatar">{u.initial}</span>{u.name}
              </button>
            ))}
          </div>
          <button className="btn block" onClick={() => setAdding(true)}>I’m not on the list</button>
        </div>
      )}

      {adding && <ProfileForm onCancel={users.length ? () => setAdding(false) : undefined} />}
    </div>
  )
}

function ProfileForm({ onCancel }: { onCancel?: () => void }) {
  const repo = useRepo()
  const { users } = useData()
  const [name, setName] = useState('')
  const [initial, setInitial] = useState('')
  const ini = (initial || name.trim().charAt(0)).toUpperCase()
  const taken = users.some((u) => u.initial === ini)
  const valid = name.trim().length > 0 && /^[A-Z]$/.test(ini) && !taken

  async function save() {
    const id = `u-${Date.now().toString(36)}`
    await repo.saveUser({ id, name: name.trim(), initial: ini })
    await repo.signIn(id)
  }

  return (
    <form className="panel stack" onSubmit={(e) => { e.preventDefault(); if (valid) save() }}>
      <h2>{users.length ? 'Add yourself' : 'Who’s setting this up?'}</h2>
      <Field label="Your name">
        <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Initial (goes into sale numbers, e.g. S-261004-P07)">
        <input id="profile-initial" className="input" maxLength={1} value={ini}
          onChange={(e) => setInitial(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
      </Field>
      {taken && <p className="small" style={{ color: 'var(--err)' }}>{ini} is already used by someone else. Pick another letter.</p>}
      <div className="row">
        {onCancel && <button type="button" className="btn grow" onClick={onCancel}>Cancel</button>}
        <button className="btn primary grow" disabled={!valid}>Continue</button>
      </div>
    </form>
  )
}
