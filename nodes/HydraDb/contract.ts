type JsonObject = Record<string, any>;

export function layout(value: unknown = 'split'): 'split' | 'unified' {
	if (value !== 'split' && value !== 'unified') throw new Error('Layout must be split or unified');
	return value;
}

function object(value: any, fields: string[] | null, name: string): void {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
	if (fields) {
		for (const key of Object.keys(value)) {
			if (!fields.includes(key)) throw new Error(`Unknown ${name} field: ${key}`);
		}
	}
}

function contextId(value: any): void {
	if (typeof value !== 'string' || new TextEncoder().encode(value).length > 100 || value.includes(',') || /^(att_|cmt_)/.test(value)) {
		throw new Error('context_id must be a string of at most 100 bytes without commas or reserved prefixes');
	}
}

export function unifiedBody(database: string, collection: string, context: any, text?: string, title?: string, defaultId?: string): JsonObject {
	if (!database.trim()) throw new Error('database is required');
	if (context === undefined || context === '') context = [{ text, title: title ?? 'note', ...(defaultId && { context_id: defaultId }) }];
	if (typeof context === 'string') context = JSON.parse(context);
	if (!Array.isArray(context) || context.length === 0 || context.length > 100) throw new Error('context must contain 1–100 items');
	let totalBytes = 0;
	for (const item of context) {
		object(item, ['text', 'conversation', 'context_id', 'title', 'user_name', 'attributes', 'custom_attributes', 'happened_at', 'enrich', 'instructions', 'upsert', 'forceful_relations', 'acl'], 'context item');
		for (const key of ['text', 'context_id', 'title', 'user_name', 'happened_at', 'instructions']) {
			if (item[key] != null && typeof item[key] !== 'string') throw new Error(`${key} must be a string`);
		}
		for (const key of ['enrich', 'upsert']) {
			if (item[key] != null && typeof item[key] !== 'boolean') throw new Error(`${key} must be a boolean`);
		}
		if (item.conversation != null && !Array.isArray(item.conversation)) throw new Error('conversation must be an array');
		const turns = item.conversation ?? [];
		const hasText = typeof item.text === 'string' && item.text.trim() !== '';
		if (hasText === (turns.length > 0)) throw new Error('Each context must have text XOR conversation');
		let hasSpeech = false;
		let system = '';
		let itemBytes = hasText ? new TextEncoder().encode(item.text).length : 0;
		for (const turn of turns) {
			object(turn, ['role', 'content'], 'conversation turn');
			if (!['user', 'assistant', 'system'].includes(turn.role) || typeof turn.content !== 'string' || !turn.content.trim()) throw new Error('Each turn needs role user|assistant|system and nonempty content');
			if (turn.role !== 'system') hasSpeech = true;
			else system += (system ? '\n' : '') + turn.content.trim();
			itemBytes += new TextEncoder().encode(turn.content).length;
		}
		if (turns.length && !hasSpeech) throw new Error('A conversation needs a user or assistant turn');
		if (itemBytes > 1048576 || (totalBytes += itemBytes) > 8388608) throw new Error('Context text exceeds the 1 MiB item or 8 MiB request limit');
		if (item.title != null && new TextEncoder().encode(item.title.trim()).length > 1024) throw new Error('title exceeds 1024 bytes');
		if (Array.from((item.instructions?.trim() || system)).length > 4000) throw new Error('instructions exceed 4000 characters');
		if (item.happened_at) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(item.happened_at) || !Number.isFinite(Date.parse(item.happened_at)) || new Date(item.happened_at).toISOString().slice(0, 10) !== item.happened_at) throw new Error('happened_at must be a valid YYYY-MM-DD date');
		}
		if (item.context_id != null) contextId(item.context_id);
		for (const key of ['attributes', 'custom_attributes']) {
			if (item[key] != null) object(item[key], null, key);
		}
		if (item.acl != null && (!Array.isArray(item.acl) || item.acl.some((p: any) => typeof p !== 'string'))) throw new Error('acl must be an array of strings');
		if (item.forceful_relations != null) {
			const relations = item.forceful_relations;
			object(relations, ['context_ids', 'properties'], 'forceful_relations');
			if (relations.context_ids != null && !Array.isArray(relations.context_ids)) throw new Error('forceful_relations.context_ids must be an array');
			for (const id of relations.context_ids ?? []) {
				if (typeof id !== 'string') throw new Error('related context_id must be a string');
				if (id.trim()) contextId(id.trim());
			}
			if (relations.properties != null) {
				object(relations.properties, null, 'forceful_relations.properties');
				for (const [key, value] of Object.entries(relations.properties)) {
					if (!key.trim() || ['id', 'created_at', 'relation_type', 'tenant_id', 'sub_tenant_id'].includes(key) || !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Relation properties must be nonreserved scalar fields');
				}
			}
		}
	}
	JSON.stringify(context, (_key, value) => {
		if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Context must contain finite JSON values');
		return value;
	});
	return { database, collection, context };
}

export function isUnified(data: JsonObject): boolean {
	return Array.isArray(data.graph) || Array.isArray(data.forceful_relations) ||
		(Array.isArray(data.chunks) && data.chunks.some((chunk: JsonObject) => Object.prototype.hasOwnProperty.call(chunk, 'chunk_id')));
}

export function roots(data: JsonObject): JsonObject {
	const result: JsonObject = {};
	for (const key of ['graph', 'forceful_relations', 'llm_prompt', 'tabular_data']) {
		if (data[key] !== undefined) result[key] = data[key];
	}
	return result;
}
