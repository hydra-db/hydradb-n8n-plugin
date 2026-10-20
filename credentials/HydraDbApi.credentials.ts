import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * HydraDB API credentials: an API key, the target database (tenant), and an
 * optional collection scope and base URL. The key is sent as a Bearer token.
 */
export class HydraDbApi implements ICredentialType {
	name = 'hydraDbApi';

	displayName = 'HydraDB API';

	documentationUrl = 'https://docs.hydradb.com/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: '',
			required: true,
			description: 'HydraDB database (tenant) to read and write',
		},
		{
			displayName: 'Collection',
			name: 'collection',
			type: 'string',
			default: '',
			description: 'Optional collection (sub-tenant) scope',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.hydradb.com',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/databases',
			method: 'GET',
		},
	};
}
