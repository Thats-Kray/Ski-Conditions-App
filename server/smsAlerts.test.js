// server/smsAlerts.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeUsPhoneToE164,
  generateOtpCode,
  hashOtpCode,
  composeSmsBriefing,
  isStopKeyword,
} from "./smsAlerts.js"

test("normalizeUsPhoneToE164 formats a plain 10-digit number", () => {
  assert.equal(normalizeUsPhoneToE164("3035551234"), "+13035551234")
})

test("normalizeUsPhoneToE164 strips formatting characters", () => {
  assert.equal(normalizeUsPhoneToE164("(303) 555-1234"), "+13035551234")
})

test("normalizeUsPhoneToE164 accepts a number already prefixed with country code 1", () => {
  assert.equal(normalizeUsPhoneToE164("13035551234"), "+13035551234")
})

test("normalizeUsPhoneToE164 leaves an already-E.164 number unchanged", () => {
  assert.equal(normalizeUsPhoneToE164("+13035551234"), "+13035551234")
})

test("normalizeUsPhoneToE164 rejects a too-short number", () => {
  assert.equal(normalizeUsPhoneToE164("5551234"), null)
})

test("normalizeUsPhoneToE164 rejects empty input", () => {
  assert.equal(normalizeUsPhoneToE164(""), null)
  assert.equal(normalizeUsPhoneToE164(undefined), null)
})

test("generateOtpCode always returns a 6-digit numeric string", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateOtpCode()
    assert.equal(code.length, 6)
    assert.match(code, /^\d{6}$/)
  }
})

test("hashOtpCode is deterministic for the same code", () => {
  assert.equal(hashOtpCode("123456"), hashOtpCode("123456"))
})

test("hashOtpCode differs for different codes", () => {
  assert.notEqual(hashOtpCode("123456"), hashOtpCode("654321"))
})

test("composeSmsBriefing includes the resort name, score, and required opt-out line", () => {
  const text = composeSmsBriefing({
    bestBet: { name: "Vail", powderScore: 82.4, powderTier: "Elite" },
  })
  assert.ok(text.includes("Vail"))
  assert.ok(text.includes("82"))
  assert.ok(text.includes("Reply STOP to unsubscribe"))
})

test("composeSmsBriefing stays plain-ASCII (no emoji) to avoid forcing UCS-2 encoding", () => {
  // A single non-GSM-7 character (e.g. the snowflake emoji used elsewhere in
  // this app) forces the WHOLE message into UCS-2 encoding, which drops the
  // per-segment limit from 160 to 70 characters — silently multiplying the
  // billed segment count. This message must stay GSM-7-safe.
  const text = composeSmsBriefing({
    bestBet: { name: "Vail", powderScore: 82.4, powderTier: "Elite" },
  })
  assert.match(text, /^[\x00-\x7F]*$/)
})

test("composeSmsBriefing fits in one SMS segment", () => {
  const text = composeSmsBriefing({
    bestBet: { name: "Vail", powderScore: 82.4, powderTier: "Elite" },
  })
  assert.ok(text.length <= 160, `message is ${text.length} chars, expected <= 160`)
})

test("isStopKeyword matches the standard opt-out keywords case-insensitively", () => {
  for (const word of ["STOP", "stop", "Unsubscribe", "Cancel", "end", "QUIT"]) {
    assert.equal(isStopKeyword(word), true)
  }
})

test("isStopKeyword ignores surrounding whitespace", () => {
  assert.equal(isStopKeyword("  stop  "), true)
})

test("isStopKeyword rejects ordinary message text", () => {
  assert.equal(isStopKeyword("thanks!"), false)
  assert.equal(isStopKeyword(""), false)
  assert.equal(isStopKeyword(undefined), false)
})
