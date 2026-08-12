# PRD: Ski Buddy Board
**Product:** Powdays
**Feature area:** Public matchmaking & carpool board
**Status:** Draft for Claude Code implementation
**Related but distinct from:** Mountain Board (Sprint 29 — geofenced, per-resort, GPS-verified posting; merged and live)

---

## 1. Problem Statement

Powdays already handles coordination *within* a user's existing network — friends, crew invites, daily plans. There's no way for a user to find people they *don't* already know: someone new to Denver with no ski friends yet, a solo rider who wants an Epic-pass crew for Saturday, or a driver with two empty seats headed to A-Basin who'd rather fill them than drive alone.

The Ski Buddy Board solves this: a public, searchable "looking for" board where any verified user can post what they're looking for (people, a ride, a group) and other users can respond.

## 2. Goals

- Let users post structured "looking for" listings tied to pass type, resort, date, riding style, and carpool need
- Let users browse/filter the board without needing to already know anyone
- Keep the barrier to *entry* (signing up, using private features) low
- Gate the *public-facing* social surface (posting, responding) behind identity verification, since this is stranger-to-stranger matchmaking
- Give the team a way to catch harmful content and bad-faith actors without over-relying on automated bans

## 3. Non-Goals (for this version)

- Real-time chat/messaging (responses are async, thread-based — not live chat)
- Full government ID verification (deferred to Tier 3, see Technical Spec)
- Automated permanent bans on report thresholds — all reports go to human review
- Ride-matching logistics (routing, payment, insurance) — this is a "find each other" board, not a ride-booking platform

## 4. User Stories

- *As a new Denver transplant with no ski friends on the app*, I want to post "looking for a beginner-friendly group at Keystone this weekend" so I can meet people.
- *As an Epic pass holder with 2 empty seats*, I want to offer a carpool to Vail on Saturday and find riders without texting my whole contact list.
- *As a park rider*, I want to filter the board to Ikon + park/terrain-park posts only, so I'm not wading through beginner-cruiser listings.
- *As any user*, I want confidence that the person I'm about to meet up with is a real, accountable person — not an anonymous throwaway account.
- *As Powdays' admin*, I want reported content or users flagged into a review queue, not auto-hidden or auto-banned, so I can make the call myself.

## 5. Feature Breakdown

### 5.1 Post structure
Each Ski Buddy post captures:
- **Pass type**: Ikon / Epic / Independent / Other (drives which resorts are selectable)
- **Resort** (from the shared `resort_coordinates` reference table — see tech debt note below)
- **Date** (single day; multi-day posts are a v2 consideration)
- **Riding style / who they're looking for**: e.g. beginner-cruiser, park/terrain, backcountry-curious, "anyone chill" — free-form tag(s) from a constrained list, not open text, to keep the board scannable
- **Group size wanted** (optional)
- **Carpool status**: Offering seats / Needing a seat / Not carpool-related
- **Carpool seat count** (if offering)
- **Short description** (moderated free text, see Section 7)

### 5.2 Browsing & filtering
- Filter by pass type, resort, date range, riding style, carpool status
- Sort by soonest date by default
- Posts auto-expire the day after the listed ski date (status → `expired`, hidden from default view but not deleted)

### 5.3 Responding
- A user responds to a post with a short message ("interested" + optional note)
- Post owner sees responses and can accept/decline, similar to the existing crew invite RSVP pattern
- No open public comment thread — keeps interactions 1:1 and easier to moderate

## 6. Trust Tiers (product-level summary — full detail in Technical Spec)

| Tier | Requirement | Unlocks |
|---|---|---|
| **0 — Base** | Email/password signup | Everything private: friends, crew invites, daily plans, browsing public boards |
| **1 — Verified** | OAuth (Google or Facebook) linked + phone number verified | Posting and responding on Ski Buddy Board and Mountain Board |
| **2 — Established** | Tier 1 + minimum accepted friends / completed plans on the app | More leeway before a report triggers review escalation |
| **3 — ID Verified** (future) | Third-party ID verification (e.g. Persona) | Optional "Verified" badge on profile |

**Key product decision:** verification is required to *act* on public boards, never to *use the app*. A friend-invited new user can use every private feature immediately with zero friction.

## 7. Safety & Moderation Requirements

- **Usernames**: checked against a profanity/slur filter at signup and on any username change, before the value is accepted. No bypass.
- **Post content**: run through automated content moderation before publishing. Flagged content is held (not silently deleted) pending review.
- **Reporting**: any user can report a post, a response, or a profile. A report never auto-removes content or auto-bans a user — it moves the target into a **pending review** state visible to admins.
- **Review, not auto-punish**: multiple reports raise priority/urgency in the review queue but do not trigger automatic bans. A human makes the call.
- **Tier 2 leeway**: established users (Tier 2) get more benefit of the doubt before their content is pulled pending review — reduces false-positive friction for genuine long-time users while still protecting the board.

## 8. Success Metrics (early-stage, directional)

- # of Ski Buddy posts created per week
- # of posts that result in at least one accepted response
- Report rate (reports / total posts) — used to gauge moderation load, not a growth KPI
- % of users who reach Tier 1 verification after their first attempt to post

## 9. Open Questions

- Should Mountain Board (Sprint 29) also require Tier 1 verification to post, for consistency? Currently scoped separately — flagged in the Roadmap doc as a follow-up decision, not changed here.
- Multi-day posts (e.g. "looking for a crew for the whole Presidents' Day weekend") — v2?
- Should carpool "offering seats" posts show approximate origin location (not exact address) to help with routing? Deferred — privacy tradeoff worth a dedicated conversation.
