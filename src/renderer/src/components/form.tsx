/** Inline form controls used by the vault editors (icon + placeholder style). */
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { IconChevronDown } from './Icons'

export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

/** Text input with a leading icon; the placeholder doubles as the label. */
export function IconInput({ icon, right, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; right?: ReactNode }) {
  return (
    <label className={`iinput ${className ?? ''}`}>
      {icon && <span className="iinput-icon">{icon}</span>}
      <input spellCheck={false} {...rest} />
      {right}
    </label>
  )
}

export interface PickOption<T extends string> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
  icon?: ReactNode
}

/** A row that looks like an input and opens a menu of choices. */
export function PickerRow<T extends string>(props: {
  icon: ReactNode
  placeholder: string
  value?: T | null
  options: PickOption<T>[]
  onPick: (v: T) => void
  right?: ReactNode
  disabled?: boolean
  title?: string
  display?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const current = props.options.find((o) => o.value === props.value)
  return (
    <div className="picker" ref={ref}>
      <button
        type="button"
        className={`iinput picker-btn ${current || props.display ? 'has-value' : ''}`}
        disabled={props.disabled}
        title={props.title}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="iinput-icon">{props.icon}</span>
        <span className="picker-value">{props.display ?? current?.label ?? props.placeholder}</span>
        {props.right !== undefined ? <span className="picker-right">{props.right}</span> : !props.disabled && <IconChevronDown size={16} className="picker-chev" />}
      </button>
      {open && (
        <div className="popover" role="menu">
          {props.options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === props.value}
              className={o.value === props.value ? 'on' : ''}
              disabled={o.disabled}
              onClick={() => {
                setOpen(false)
                props.onPick(o.value)
              }}
            >
              {o.icon}
              <span className="pop-label">{o.label}</span>
              {o.hint && <span className="pop-hint">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Small "…" style menu for drawer headers. */
export function MoreMenu({ trigger, items }: { trigger: ReactNode; items: Array<{ label: string; onClick: () => void; danger?: boolean; disabled?: boolean }> }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div className="more" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Ещё" aria-expanded={open}>
        {trigger}
      </button>
      {open && (
        <div className="popover right" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              <span className="pop-label">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
