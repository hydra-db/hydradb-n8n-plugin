const { test } = require('node:test');
const assert = require('node:assert/strict');
const { unifiedBody } = require('../dist/nodes/HydraDb/contract');

test('canonical context validation accepts both bodies and preserves nullable/false fields', () => {
  const context = [{ text: 'literal', context_id: 'ctx', title: 't', user_name: 'Ada', enrich: false, upsert: false, attributes: { count: 0 }, custom_attributes: { ok: false }, happened_at: '2026-10-01', instructions: '', forceful_relations: { context_ids: ['other'], properties: { weight: 0, flag: false } }, acl: [] }, { text: ' ', conversation: [{ role: 'system', content: 'context' }, { role: 'assistant', content: 'speech' }] }];
  assert.deepEqual(unifiedBody('db', 'col', context), { database: 'db', collection: 'col', context });
  assert.deepEqual(unifiedBody('db', '', undefined, 'note', 'title', 'note-1').context, [{ text: 'note', title: 'title', context_id: 'note-1' }]);
});

test('context validation rejects unknown nested fields, body conflicts and invalid scalar shapes', () => {
  for (const key of ['kind', 'type', 'content', 'items', 'metadata', 'additional_metadata', 'context_category', 'trace']) {
    assert.throws(() => unifiedBody('db', '', [{ text: 'x', [key]: {} }]), /Unknown/);
  }
  for (const item of [
    {}, { text: ' ' }, { text: 'x', conversation: [{ role: 'user', content: 'y' }] },
    { conversation: [{ role: 'system', content: 'instructions only' }] },
    { conversation: [{ role: 'user', content: ' ' }] },
    { conversation: [{ role: 'user', content: 'x', name: 'bad' }] },
    { conversation: [{ role: 'tool', content: 'x' }] },
    { text: 'x', enrich: 0 }, { text: 'x', upsert: 'false' },
    { text: 'x', attributes: [] }, { text: 'x', custom_attributes: 'bad' },
    { text: 'x', acl: [0] }, { text: 'x', happened_at: '2026-02-30' },
    { text: 'x', happened_at: '2026-10-01T00:00:00Z' },
    { text: 'x', context_id: 'att_reserved' }, { text: 'x', context_id: 'a,b' },
    { text: 'x', context_id: '😀'.repeat(26) },
    { text: 'x', forceful_relations: { context_ids: ['ok'], relations: [] } },
    { text: 'x', forceful_relations: { context_ids: [0] } },
    { text: 'x', forceful_relations: { properties: { nested: {} } } },
    { text: 'x', forceful_relations: { properties: { id: 'reserved' } } },
    { text: 'x', attributes: { invalid: Infinity } },
  ]) assert.throws(() => unifiedBody('db', '', [item]), JSON.stringify(item));
  for (const context of [null, {}, [], Array.from({ length: 101 }, () => ({ text: 'x' }))]) assert.throws(() => unifiedBody('db', '', context));
  assert.throws(() => unifiedBody('', '', [{ text: 'x' }]));
});

test('UTF-8 item/title limits and aggregate instruction/text budgets are enforced', () => {
  for (const item of [{ text: '😀'.repeat(262145) }, { text: 'x', title: '😀'.repeat(257) }, { text: 'x', instructions: 'x'.repeat(4001) }, { conversation: [{ role: 'system', content: 'x'.repeat(4001) }, { role: 'user', content: 'speech' }] }]) {
    assert.throws(() => unifiedBody('db', '', [item]));
  }
  assert.throws(() => unifiedBody('db', '', Array.from({ length: 9 }, () => ({ text: 'x'.repeat(1048576) }))));
  assert.equal(unifiedBody('db', '', [{ text: 'x', title: '😀'.repeat(256), instructions: '😀'.repeat(4000) }]).context.length, 1);
});
