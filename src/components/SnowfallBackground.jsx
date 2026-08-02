// Deterministic snowflake config — no randomness so it's stable across renders
const FLAKES = [
  { left: "4%",  size: 3, opacity: 0.35, duration: "12s", delay: "0s"   },
  { left: "9%",  size: 5, opacity: 0.2,  duration: "16s", delay: "-4s"  },
  { left: "16%", size: 3, opacity: 0.45, duration: "10s", delay: "-8s"  },
  { left: "22%", size: 4, opacity: 0.25, duration: "14s", delay: "-2s"  },
  { left: "29%", size: 2, opacity: 0.3,  duration: "18s", delay: "-11s" },
  { left: "35%", size: 6, opacity: 0.18, duration: "13s", delay: "-5s"  },
  { left: "41%", size: 3, opacity: 0.4,  duration: "11s", delay: "-9s"  },
  { left: "48%", size: 4, opacity: 0.22, duration: "15s", delay: "-1s"  },
  { left: "54%", size: 2, opacity: 0.38, duration: "9s",  delay: "-7s"  },
  { left: "61%", size: 5, opacity: 0.2,  duration: "17s", delay: "-13s" },
  { left: "67%", size: 3, opacity: 0.42, duration: "12s", delay: "-3s"  },
  { left: "73%", size: 4, opacity: 0.28, duration: "14s", delay: "-6s"  },
  { left: "79%", size: 2, opacity: 0.35, duration: "10s", delay: "-10s" },
  { left: "85%", size: 5, opacity: 0.18, duration: "16s", delay: "-14s" },
  { left: "91%", size: 3, opacity: 0.4,  duration: "11s", delay: "-2s"  },
  { left: "97%", size: 4, opacity: 0.25, duration: "13s", delay: "-8s"  },
]

export default function SnowfallBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {FLAKES.map((f, i) => (
        <div
          key={i}
          className="snowflake"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animationDuration: f.duration,
            animationDelay: f.delay,
          }}
        />
      ))}
    </div>
  )
}
