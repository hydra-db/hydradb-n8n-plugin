const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HydraDb } = require('../dist/nodes/HydraDb/HydraDb.node');
const { HydraDbApi } = require('../dist/credentials/HydraDbApi.credentials');
const fixture = require('./unified-response.json');

async function run(params = {}, response = fixture, fail = false) {
  const requests = [];
  const values = { operation: 'query', query: 'q', kind: 'memory', maxResults: 0, text: 'note', title: 'title', ...params };
  const ctx = {
    getInputData: () => [{}, {}],
    getCredentials: async () => ({ database: 'db', collection: 'col' }),
    getNodeParameter: (key, i, fallback) => values[key] ?? fallback,
    helpers: { httpRequestWithAuthentication: async (auth, request) => {
      requests.push({ auth, ...request });
      if (fail) throw new Error('write rejected');
      return structuredClone(response);
    } },
  };
  try { return { rows: (await new HydraDb().execute.call(ctx))[0], requests }; }
  catch (error) { error.requests = requests; throw error; }
}

test('unified reads preserve literal content, identity, roots and pairing even in split mode', async () => {
  const { rows, requests } = await run();
  assert.equal(rows.length, 2);
  for (const [i, row] of rows.entries()) {
    assert.equal(row.json.text, fixture.data.chunks[0].content);
    assert.equal(row.json.id, 'c1');
    assert.equal(row.json.context_id, 'ctx1');
    assert.equal(row.json.score, 0);
    assert.equal(row.json.record_type, 'chunk');
    for (const key of ['enrichment', 'received_at', 'temporal', 'chunk_metadata']) assert.deepEqual(row.json[key], fixture.data.chunks[0][key]);
    for (const key of ['graph', 'forceful_relations', 'llm_prompt', 'tabular_data']) assert.deepEqual(row.json[key], fixture.data[key]);
    assert.deepEqual(row.pairedItem, { item: i });
  }
  assert.equal(requests[0].body.type, 'memory');
  assert.equal(requests[0].body.max_results, 0);
});

test('explicit unified layout omits selectors and emits discriminated chunkless context', async () => {
  const data = { ...fixture.data, chunks: [] };
  const { rows, requests } = await run({ layout: 'unified' }, { data });
  assert.equal(Object.hasOwn(requests[0].body, 'type'), false);
  assert.equal(Object.hasOwn(requests[0].body, 'kind'), false);
  assert.deepEqual(rows[0].json, { record_type: 'context', ...data });
  assert.equal(Object.hasOwn(rows[0].json, 'id'), false);
  assert.equal(Object.hasOwn(rows[0].json, 'text'), false);
  const empty = await run({}, { data: { chunks: [], graph: [], forceful_relations: [], llm_prompt: '', tabular_data: null } });
  assert.deepEqual(empty.rows, []);
});

test('unified ingest sends only canonical JSON and preserves explicit false values', async () => {
  const context = [{ conversation: [{ role: 'user', content: 'hello' }], context_id: 'ctx', title: 'title', user_name: 'Ada', attributes: { n: 0 }, custom_attributes: { flag: false }, happened_at: '2026-10-01', enrich: false, instructions: '', upsert: false, forceful_relations: { context_ids: ['other'], properties: { weight: 0 } }, acl: [] }];
  const { requests, rows } = await run({ operation: 'ingest', layout: 'unified', context: JSON.stringify(context) }, { success: true });
  assert.deepEqual(requests[0].body, { database: 'db', collection: 'col', context });
  assert.equal(requests[0].json, true);
  assert.equal(requests[0].auth, 'hydraDbApi');
  assert.deepEqual(rows[0].json, { success: true });
});

test('split requests and split chunk prose stay unchanged', async () => {
  const { rows } = await run({}, { data: { chunks: [{ chunk_uuid: 'old', chunk_content: '{"content":{"text":"split prose"}}', metadata: { a: 1 } }] } });
  assert.deepEqual(rows[0].json, { chunk_uuid: 'old', chunk_content: '{"content":{"text":"split prose"}}', metadata: { a: 1 }, text: 'split prose' });
  const { requests } = await run({ operation: 'ingest' });
  assert.equal(requests[0].body.get('type'), 'knowledge');
  assert.equal(requests[0].body.has('context'), false);
  assert.equal(JSON.parse(requests[0].body.get('app_knowledge'))[0].content.text, 'note');
});

test('auth retains explicit v2 and bearer configuration', () => {
  assert.deepEqual(new HydraDbApi().authenticate.properties.headers, { Authorization: '=Bearer {{$credentials.apiKey}}', 'API-Version': '2' });
});

test('invalid layout or context is rejected before requests; rejected write is never retried', async () => {
  for (const context of ['[]', '[{"text":"x","metadata":{}}]', '[{"text":"x","conversation":[{"role":"user","content":"y"}]}]', '[{"conversation":[{"role":"user","content":"x","name":"bad"}]}]']) {
    await assert.rejects(run({ operation: 'ingest', layout: 'unified', context }), e => e.requests.length === 0);
  }
  await assert.rejects(run({ operation: 'ingest', layout: 'auto' }), e => e.requests.length === 0);
  await assert.rejects(run({ operation: 'ingest', layout: 'unified' }, {}, true), e => e.requests.length === 1);
  await assert.rejects(run({ operation: 'ingest' }, {}, true), e => e.requests.length === 1);
  await assert.rejects(run({ operation: 'ingest', context: '[{"text":"x"}]' }), e => e.requests.length === 0);
  await assert.rejects(run({ operation: 'ingest', text: '' }), e => e.requests.length === 0);
});
