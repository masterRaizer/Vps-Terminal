/**
 * Vps Terminal SSH mark: a server slab whose top bay is cut out as a ">_" prompt,
 * with a status LED on the lower bay.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Vps Terminal SSH">
      <defs>
        <linearGradient id="vts-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="2" y="3" width="28" height="15" rx="4" fill="url(#vts-g)" />
      <path
        d="M8 7.5l3.5 3-3.5 3M14 13.5h6"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2" y="20" width="28" height="9" rx="3.5" fill="none" stroke="url(#vts-g)" strokeWidth="2" />
      <circle cx="8" cy="24.5" r="1.6" fill="var(--accent)" />
      <path d="M14 24.5h10" stroke="url(#vts-g)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
