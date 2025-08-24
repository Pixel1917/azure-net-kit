import { createBoundaryProvider } from '$lib/index.js';
import { DatasourceProvider } from './DatasourceProvider.js';
import { AuthRepository, ScriptRepository } from '../Http/Repositories/index.js';

export const InfrastructureProvider = createBoundaryProvider(
	'InfrastructureProvider',
	({ DatasourceProvider }) => ({
		AuthRepository: () => new AuthRepository(DatasourceProvider.AzureNetRestDatasource),
		ScriptRepository: () => new ScriptRepository(DatasourceProvider.AzureNetRestDatasource)
	}),
	{ dependsOn: { DatasourceProvider } }
);
