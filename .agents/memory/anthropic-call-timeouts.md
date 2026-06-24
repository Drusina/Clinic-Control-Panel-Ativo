---
name: Anthropic call timeouts
description: Why large single Anthropic calls time out and the per-unit streaming + global-deadline pattern that fixes it.
---

# Anthropic large-call timeouts

A single non-streaming `client.messages.create` (claude-opus-4-5, max_tokens 4096) that produces a large multi-section JSON (e.g. risks across all 8 diagnostic pillars at once) exceeds the Anthropic SDK's default ~45s request timeout. The SDK then retries 2x by default, so the user waits ~137s before an `APIConnectionTimeoutError` surfaces as a 502 ("Request timed out").

**Why:** the failure is output-size driven, not a network blip. Confirmed from production deployment logs (responseTime ≈136–137s on the risk-map generation route).

**How to apply (pattern now used in `artifacts/api-server/src/lib/risk-generator.ts`):**
- Split the work into the smallest natural units (per pillar) so each call's output is small.
- Use `client.messages.stream(body, opts).finalText()` instead of `.create` — streaming keeps the connection alive so the SDK doesn't abort mid-generation; `finalText()` is robust to multi-block responses.
- Run units with bounded concurrency (worker pool over the unit list), and tolerate partial failure: return the successful units' results; only throw when ALL units failed (so the route returns a friendly empty message vs a 502 retry prompt correctly).
- Cap total wall-clock with ONE shared `AbortController`: `setTimeout(() => ac.abort(), deadlineMs)` and pass `{ signal: ac.signal }` to every stream call, so a degraded provider can't push total latency past the deadline.
- Keep the deadline under the deploy proxy's tolerance (the old call reached ~137s and the app itself emitted the 502, so the proxy tolerates ≥137s; we cap at 100s).

Other Anthropic call sites (diagnostic AI insights generator, document `suggest-title`, `tarefa-suggester`) share this class of risk if their outputs grow — apply the same pattern when they do.
