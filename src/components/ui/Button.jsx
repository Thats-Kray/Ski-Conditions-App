const VARIANTS = {
  primary: {
    background: "var(--gradient-primary)",
    color: "var(--color-bg)",
    border: "none",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--color-text-1)",
    border: "1px solid var(--color-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-accent)",
    border: "none",
  },
  danger: {
    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
    color: "#fff",
    border: "none",
  },
}

export default function Button({
  variant = "primary",
  size = "md",          // "sm" | "md"
  loading = false,
  loadingText,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const isDisabled = disabled || loading
  const variantStyle = VARIANTS[variant] ?? VARIANTS.primary

  return (
    <button
      disabled={isDisabled}
      style={{
        ...variantStyle,
        borderRadius: "var(--radius-button)",
        padding: size === "sm" ? "8px 16px" : "12px 22px",
        fontWeight: 800,
        fontSize: size === "sm" ? 13 : 15,
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        transition: "all var(--transition-fast)",
        ...style,
      }}
      {...rest}
    >
      {loading ? (loadingText ?? "Loading…") : children}
    </button>
  )
}
