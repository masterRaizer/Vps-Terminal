/** Hand-drawn icon set for Vps Terminal SSH (24px grid). */
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 18, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
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
export const IconMenu = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
)
export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="M6.5 9.5L12 15l5.5-5.5" />
  </Base>
)
export const IconChevronLeft = (p: P) => (
  <Base {...p}>
    <path d="M14.5 6L8.5 12l6 6" />
  </Base>
)
export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Base>
)
export const IconBell = (p: P) => (
  <Base {...p}>
    <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5zM10 20.5h4" />
  </Base>
)
/** Host list: rack with two bays. */
export const IconHosts = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 12h17M7 8.25h2M7 15.75h2M12 8.25h5M12 15.75h5" />
  </Base>
)
export const IconKey = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="7.5" r="4" />
    <path d="M12 11.5V21M12 16h3M12 19h2" />
  </Base>
)
export const IconForward = (p: P) => (
  <Base {...p}>
    <path d="M3.5 15.5c2-4.5 5.5-6.5 11-6.5" />
    <path d="M12 5l4.5 4L12 13" />
    <path d="M8.5 19.5h12M17 16l3.5 3.5L17 23" transform="translate(0 -2)" />
  </Base>
)
export const IconBraces = (p: P) => (
  <Base {...p}>
    <path d="M8.5 4.5c-2 0-2.5 1-2.5 2.5v2.5c0 1.3-.8 2.5-2 2.5 1.2 0 2 1.2 2 2.5V17c0 1.5.5 2.5 2.5 2.5M15.5 4.5c2 0 2.5 1 2.5 2.5v2.5c0 1.3.8 2.5 2 2.5-1.2 0-2 1.2-2 2.5V17c0 1.5-.5 2.5-2.5 2.5" />
  </Base>
)
export const IconFingerprint = (p: P) => (
  <Base {...p}>
    <path d="M5 10.5a7 7 0 0 1 14 0M7.5 20c.6-1.8 1-3.8 1-6v-2a3.5 3.5 0 0 1 7 0v1.5M12 12v2c0 2.6-.6 5-1.7 7M15.5 16.5c-.2 1.4-.5 2.7-1 4M19 13.5v1" />
  </Base>
)
export const IconClock = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
)
export const IconFolder = (p: P) => (
  <Base {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5z" />
  </Base>
)
export const IconFolderSolid = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
    <path
      d="M2.5 6.5a2 2 0 0 1 2-2h5l2.2 2.5h7.8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V6.5z"
      fill="currentColor"
    />
  </svg>
)
export const IconVault = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 8.8V7.5M12 16.5v-1.3M15.2 12h1.3M7.5 12h1.3" />
  </Base>
)
export const IconTerminal = (p: P) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" />
  </Base>
)
export const IconGrid = (p: P) => (
  <Base {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Base>
)
export const IconList = (p: P) => (
  <Base {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Base>
)
export const IconTag = (p: P) => (
  <Base {...p}>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0L3.5 12.2z" />
    <circle cx="8" cy="8" r="1.4" />
  </Base>
)
/** Group tile: one big pane + three small. */
export const IconGroup = (p: P) => (
  <Base {...p}>
    <rect x="4" y="4" width="9" height="9" rx="1.5" />
    <rect x="15" y="4" width="5" height="5" rx="1.2" />
    <rect x="4" y="15" width="5" height="5" rx="1.2" />
    <rect x="11" y="15" width="9" height="5" rx="1.2" />
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
export const IconLaptop = (p: P) => (
  <Base {...p}>
    <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
    <path d="M2.5 19h19" />
  </Base>
)
export const IconCertificate = (p: P) => (
  <Base {...p}>
    <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
    <circle cx="12" cy="13" r="2.5" />
    <path d="M10.5 15.2l-.8 3.3 2.3-1 2.3 1-.8-3.3" />
  </Base>
)
export const IconHistory = (p: P) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7" />
    <path d="M4 4.5v4h4M12 8v4.2l2.8 1.8" />
  </Base>
)
export const IconCollapseRight = (p: P) => (
  <Base {...p}>
    <path d="M4 12h12M11.5 7.5L16 12l-4.5 4.5M20 5v14" />
  </Base>
)
export const IconPanelRight = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M14.5 4.5v15" />
  </Base>
)
export const IconRocket = (p: P) => (
  <Base {...p}>
    <path d="M13.5 4.5c3-1 5.5-1 6-0.5s.5 3-.5 6l-5.5 5.5-5-5 5-6z" />
    <path d="M8.5 10.5l-3.5.5-1.5 2.5 4 1M13.5 15.5l-.5 3.5-2.5 1.5-1-4M6 18c-.8.8-1.5 2-1.5 2s1.2-.7 2-1.5" />
  </Base>
)
export const IconUser = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Base>
)
export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Base>
)
export const IconEye = (p: P) => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
)
export const IconEyeOff = (p: P) => (
  <Base {...p}>
    <path d="M4 4l16 16M10 6c.6-.3 1.3-.5 2-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.6C4 9.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
  </Base>
)
export const IconMinus = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
)
export const IconPlug = (p: P) => (
  <Base {...p}>
    <path d="M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0v-3zM12 16v4.5" />
  </Base>
)
