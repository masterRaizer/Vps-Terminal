import { useState } from 'react'
import { create } from 'zustand'

// Electron has no window.prompt(); this is the app-wide replacement.
interface Request {
  title: string
  label?: string
  value?: string
  password?: boolean
  okText?: string
  resolve: (v: string | null) => void
}

const useInput = create<{ req: Request | null }>(() => ({ req: null }))

export function askText(opts: Omit<Request, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => useInput.setState({ req: { ...opts, resolve } }))
}

export function InputDialog() {
  const req = useInput((s) => s.req)
  if (!req) return null
  return <Dialog key={req.title + (req.value ?? '')} req={req} />
}

function Dialog({ req }: { req: Request }) {
  const [v, setV] = useState(req.value ?? '')
  const done = (val: string | null): void => {
    useInput.setState({ req: null })
    req.resolve(val)
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form
        className="modal small"
        onKeyDown={(e) => e.key === 'Escape' && done(null)}
        onSubmit={(e) => {
          e.preventDefault()
          if (v.trim() || req.password) done(v)
        }}
      >
        <h2>{req.title}</h2>
        {req.label && <p>{req.label}</p>}
        <label className="rc-input wide">
          <input
            autoFocus
            type={req.password ? 'password' : 'text'}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onFocus={(e) => {
              // Select the name without its extension, like file managers do.
              const dot = e.currentTarget.value.lastIndexOf('.')
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length)
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={() => done(null)}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit">
            {req.okText ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}
