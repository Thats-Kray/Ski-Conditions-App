export function scoreTier(score) {
  if (score == null) return "slate"
  if (score >= 88) return "mint"
  if (score >= 76) return "sky"
  if (score >= 63) return "gold"
  if (score >= 50) return "peach"
  return "coral"
}
