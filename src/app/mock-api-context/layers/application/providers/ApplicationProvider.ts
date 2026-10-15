import { PrivateService, PublicService } from '../services/index.js';
import { CreateDiContainer } from '#lib/index.js';
import { InfrastructureProvider } from '../../infrastructure/providers/index.js';

export const ApplicationProvider = CreateDiContainer('Shared-kernelApplicationProvider', {
	dependsOn: { InfrastructureProvider },
	register: ({ InfrastructureProvider }) => ({
		PrivateService: () => new PrivateService(InfrastructureProvider.PrivateRepository),
		PublicService: () => new PublicService(InfrastructureProvider.PublicRepository)
	})
});
