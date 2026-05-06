import { PrivateRepository, PublicRepository } from '../http/repositories/index.js';
import { createBoundaryProvider } from '$lib/index.js';
import { DatasourceProvider } from '../../../../../core/providers/index.js';

export const InfrastructureProvider = createBoundaryProvider('Shared-kernelInfrastructureProvider', {
	dependsOn: { DatasourceProvider },
	register: ({ DatasourceProvider }) => ({
		PrivateRepository: () => new PrivateRepository(DatasourceProvider.KosmoPartsRest),
		PublicRepository: () => new PublicRepository(DatasourceProvider.KosmoPartsRest)
	})
});
