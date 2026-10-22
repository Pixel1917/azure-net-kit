import { PrivateService, PublicService } from '../services/index.js';
import { CreateServiceContainer } from '#lib/index.js';
import { InfrastructureProvider } from '../../infrastructure/providers/index.js';

export const ApplicationProvider = CreateServiceContainer('Shared-kernelApplicationProvider', {
	dependsOn: { InfrastructureProvider },
	register: ({ InfrastructureProvider }) => ({
		PrivateService: () => new PrivateService(InfrastructureProvider.PrivateRepository),
		PublicService: () => new PublicService(InfrastructureProvider.PublicRepository)
	})
});
