---
name: Responder flow session isolation
description: Why the public /responder flow must sever any privileged session in the same browser, and the BFCache guard that backs it.
---

# Public respondent flow must sever privileged sessions

The public per-pilar respondent flow (`/responder*`) issues a restricted
`diagnostic_respondent` token (sessionStorage, separate key from the admin
`ccp_admin_token` in localStorage) and renders with no AppLayout/auth gate. The
backend correctly rejects this token at `requireSuperAdmin` / session middleware
— there is **no** backend privilege escalation.

The real exposure is **same-tab / BFCache**: if a respondent link is opened in a
browser that already holds a live super_admin/team_member session, that session
stays valid, so back-navigation or a back-forward-cache restore can surface the
full privileged UI even though the link granted nothing.

**Rule:** entering the public `/responder` entry must tear down any privileged
session in that browser (clear admin token + active clinic), and the app must
force a reload on BFCache `pageshow` (`event.persisted`) restores so guards and
`/auth/me` re-evaluate from scratch.

**Why:** matches a confirmed `threat_model.md` finding ("same-tab invite
redemption can expose previously rendered super-admin screens via history /
BFCache"). Reported by a user as "the sub-delegation email gives full super-admin
access" — it was UI disclosure of a pre-existing session, not a token defect.

**How to apply:** any new public, scoped invite/redeem surface that shares the
SPA shell with the admin/portal app should do the same teardown + rely on the
global BFCache reload guard in `App()`. Do not assume separate token storage is
enough — the privileged session in localStorage outlives the public visit.
