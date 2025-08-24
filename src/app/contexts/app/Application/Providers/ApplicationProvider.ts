import { createBoundaryProvider } from '$lib/index.js';
import { InfrastructureProvider } from '../../Infrastructure/index.js';
import { AuthService, ScriptService } from '../Services/index.js';

export const ApplicationProvider = createBoundaryProvider(
	'ApplicationProvider',
	({ InfrastructureProvider }) => ({
		AuthService: () => new AuthService(InfrastructureProvider.AuthRepository),
		ScriptService: () => new ScriptService(InfrastructureProvider.ScriptRepository)
	}),
	{ dependsOn: { InfrastructureProvider } }
);
