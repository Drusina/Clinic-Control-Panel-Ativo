---
name: Constitutive documents — multiple storage surfaces
description: Constitutive/society documents for a clinic live across 3 disjoint stores; any "does this clinic have constitutive docs?" check must union all three.
---

# Constitutive documents have THREE disjoint storage surfaces

A clinic can put a constitutive/society document "on file" through three
independent features that write to three different places. Any aggregation that
answers "does this clinic have constitutive documents?" must union ALL three —
checking only one silently undercounts.

1. **Legacy single-file slot** — the parent `docs_constitutivos` row carries the
   file directly in `storage_path` (and `tamanho`/`enviado_em`).
2. **Multi-file slot** — newer uploads leave the parent `docs_constitutivos.storage_path`
   NULL and store each file as a child `docs_constitutivos_files` row. So a slot
   can be "filled" with a NULL parent path.
3. **"Documentos Societários (com análise por IA)"** — writes to
   `clinic_documents` + `societary_extractions` (category "Contratos e Aditivos"),
   and NEVER touches `docs_constitutivos` at all. `societary_extractions` rows are
   persisted even when the AI extraction failed (`status='error'`), because the
   document itself was still uploaded.

**Why:** the Trilha "Documentos Constitutivos" auto-stage stayed "Pendente" for
clinics that had uploaded + AI-analyzed documents, because its signal counted
only surface 1 (`docs_constitutivos` rows WHERE `storage_path IS NOT NULL`). It
missed surfaces 2 and 3 entirely. Root-causing this took DB inspection across
all three tables — it is not obvious from any single feature's code.

**How to apply:**
- To count "constitutive docs on file": count `docs_constitutivos` rows where
  `storage_path IS NOT NULL` OR an `EXISTS` child in `docs_constitutivos_files`,
  PLUS `societary_extractions` rows for the clinic. The tables are disjoint, so
  no row is double-counted (a clinic using two features just shows a higher
  total).
- For "document is on file" semantics, count `societary_extractions` regardless
  of `status` (an `error` row still means a document was uploaded). Filter to
  `status='ready'` only if the requirement is specifically "AI analyzed
  successfully".
- The consumer that got bitten is the Trilha signal in
  `artifacts/api-server/src/lib/trilha.ts` (`countConstitutiveDocs`).
