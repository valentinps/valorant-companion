// Small line icons for the navigation rail. 20x20, stroke = currentColor.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

export const ProfileIcon = () => (
  <svg {...base}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.5 17c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" />
  </svg>
)

export const PartyIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7.5" r="2.6" />
    <circle cx="14" cy="8.5" r="2.1" />
    <path d="M2.5 16.5c.8-2.6 2.4-3.8 4.5-3.8s3.7 1.2 4.5 3.8M12 12.9c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.6 3" />
  </svg>
)

export const AgentIcon = () => (
  <svg {...base}>
    <path d="M10 2.5 16.5 6v5c0 3.4-2.7 5.8-6.5 6.5-3.8-.7-6.5-3.1-6.5-6.5V6z" />
    <path d="m7.2 10 2 2 3.8-4" />
  </svg>
)

export const LiveIcon = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="2.2" />
    <path d="M5.8 5.8a6 6 0 0 0 0 8.4M14.2 5.8a6 6 0 0 1 0 8.4M3.3 3.3a9.5 9.5 0 0 0 0 13.4M16.7 3.3a9.5 9.5 0 0 1 0 13.4" />
  </svg>
)

export const FriendsIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="7" r="3" />
    <path d="M2.5 16.5c.9-2.8 2.9-4.2 5.5-4.2 1.5 0 2.8.5 3.8 1.4" />
    <path d="M15 11v6M12 14h6" />
  </svg>
)

export const StoreIcon = () => (
  <svg {...base}>
    <path d="M3.5 7.5h13l-1 9h-11z" />
    <path d="M7 7.5V6a3 3 0 0 1 6 0v1.5" />
  </svg>
)

export const BookmarkIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}>
    <path d="M5.5 3.5h9v13.2L10 13.4l-4.5 3.3z" />
  </svg>
)

export const PhoneIcon = () => (
  <svg {...base}>
    <rect x="5.5" y="2.5" width="9" height="15" rx="1.8" />
    <path d="M8.8 14.8h2.4" />
  </svg>
)
