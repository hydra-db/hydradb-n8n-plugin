# Unified rollout preparation

**DO NOT MERGE — Unified API is not enabled in production; hold until production rollout is confirmed.**

This is an unpublished-contract preview, not a production API sync. Do not
publish, import, deploy, or enable it before rollout is confirmed. Existing
split operations and API-Version 2 remain the default. A failed write is never
retried with another layout.

## Contract provenance

The response fixture is handwritten from `flag-on.json` at application commit
`5d45c23840a62fcf38ff13e8deea5587ab1b961c`:
SHA-256 `34972cc67f1cc20b32371a4365f3fe69980f06e52c8559ad4e805e1c1d58feba`.
The same-source `flag-off.json` baseline has SHA-256
`418f71fbf02fd8e319b69ece7e143842ef2c45ff36b4a2deb1fa4d76e2171320`.

Query response schemas are `search.QueryResult` and `search.QueryChunk`.
The preview SDK JSON does **not** declare JSON context ingestion: its ingest
request exposes multipart only. The JSON write contract instead comes from
`application/internal/domain/memories/unified_ingest.go` and
`application/internal/api/handler/{context_ingest_route.go,type_rule_matrix_test.go,unified_defaults_test.go}`
at that commit. Response behavior is implemented in
`application/internal/domain/search/unified_response.go`.
No generated SDK or Nango models are checked in or modified here.
Published `@hydradb/sdk@2.1.8` has no typed unified declarations; this preview
uses raw transport rather than inventing an SDK version. Site publication is
independently blocked by the source's documentation lint failures.

## Unified writes

Unified ingestion sends JSON `{database, collection, context: [...]}`, never
split `type`/`kind`, `app_knowledge`, or `memories`. Each context has nonblank
`text` XOR a nonempty `conversation: [{role, content}]`; roles are `user`,
`assistant`, or `system`, with at least one user/assistant turn.

Optional context fields are `context_id`, `title`, `user_name`, `attributes`,
`custom_attributes`, `happened_at` (YYYY-MM-DD), `enrich`, `instructions`,
`upsert`, `forceful_relations: {context_ids, properties}`, and `acl`.
False, zero, empty strings and an explicitly empty ACL are not defaulted away.
Unknown item/turn/relation keys are rejected, including removed
`context_category` and split `metadata`/`additional_metadata`.
The executable adapters validate structure, identities and text budgets before
sending; the server remains authoritative for metadata policy, ACL principal
normalization and asynchronous acceptance. A 202 means queued, not indexed.

## Unified reads

Read shape is independent of the selected write layout. Unified `chunk_id`
becomes the host record's `id`, `content` becomes `text` verbatim, and
`context_id`, score, enrichment, receipt time, optional temporal facts and CSV
row ranges remain separate. JSON-looking content is literal, not a split
content envelope. Source title/metadata are not invented or fetched.
Root `graph[]`, `forceful_relations[]`, `llm_prompt` and `tabular_data` are
preserved. Pass `llm_prompt` verbatim to a downstream model; do not trim,
unwrap, reconstruct or concatenate it with chunk prose.

## n8n interface and verification

Select **Database Layout → Unified (Rollout Preview)** explicitly for unified
writes. Existing workflows without this field use split. Ingest accepts Text
and Title as a convenience, or **Unified Context** as a JSON array replacing
those fields. Convenience notes receive an n8n-prefixed context ID; supply an
explicit context_id in the array for controlled upserts. A context array is
rejected in split mode rather than silently ignored.

Query retains paired items. Unified chunk records have `record_type: "chunk"`;
meaningful chunkless responses produce a paired `record_type: "context"`
record carrying the whole data payload, with no invented `id` or `text`.
Completely empty unified responses produce no items. Split records are unchanged.

Run `npm install --ignore-scripts`, `npm test`, and `npm run lint`.
Tests mock n8n's authenticated HTTP helper; they do not run a host instance or
make HydraDB calls. No package version or publish workflow was changed.
