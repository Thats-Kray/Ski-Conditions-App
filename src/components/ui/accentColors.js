const ACCENTS = ["#fb923c", "#38bdf8", "#2dd4bf"] // cycles per card

export function accentForIndex(i) {
  return ACCENTS[i % ACCENTS.length]
}
