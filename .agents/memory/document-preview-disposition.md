---
name: Private document preview vs download disposition
description: Why private object serving defaults to attachment, and how inline preview is safely enabled
---

# Serving private documents: inline preview vs forced download

The private object serving route (signed `?sig=` token branch) defaults to
`Content-Type: application/octet-stream` + `Content-Disposition: attachment` +
`X-Content-Type-Options: nosniff`. That default forces a **download**, so a PDF
shown in an `<iframe>` (or opened via "Visualizar" in a new tab) downloads a
copy instead of rendering — the symptom users report as "clicking a document
downloads it."

**Rule:** inline rendering is opt-in and gated on a content-type allowlist.
- The signed-url generator appends `&disposition=inline` only when the
  document's type is preview-safe.
- The serving route honors `disposition=inline` **only when the upstream
  (stored GCS) content-type** is on the allowlist: `application/pdf` + raster
  images. It deliberately **excludes HTML and SVG** (and anything scriptable).
  Otherwise it falls back to attachment + octet-stream. `nosniff` always stays.
- The "Baixar" button still forces a save because it uses an anchor with the
  `download` attribute on these same-origin URLs, which overrides inline.

**Why:** serving attacker-uploaded HTML/SVG inline from the app origin would be
stored XSS (the threat model lists attachment+nosniff as a deliberate control).
The decision must be authoritative server-side from the *stored* content-type,
not from the client's query param or the DB `fileType` — a tampered
`disposition=inline` can only ever produce inline for already-safe types.

**How to apply:** if a legacy/imported PDF/image still downloads, its GCS
metadata content-type is wrong (e.g. octet-stream) — repair the object metadata,
do NOT widen the serving allowlist. The allowlist helper is
`isInlineSafeContentType()` in `artifacts/api-server/src/lib/objectStorage.ts`.
