import leoProfanity from "leo-profanity"

export function isUsernameProfane(username) {
  if (!username) return false
  return leoProfanity.check(username)
}
