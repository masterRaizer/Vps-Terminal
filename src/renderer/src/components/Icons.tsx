/** Hand-drawn icon set for Vps Terminal SSH (24px grid, 1.6 stroke). */
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 16, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </Base>
)
export const IconBolt = (p: P) => (
  <Base {...p}>
    <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
  </Base>
)
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Base>
)
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)
export const IconServer = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4" width="17" height="6.5" rx="2" />
    <rect x="3.5" y="13.5" width="17" height="6.5" rx="2" />
    <path d="M7 7.25h.01M7 16.75h.01M11 7.25h6M11 16.75h6" />
  </Base>
)
export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Base>
)
export const IconShield = (p: P) => (
  <Base {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.4-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5.1-7.5-9.5V6L12 3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Base>
)
export const IconPalette = (p: P) => (
  <Base {...p}>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.8 1.8-1.8h2.1a3.9 3.9 0 0 0 3.9-3.9C20.5 6.8 16.7 3.5 12 3.5z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="10.5" cy="7.5" r="1" />
    <circle cx="15" cy="7.8" r="1" />
  </Base>
)
export const IconPrompt = (p: P) => (
  <Base {...p}>
    <path d="M5 7l5 5-5 5M12.5 17H19" />
  </Base>
)
