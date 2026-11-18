import { useState } from 'react'
import { create } from 'zustand'
import type { SnippetVar } from '@shared/snippets'

interface Req {
  title: string
  vars: SnippetVar[]
  resolve: (v: Record<string, string> | null) => void
}
const useVars = create<{ req: Req | null }>(() => ({ req: null }))

export function askVars(title: string, vars: SnippetVar[]): Promise<Record<string, string> | null> {
  return new Promise((resolve) => useVars.setState({ req: { title, vars, resolve } }))
}

export function SnippetVarsDialog() {
  const req = useVars((s) => s.req)
  if (!req) return null
  return <Dialog key={req.title} req={req} />
}

function Dialog({ req }: { req: Req }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(req.vars.map((v) => [v.name, v.defaultValue])))
  const done = (v: Record<string, string> | null): void => {
    useVars.setState({ req: null })
    req.resolve(v)
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form className="modal small" onKeyDown={(e) => e.key === 'Escape' && done(null)} onSubmit={(e) => (e.preventDefault(), done(values))}>
        <h2>{req.title}</h2>
        <p>Заполните переменные сниппета.</p>
        {req.vars.map((v, i) => (
          <label key={v.name} className="var-field">
            <span>{v.name}</span>
            <input autoFocus={i === 0} value={values[v.name] ?? ''} onChange={(e) => setValues((x) => ({ ...x, [v.name]: e.target.value }))} spellCheck={false} />
          </label>
        ))}
        <div className="modal-actions">
          <button className="btn" type="button" onClick={() => done(null)}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit">
            Продолжить
          </button>
        </div>
      </form>
    </div>
  )
}
