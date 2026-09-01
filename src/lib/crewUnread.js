const LS_PREFIX = "pd_cr_"

export function getLastRead(crewId) {
  try { return localStorage.getItem(LS_PREFIX + crewId) || null } catch { return null }
}

export function markRead(crewId) {
  try { localStorage.setItem(LS_PREFIX + crewId, new Date().toISOString()) } catch { /* best-effort */ }
}

export function isCrewUnread(lastMessage, crewId) {
  if (!lastMessage) return false
  const lastRead = getLastRead(crewId)
  return !lastRead || new Date(lastMessage.created_at) > new Date(lastRead)
}
