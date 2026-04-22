import { MockApiDatasource } from '../datasources/index.js';
import { createHttpServiceInstance } from '$lib/core/infra/index.js';
import { createBoundaryProvider, UniversalCookie } from '$lib/core/index.js';

export const DatasourceProvider = createBoundaryProvider('CoreDatasourceProvider', {
	register: () => ({
		KosmoPartsRest: () =>
			new MockApiDatasource({
				http: createHttpServiceInstance({
					prefixUrl: 'https://cb784374e7b649a4b5ced37b17042896.fake-api.io',
					retry: 3,
					onRequest: (request) => {
						request.headers.set('X-Custom', 'Custom');
						const token = UniversalCookie.get('mock-token');
						if (token) {
							request.headers.set('Authorization', `Bearer ${token}`);
						}
					}
				})
			})
	})
});
