---
name: Brand gold usage & SVG mark ids
description: Navy+gold re-skin rules — where gold may appear, which gold token for text vs decoration, and why reusable SVG marks need useId.
---

# Brand gold usage & SVG mark ids (artifacts/ccp)

- **Gold is for the IONEX360 logo/wordmark and the Trilha progress bar only.** Status
  stays green/amber/red (tokens `--success`/`--warning`/`--destructive`); never recolor
  status with gold.
- **Two gold tokens, different jobs:** textual gold (e.g. the "360" in the wordmark) uses
  `--brand-gold-strong` (#9F7C29) so it clears WCAG AA on light surfaces; the lighter
  `--brand-gold` (#C49A3D) is for decorative SVG fills/gradients only.
  **Why:** #C49A3D on white is ~2.6:1 (fails AA). Logos are contrast-exempt, but we keep
  the text legible anyway (architect flagged it during the navy+gold re-skin).
- **Reusable inline-SVG marks must generate gradient/filter ids with `useId()`.** The
  portal header renders a mobile `BrandMark` and a desktop `Brand` (which contains a mark)
  in the DOM at the same time, toggled via `sm:hidden` / `hidden sm:inline-flex`.
  **Why:** a hardcoded gradient id collides across the two SVGs, and a `display:none`
  SVG's gradient can fail to paint the visible one — the desktop logo renders unfilled.
  **How to apply:** any new SVG mark/icon component in `artifacts/ccp` that defines a
  `<linearGradient>`/`<filter>` and may render more than once per page.
