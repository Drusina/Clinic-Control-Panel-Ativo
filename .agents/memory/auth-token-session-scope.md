---
name: Auth token session scoping (login-first)
description: Why the CCP bearer token lives in sessionStorage, not localStorage, and what behaviors depend on it.
---

The privileged bearer token (`ccp_admin_token`, super_admin + team_member) is stored in **sessionStorage**, not localStorage. Centralized in `artifacts/ccp/src/hooks/use-auth.ts` (`getStoredToken/storeToken/clearToken`); every consumer goes through these helpers, so the storage backend is a single switch point.

**Why:** the operator wanted the site to behave like the email `/entrar` link — show login on every fresh visit and require credentials — instead of silently auto-resuming a session when typing the address or relaunching the installed PWA. localStorage persisted across browsing contexts and caused that auto-resume. sessionStorage keeps an in-tab refresh logged in (requirement) but is empty in a new tab/window or relaunched PWA, so those land on `/entrar`.

**How to apply:**
- Do NOT switch the token back to localStorage to "fix" reports that a new tab / relaunched PWA asks for login again — that is the intended design, not a bug.
- Inherent, accepted caveats: retyping the URL in an *already-logged-in* tab behaves like a refresh (keeps session — same browsing context, indistinguishable); browser "Duplicate tab" copies sessionStorage so the duplicate inherits the session.
- Unauthenticated guards and team_member "Sair" buttons redirect to `/entrar` (manager login, which links to super-admin login), NOT `/admin/login`. Keep `/admin/login` only for: the route definition, the `ProvisionalPasswordGate` allow-list, the super-admin link on `/entrar`, and the signing-key-rotation logout in `/admin/configuracoes`.
- `storeToken/clearToken` also purge the legacy localStorage copy, plus a one-time module-level purge on boot, so existing users' stale localStorage tokens cannot resurrect after deploy.
