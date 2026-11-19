import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from 'n8n-workflow';
import { isUnified, layout, roots, unifiedBody } from './contract';

/**
 * Extract the prose from a HydraDB content envelope.
 * @param obj - A parsed envelope object.
 * @returns The text/markdown prose, or null if none is present.
 */
function proseFromEnvelope(obj: IDataObject): string | null {
	const content = obj.content;
	if (content && typeof content === 'object') {
		for (const key of ['text', 'markdown']) {
			const val = (content as IDataObject)[key];
			if (typeof val === 'string' && val.trim()) return val;
		}
	}
	if (typeof content === 'string' && content.trim()) return content;
	if (typeof obj.text === 'string' && obj.text.trim()) return obj.text;
	return null;
}

/**
 * Unwrap a recall chunk to its prose, keeping any trailing graph enrichment.
 * @param value - The raw chunk content, possibly an envelope JSON with trailing text.
 * @returns The prose, or the input unchanged when it is not an envelope.
 */
function extractText(value: unknown): string {
	if (typeof value !== 'string') return value == null ? '' : String(value);
	const stripped = value.trim();
	if (!stripped.startsWith('{')) return value;
	let depth = 0;
	let inStr = false;
	let escaped = false;
	let end = -1;
	for (let i = 0; i < stripped.length; i++) {
		const ch = stripped[i];
		if (inStr) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inStr = false;
			continue;
		}
		if (ch === '"') inStr = true;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) {
			end = i + 1;
			break;
		}
	}
	if (end === -1) return value;
	try {
		const obj = JSON.parse(stripped.slice(0, end)) as IDataObject;
		const prose = proseFromEnvelope(obj);
		if (prose === null) return value;
		const trailing = stripped.slice(end).trim();
		return trailing ? `${prose}\n\n${trailing}` : prose;
	} catch {
		return value;
	}
}

/** HydraDB node: ingest knowledge and recall context over the public API. */
export class HydraDb implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HydraDB',
		name: 'hydraDb',
		icon: { light: 'file:hydradb.svg', dark: 'file:hydradb.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Ingest knowledge into HydraDB and recall context',
		defaults: { name: 'HydraDB' },
		usableAsTool: true,
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [{ name: 'hydraDbApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'query',
				options: [
					{ name: 'Query', value: 'query', action: 'Recall context for a query' },
					{ name: 'Ingest', value: 'ingest', action: 'Ingest a note as knowledge' },
				],
			},
			{
				displayName: 'Database Layout',
				name: 'layout',
				type: 'options',
				default: 'split',
				options: [{ name: 'Split', value: 'split' }, { name: 'Unified (Rollout Preview)', value: 'unified' }],
				description: 'Explicitly choose the database layout. Unified is not enabled in production.',
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['query'] } },
				description: 'Text to recall context for',
			},
			{
				displayName: 'Kind',
				name: 'kind',
				type: 'options',
				default: 'knowledge',
				displayOptions: { show: { operation: ['query'], layout: ['split'] } },
				options: [
					{ name: 'Knowledge', value: 'knowledge' },
					{ name: 'Memory', value: 'memory' },
				],
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				default: 6,
				displayOptions: { show: { operation: ['query'] } },
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: false,
				displayOptions: { show: { operation: ['ingest'] } },
				description: 'Note text to store as knowledge',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: 'note',
				displayOptions: { show: { operation: ['ingest'] } },
			},
			{
				displayName: 'Unified Context',
				name: 'context',
				type: 'json',
				default: '',
				displayOptions: { show: { operation: ['ingest'], layout: ['unified'] } },
				description: 'Optional context array. When supplied, replaces Text and Title. Each item needs text XOR conversation.',
			},
		],
	};

	/**
	 * Run the node for each input item.
	 * @returns One output branch of items: recalled chunks for Query, the ingest ack for Ingest.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('hydraDbApi');
		const baseUrl = String(credentials.baseUrl || 'https://api.hydradb.com').replace(/\/$/, '');
		const database = String(credentials.database || '');
		const collection = String(credentials.collection || '');
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			const selectedLayout = layout(this.getNodeParameter('layout', i, 'split'));

			if (operation === 'query') {
				const body: IDataObject = {
					database,
					collection,
					query: this.getNodeParameter('query', i) as string,
					...(selectedLayout === 'split' && { type: this.getNodeParameter('kind', i) as string }),
					mode: 'fast',
					max_results: this.getNodeParameter('maxResults', i) as number,
					graph_context: true,
				};
				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'hydraDbApi',
					{ method: 'POST', url: `${baseUrl}/query`, body, json: true },
				)) as IDataObject;
				const data = (response.data as IDataObject) || {};
				const chunks = (data.chunks as IDataObject[]) || [];
				const unified = isUnified(data);
				if (unified && !chunks.length && (data.llm_prompt || (data.graph as unknown[])?.length || (data.forceful_relations as unknown[])?.length || data.tabular_data)) {
					out.push({ json: { ...data, record_type: 'context' }, pairedItem: { item: i } });
				}
				for (const chunk of chunks) {
					out.push({
						json: unified
							? { ...chunk, id: chunk.chunk_id, text: chunk.content, ...roots(data), record_type: 'chunk' }
							: { ...chunk, text: extractText(chunk.chunk_content ?? chunk.text) },
						pairedItem: { item: i },
					});
				}
			} else if (selectedLayout === 'unified') {
				const body = unifiedBody(
					database, collection, this.getNodeParameter('context', i, ''),
					this.getNodeParameter('text', i, '') as string,
					this.getNodeParameter('title', i, 'note') as string, `n8n-${Date.now()}-${i}`,
				);
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this, 'hydraDbApi', { method: 'POST', url: `${baseUrl}/context/ingest`, body, json: true },
				);
				out.push({ json: response as IDataObject, pairedItem: { item: i } });
			} else {
				if (this.getNodeParameter('context', i, '') !== '') throw new Error('context requires unified layout');
				const text = this.getNodeParameter('text', i, '') as string;
				if (!text.trim()) throw new Error('text is required for split ingestion');
				const item = {
					id: `n8n-${Date.now()}-${i}`,
					title: this.getNodeParameter('title', i) as string,
					content: { text },
					infer: true,
				};
				const form = new FormData();
				form.append('tenant_id', database);
				form.append('sub_tenant_id', collection);
				form.append('type', 'knowledge');
				form.append('app_knowledge', JSON.stringify([item]));
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'hydraDbApi',
					{ method: 'POST', url: `${baseUrl}/context/ingest`, body: form },
				);
				out.push({ json: response as IDataObject, pairedItem: { item: i } });
			}
		}

		return [out];
	}
}
