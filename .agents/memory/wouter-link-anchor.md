---
name: wouter Link renders its own anchor
description: ccp uses wouter 3.x where <Link href> renders an <a> and nests children inside — avoid wrapping another <a>.
---

In `artifacts/ccp` (wouter 3.x), `<Link href>` renders its OWN `<a>` element
and places children INSIDE it. It does NOT clone the child to inject href
(no `asChild` by default).

Consequences:
- `<Link href><a className=...>card</a></Link>` produces nested `<a><a>` —
  invalid DOM, React hydration warning. For a fully-clickable styled card,
  pass `className`/`data-testid` directly to `<Link>` and put the content as
  children (a single anchor).
- `<Link href><Button>` renders `<a><button>` (interactive-in-anchor). This
  is the established codebase convention and works for navigation, so match
  it rather than "fixing" only some call sites; use `asChild` only if you
  deliberately want a single non-anchor element.

**Why:** building the Painel da Clínica module-card hub, wrapping `<a>` inside
`<Link>` produced nested anchors caught in review. Tests that assert
`getByText(x).closest("a").getAttribute("href")` only pass because Link is the
anchor — confirming this behavior.

**How to apply:** when making a whole element clickable in ccp, style the
`<Link>` itself; never nest an `<a>` inside it.
