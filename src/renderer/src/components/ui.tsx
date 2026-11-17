import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { IconChevronDown, IconCollapseRight } from './Icons'

type Tone = 'blue' | 'orange' | 'green' | 'slate'
const TONES: readonly string[] = ['blue', 'orange', 'green', 'slate']

/** Coloured square tile used on every card. `tone` is a named tone or a #rrggbb colour. */
export function Tile({ children, tone = 'blue', size = 44 }: { children: ReactNode; tone?: Tone | string; size?: number }) {
  const named = TONES.includes(tone)
  return (
    <span className={`tile ${named ? `tile-${tone}` : ''}`} style={{ width: size, height: size, ...(named ? {} : { background: tone }) }}>
      {children}
    </span>
  )
}

export function Card(props: {
  icon: ReactNode
  tone?: Tone | string
  title: string
  subtitle?: string
  selected?: boolean
  onClick?: () => void
  trailing?: ReactNode
  badge?: ReactNode
}) {
  return (
    <div
      className={`card ${props.selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          props.onClick?.()
        }
      }}
    >
      <Tile tone={props.tone}>{props.icon}</Tile>
      <span className="card-text">
        <span className="card-title">
          {props.title}
          {props.badge}
        </span>
        {props.subtitle && <span className="card-sub">{props.subtitle}</span>}
      </span>
      {props.trailing && <span className="card-trailing">{props.trailing}</span>}
    </div>
  )
}

export interface MenuItem {
  label: string
  onClick: () => void
}

/** Primary toolbar action with a dropdown chevron segment. */
export function SplitButton({ icon, label, onClick, disabled, title, menu }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string; menu?: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <span className="split" title={title} ref={ref}>
      <button className="split-main" onClick={onClick} disabled={disabled} type="button">
        {icon}
        {label}
      </button>
      <button className="split-more" disabled={disabled || !menu?.length} type="button" aria-label="Ещё" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconChevronDown size={16} />
      </button>
      {open && menu && (
        <span className="menu" role="menu">
          {menu.map((m) => (
            <button
              key={m.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                m.onClick()
              }}
            >
              {m.label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

export function ToolButton({ icon, label, onClick, disabled, title }: { icon: ReactNode; label?: string; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button className={`tool ${label ? '' : 'tool-icon'}`} onClick={onClick} disabled={disabled} title={title ?? label} type="button">
      {icon}
      {label}
    </button>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

/** Outlined input with a label sitting on the border. */
export function Field({ label, required, icon, multiline, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: ReactNode; multiline?: boolean }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">
        {label}
        {required && ' *'}
      </span>
      <span className="field-row">
        {icon && <span className="field-icon">{icon}</span>}
        <input id={id} spellCheck={false} {...rest} />
      </span>
    </label>
  )
}

/** Right-hand editor drawer used by vault pages. */
export function Drawer({ title, onClose, children, footer, actions }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; actions?: ReactNode }) {
  return (
    <aside className="drawer" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header className="drawer-head">
        <h2>{title}</h2>
        {actions}
        <button className="icon-btn" onClick={onClose} title="Скрыть панель" type="button">
          <IconCollapseRight size={18} />
        </button>
      </header>
      <div className="drawer-body">{children}</div>
      {footer && <footer className="drawer-foot">{footer}</footer>}
    </aside>
  )
}
