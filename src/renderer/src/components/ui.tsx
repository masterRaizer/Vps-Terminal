import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { IconChevronDown, IconCollapseRight } from './Icons'

/** Coloured square tile used on every card. */
export function Tile({ children, tone = 'blue', size = 44 }: { children: ReactNode; tone?: 'blue' | 'orange' | 'green' | 'slate'; size?: number }) {
  return (
    <span className={`tile tile-${tone}`} style={{ width: size, height: size }}>
      {children}
    </span>
  )
}

export function Card(props: {
  icon: ReactNode
  tone?: 'blue' | 'orange' | 'green' | 'slate'
  title: string
  subtitle?: string
  selected?: boolean
  onClick?: () => void
  trailing?: ReactNode
}) {
  return (
    <button className={`card ${props.selected ? 'selected' : ''}`} onClick={props.onClick} type="button">
      <Tile tone={props.tone}>{props.icon}</Tile>
      <span className="card-text">
        <span className="card-title">{props.title}</span>
        {props.subtitle && <span className="card-sub">{props.subtitle}</span>}
      </span>
      {props.trailing && <span className="card-trailing">{props.trailing}</span>}
    </button>
  )
}

/** Primary toolbar action with a dropdown chevron segment. */
export function SplitButton({ icon, label, onClick, disabled, title }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <span className="split" title={title}>
      <button className="split-main" onClick={onClick} disabled={disabled} type="button">
        {icon}
        {label}
      </button>
      <button className="split-more" disabled={disabled} type="button" aria-label="Ещё">
        <IconChevronDown size={16} />
      </button>
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
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside className="drawer" aria-label={title}>
      <header className="drawer-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} title="Скрыть панель" type="button">
          <IconCollapseRight size={18} />
        </button>
      </header>
      <div className="drawer-body">{children}</div>
      {footer && <footer className="drawer-foot">{footer}</footer>}
    </aside>
  )
}
