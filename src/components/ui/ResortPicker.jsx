import { useState } from "react"

const RESORT_NAMES = [
  "Vail", "Beaver Creek", "Breckenridge", "Keystone", "Park City",
  "Heavenly", "Northstar", "Kirkwood", "Stowe", "Whistler Blackcomb",
  "Telluride", "Arapahoe Basin", "Winter Park", "Steamboat", "Copper Mountain",
  "Crested Butte", "Eldora", "Aspen Snowmass", "Snowbird", "Alta",
  "Park City Mountain", "Mammoth Mountain", "Big Sky", "Jackson Hole",
  "Taos", "Sun Valley", "Squaw Valley", "Lake Tahoe", "Palisades Tahoe",
  "Loveland", "Monarch", "Wolf Creek", "Sunlight", "Powderhorn",
]

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

export default function ResortPicker({ value, onChange, placeholder = "Search resort..." }) {
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)

  const filtered = search.length > 0
    ? RESORT_NAMES.filter((r) => r.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : []

  return (
    <div style={{ position: "relative" }}>
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={value || search}
        onChange={(e) => { setSearch(e.target.value); onChange(""); setShowDropdown(true) }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
      />
      {showDropdown && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, zIndex: 10, overflow: "hidden", marginTop: 4 }}>
          {filtered.map((r) => (
            <div
              key={r}
              onMouseDown={() => { onChange(r); setSearch(r); setShowDropdown(false) }}
              style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, color: "white", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
