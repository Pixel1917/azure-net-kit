import { createBoundaryProvider } from '$lib/index.js';
import { InfrastructureProvider } from '../../Infrastructure/Providers/index.js';
import { AuthService, ScriptService } from '../Services/index.js';

export const ApplicationProvider = createBoundaryProvider('ApplicationProvider', {
	dependsOn: { InfrastructureProvider },
	register: ({ InfrastructureProvider }) => ({
		AuthService: () => new AuthService(InfrastructureProvider.AuthRepository),
		ScriptService: () => new ScriptService(InfrastructureProvider.ScriptRepository)
	})
});
