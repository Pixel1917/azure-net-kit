import { createBoundaryProvider, UniversalCookie } from '$lib/index.js';
import { AzureNetRestDatasource } from '../../../../core/Datasource/index.js';
import { HttpService } from '$lib/core/infra/index.js';

export const DatasourceProvider = createBoundaryProvider('DatasourceProvider', {
	register: () => ({
		AzureNetRestDatasource: () =>
			new AzureNetRestDatasource({
				http: new HttpService({
					baseUrl: `https://api-laravel.azure-net.ru/back`,
					onRequest: (options) => {
						const token = UniversalCookie.get('token');
						if (token) {
							options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
						}
					}
				})
			})
	})
});
