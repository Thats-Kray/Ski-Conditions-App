const RADIUS = { sm: 16, md: 18, lg: 24, xl: 28 }

export default function Card({
  variant = "glass",   // "glass" | "solid"
  size = "md",         // "sm" | "md" | "lg" | "xl" — controls border-radius
  padding = 20,
  style,
  children,
  ...rest
}) {
  const base = {
    borderRadius: RADIUS[size] ?? RADIUS.md,
    padding,
    boxShadow: "var(--shadow-card)",
  }

  const variantStyle =
    variant === "solid"
      ? {
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
        }
      : {
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
        }

  return (
    <div style={{ ...base, ...variantStyle, ...style }} {...rest}>
      {children}
    </div>
  )
}
