import { Fragment, useState } from 'react'
import { create } from 'zustand'

interface Req {
  name: string
  mode: number
  resolve: (mode: number | null) => void
}
const useChmod = create<{ req: Req | null }>(() => ({ req: null }))

export function askChmod(name: string, mode: number): Promise<number | null> {
  return new Promise((resolve) => useChmod.setState({ req: { name, mode, resolve } }))
}

const WHO = ['Владелец', 'Группа', 'Остальные']
const WHAT = ['Чтение', 'Запись', 'Выполнение']

export function ChmodDialog() {
  const req = useChmod((s) => s.req)
  if (!req) return null
  return <Dialog key={req.name} req={req} />
}

function Dialog({ req }: { req: Req }) {
  const [mode, setMode] = useState(req.mode & 0o777)
  const [octal, setOctal] = useState((req.mode & 0o777).toString(8).padStart(3, '0'))
  const done = (v: number | null): void => {
    useChmod.setState({ req: null })
    req.resolve(v)
  }
  const toggle = (bit: number): void => {
    const m = mode ^ bit
    setMode(m)
    setOctal(m.toString(8).padStart(3, '0'))
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form className="modal small" onKeyDown={(e) => e.key === 'Escape' && done(null)} onSubmit={(e) => (e.preventDefault(), done(mode))}>
        <h2>Права: {req.name}</h2>
        <div className="perm-grid">
          <span />
          {WHAT.map((w) => (
            <span key={w} className="perm-h">
              {w}
            </span>
          ))}
          {WHO.map((who, wi) => (
            <Fragment key={who}>
              <span className="perm-who">
                {who}
              </span>
              {WHAT.map((w, i) => {
                const bit = 1 << (8 - (wi * 3 + i))
                return (
                  <label key={who + w} className="perm-cell">
                    <input type="checkbox" checked={Boolean(mode & bit)} onChange={() => toggle(bit)} />
                  </label>
                )
              })}
            </Fragment>
          ))}
        </div>
        <label className="rc-input wide">
          <span className="muted">chmod</span>
          <input
            value={octal}
            maxLength={3}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-7]/g, '').slice(0, 3)
              setOctal(v)
              if (v.length === 3) setMode(parseInt(v, 8))
            }}
            className="mono"
          />
        </label>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={() => done(null)}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit">
            Применить
          </button>
        </div>
      </form>
    </div>
  )
}
