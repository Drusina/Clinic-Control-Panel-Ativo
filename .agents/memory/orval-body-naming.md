---
name: Orval generated body/param names
description: How @workspace/api-zod and api-client-react name request bodies/params — from operationId, not the OpenAPI schema $ref name.
---

Orval derives generated names for request bodies, params, and hooks from the path's
**operationId**, NOT from the schema component name you `$ref`.

So an OpenAPI `requestBody` that `$ref`s `#/components/schemas/CreateChecklistItemBody`
on an operation with `operationId: addChecklistItem` is exported from `@workspace/api-zod`
as `AddChecklistItemBody` (and the hook is `useAddChecklistItem`). Likewise
`LinkEvidenciaBody` schema under `operationId: linkActionEvidencia` becomes
`LinkActionEvidenciaBody`; a `CreateActionNotaBody` schema under `addActionNota` becomes
`AddActionNotaBody`.

**How to apply:** after `pnpm --filter @workspace/api-spec run codegen`, don't assume the
import name matches the schema name in `openapi.yaml`. Grep the generated
`lib/api-zod/src/generated/api.ts` / `lib/api-client-react/src/generated/api.ts` for the
`operationId`-based name before importing.
