// Outline nav icons — replace the emoji bottom/top nav icons with a consistent,
// premium stroke-based icon set. All use currentColor so the parent button's
// `color` (active/inactive state) drives the icon color automatically.
const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
}

export function HomeIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

export function SnowIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M12 3v18M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2" />
      <path d="M4.5 7.5 19.5 16.5M4.5 7.5l.5 2.7M4.5 7.5l2.7-.5M19.5 16.5l-.5-2.7M19.5 16.5l-2.7.5" />
      <path d="M19.5 7.5 4.5 16.5M19.5 7.5l-2.7-.5M19.5 7.5l-.5 2.7M4.5 16.5l.5 2.7M4.5 16.5l2.7.5" />
    </svg>
  )
}

export function PlansIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16h2M11 16h2" />
    </svg>
  )
}

export function SocialIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <circle cx="8.5" cy="9" r="2.75" />
      <path d="M3.5 19c.5-3 2.3-4.5 5-4.5s4.5 1.5 5 4.5" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M14.7 14.8c2.1.2 3.5 1.7 3.9 4.2" />
    </svg>
  )
}

export function ProfileIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.8 19.5c.8-3.6 3-5.4 7.2-5.4s6.4 1.8 7.2 5.4" />
    </svg>
  )
}

// Track tab (Task 7): a stopwatch. The tab is the GPS session + arrival
// check-in — "start my day and time it" — so a timer reads truer than a
// location pin, which would collide with Plans' calendar/place language.
export function TrackIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="M9.5 2.5h5" />
      <path d="M12 2.5V6" />
      <path d="m17.4 8.2 1.5-1.5" />
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V10" />
      <path d="M12 13.5h2.7" />
    </svg>
  )
}

export function MountainIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
      <path d="m3.5 18 6-10.5 3.6 5.8" />
      <path d="m10.5 18 5-8.5L20.5 18" />
      <path d="M3.5 18h17" />
    </svg>
  )
}
