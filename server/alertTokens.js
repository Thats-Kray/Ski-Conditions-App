import jwt from "jsonwebtoken"

export function signAlertToken(userId, action) {
  return jwt.sign({ userId, action }, process.env.JWT_SECRET, { expiresIn: "90d" })
}

export function verifyAlertToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET) // throws on invalid/expired — caller must catch
}
