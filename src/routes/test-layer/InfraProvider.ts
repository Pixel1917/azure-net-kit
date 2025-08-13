import { createBoundaryProvider } from '$lib/core/shared/boundaryProvider/index.js';
import { HttpService } from '$lib/core/infra/httpService/index.js';
import { browser } from '$app/environment';
import { RequestContext } from 'edges-svelte/context';
import { Cookies } from 'azure-net-tools';
import { AzureNetRestDatasource } from './AzureDataSource.js';
import { AuthRepository } from './AuthRepository.js';
import { AuthService } from './AuthService.js';

export const InfrastructureProvider = createBoundaryProvider('InfrastructureProvider', () => ({
	azureNetDatasource: () => {
		return new AzureNetRestDatasource({
			http: new HttpService({
				baseUrl: `https://api-laravel.azure-net.ru/back`,
				requestHandler: (options) => {
					const token = !browser ? RequestContext.current()?.event?.cookies?.get('token') : Cookies.get('token');
					if (token) {
						options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
					}
				}
			})
		});
	}
}));

export const RepositoryProvider = createBoundaryProvider(
	'RepositoryProvider',
	(deps) => ({
		authRepository: () => {
			return new AuthRepository(deps.InfrastructureProvider.azureNetDatasource);
		}
	}),
	{ dependsOn: { InfrastructureProvider } }
);

export const ApplicationProvider = createBoundaryProvider(
	'ApplicationProvider',
	(deps) => ({
		authService: () => {
			return new AuthService(deps.RepositoryProvider.authRepository);
		}
	}),
	{ dependsOn: { RepositoryProvider, InfrastructureProvider } }
);
