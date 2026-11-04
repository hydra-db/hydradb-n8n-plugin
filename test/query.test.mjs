import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HydraDb } from '../dist/nodes/HydraDb/HydraDb.node.js';

const data = { llm_prompt: 'Use this context', chunks: [{ chunk_uuid: 'c1', chunk_content: 'hello', metadata: { source: 'note' }, additional_metadata: { row: 2 } }], tabular_data: { status: 'ok', records: [{ n: 1 }] } };
async function run(payload, count = 1) {
 let request; const params = { operation:'query', query:'q', kind:'knowledge', maxResults:6, includeTableSql:true, tableLimit:5 };
 const ctx = { getInputData: () => Array.from({length: count}, () => ({})), getCredentials: async () => ({database:'db'}), getNodeParameter: (k, i, fallback) => params[k] ?? fallback, helpers: {httpRequestWithAuthentication: async (auth, r) => { request = r; return payload; }} };
 const result = await new HydraDb().execute.call(ctx); return {request, records: result[0]};
}
test('query preserves live chunk metadata, prompt, table data and input pairing', async () => {
 const {request, records} = await run({data}, 2);
 assert.equal(request.body.include_table_sql, true); assert.equal(request.body.table_limit, 5);
 for (const [i, record] of records.entries()) {
  assert.equal(record.json.text, 'hello'); assert.equal(record.json.llm_prompt, data.llm_prompt);
  assert.deepEqual(record.json.metadata, data.chunks[0].metadata); assert.deepEqual(record.json.additional_metadata, data.chunks[0].additional_metadata);
  assert.deepEqual(record.json.tabular_data, data.tabular_data); assert.deepEqual(record.pairedItem, {item: i});
 }
});
test('prompt-only and table-only responses are available downstream with pairing', async () => {
 const prompt = await run({data: {chunks: [], llm_prompt: data.llm_prompt}});
 assert.equal(prompt.records[0].json.llm_prompt, data.llm_prompt); assert.deepEqual(prompt.records[0].pairedItem, {item: 0});
 const table = await run({data: {...data, chunks: []}});
 assert.deepEqual(table.records[0].json.tabular_data, data.tabular_data); assert.equal(table.records[0].json.text, '');
});
test('empty response preserves empty output', async () => { const {records} = await run({data: {chunks: []}}); assert.deepEqual(records, []); });
